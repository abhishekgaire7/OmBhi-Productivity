import type { Request, Response, NextFunction } from 'express';
import { initializeApp, getApps, cert, applicationDefault, App } from 'firebase-admin/app';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';
import fs from 'node:fs';

import { redactSensitiveError } from './security';

export interface AuthenticatedRequest extends Request {
  user?: DecodedIdToken;
  userId?: string;
  mfaVerified?: boolean;
}

let firebaseAdminApp: App | null = null;
let firebaseAdminInitError: string | null = null;

/**
 * Extracts and validates the Bearer token string from an Authorization header.
 */
export function parseBearerToken(authHeader?: string): { token?: string; error?: string } {
  if (!authHeader) {
    return { error: 'Missing Authorization header.' };
  }
  if (!authHeader.startsWith('Bearer ')) {
    return { error: 'Malformed Authorization header. Format must be "Bearer <token>".' };
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return { error: 'Empty Bearer token provided.' };
  }
  return { token };
}

/**
 * Initializes Firebase Admin SDK singleton once.
 * Supports:
 * 1. FIREBASE_SERVICE_ACCOUNT_JSON env var (inline minified JSON string or file path)
 * 2. Application Default Credentials (ADC) where running inside GCP/Cloud Run
 * Fails closed if initialization is impossible.
 */
export function initializeFirebaseAdmin(projectIdOverride?: string): {
  app: App | null;
  error: string | null;
} {
  if (firebaseAdminApp) {
    return { app: firebaseAdminApp, error: null };
  }
  if (firebaseAdminInitError) {
    return { app: null, error: firebaseAdminInitError };
  }

  // Already initialized by default app?
  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    firebaseAdminApp = existingApps[0];
    return { app: firebaseAdminApp, error: null };
  }

  try {
    const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
    const projectId = projectIdOverride || process.env.GOOGLE_CLOUD_PROJECT || 'ombhi-a81ae';

    if (rawServiceAccount) {
      let serviceAccountCredentials: any;
      if (rawServiceAccount.startsWith('{')) {
        serviceAccountCredentials = JSON.parse(rawServiceAccount);
      } else if (fs.existsSync(rawServiceAccount)) {
        const fileContent = fs.readFileSync(rawServiceAccount, 'utf-8');
        serviceAccountCredentials = JSON.parse(fileContent);
      } else {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is neither valid JSON nor an accessible file path.');
      }

      firebaseAdminApp = initializeApp({
        credential: cert(serviceAccountCredentials),
        projectId: serviceAccountCredentials.project_id || projectId,
      });
      console.log('[Firebase Admin] Initialized with Service Account credentials.');
      return { app: firebaseAdminApp, error: null };
    }

    // Try Application Default Credentials (e.g. Cloud Run, GCP environment)
    try {
      firebaseAdminApp = initializeApp({
        credential: applicationDefault(),
        projectId,
      });
      console.log('[Firebase Admin] Initialized with Application Default Credentials.');
      return { app: firebaseAdminApp, error: null };
    } catch (adcError: unknown) {
      console.warn('[Firebase Admin] ADC initialization unavailable:', redactSensitiveError(adcError));
      throw new Error(
        'Firebase Admin could not be initialized. Please configure FIREBASE_SERVICE_ACCOUNT_JSON in your server environment.'
      );
    }
  } catch (err: unknown) {
    firebaseAdminInitError = redactSensitiveError(err);
    console.error('[Firebase Admin] Initialization failed (failing closed):', firebaseAdminInitError);
    return { app: null, error: firebaseAdminInitError };
  }
}

/**
 * Express middleware to verify Firebase ID tokens.
 * Rejects missing, invalid, or expired tokens with HTTP 401.
 * Fails closed if Firebase Admin is not initialized.
 */
export async function verifyFirebaseToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const { token, error: parseError } = parseBearerToken(req.headers.authorization);
  if (parseError || !token) {
    return res.status(401).json({
      success: false,
      error: `Unauthorized: ${parseError || 'Missing Bearer token'}`,
      code: 'UNAUTHORIZED_MISSING_TOKEN',
    });
  }

  const { app: adminApp } = initializeFirebaseAdmin();
  if (!adminApp) {
    console.error('[Auth Middleware] Fail-closed: Firebase Admin is uninitialized.');
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Server authentication service is unavailable. Server credentials must be configured.',
      code: 'AUTH_SERVICE_UNAVAILABLE',
    });
  }

  try {
    const auth = getAuth(adminApp);
    const decodedToken = await auth.verifyIdToken(token, true /* checkRevoked */);
    if (!decodedToken || !decodedToken.uid) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid token payload.',
        code: 'UNAUTHORIZED_INVALID_TOKEN',
      });
    }

    const mfaVerified = Boolean(decodedToken.firebase?.sign_in_second_factor);
    if (process.env.REQUIRE_MFA === 'true' && !mfaVerified) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Multi-factor authentication is required for this resource.',
        code: 'MFA_REQUIRED',
      });
    }

    req.user = decodedToken;
    req.userId = decodedToken.uid;
    req.mfaVerified = mfaVerified;
    return next();
  } catch (verifyErr: any) {
    const errCode = typeof verifyErr?.code === 'string' ? verifyErr.code : 'UNAUTHORIZED_TOKEN_VERIFICATION_FAILED';
    let userMsg = 'Unauthorized: Invalid or expired token.';
    if (errCode === 'auth/id-token-expired') {
      userMsg = 'Unauthorized: Token has expired. Please refresh your session.';
    } else if (errCode === 'auth/id-token-revoked') {
      userMsg = 'Unauthorized: Token has been revoked. Please re-authenticate.';
    }

    console.warn(`[Auth Middleware] Verification failed (${errCode})`);
    return res.status(401).json({
      success: false,
      error: userMsg,
      code: errCode,
    });
  }
}

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
}

const MAX_RATE_LIMIT_BUCKETS = 10000;

/**
 * In-memory sliding window rate limiter keyed by authenticated userId or client IP,
 * with expired-entry pruning to prevent unbounded memory growth.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const requests = new Map<string, { count: number; resetTime: number }>();

  const pruneExpired = (now: number) => {
    for (const [k, v] of requests.entries()) {
      if (now > v.resetTime) {
        requests.delete(k);
      }
    }
    if (requests.size >= MAX_RATE_LIMIT_BUCKETS) {
      // Evict oldest entry if cap reached
      const firstKey = requests.keys().next().value;
      if (firstKey !== undefined) {
        requests.delete(firstKey);
      }
    }
  };

  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const key = req.userId || req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const record = requests.get(key);

    if (!record || now > record.resetTime) {
      if (requests.size >= MAX_RATE_LIMIT_BUCKETS) {
        pruneExpired(now);
      }
      const resetTime = now + options.windowMs;
      requests.set(key, { count: 1, resetTime });
      res.setHeader('X-RateLimit-Limit', String(options.maxRequests));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, options.maxRequests - 1)));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetTime / 1000)));
      return next();
    }

    record.count++;
    const remaining = Math.max(0, options.maxRequests - record.count);
    res.setHeader('X-RateLimit-Limit', String(options.maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(record.resetTime / 1000)));

    if (record.count > options.maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        success: false,
        error: options.message || 'Too many requests. Please wait a moment before trying again.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSeconds: retryAfterSec,
      });
    }

    return next();
  };
}
