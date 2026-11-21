import { SAFE_ID_REGEX } from '../shared/security';
import { getGoogleAccessToken } from './googleAuth';
import { DecodedFirebaseToken, WorkerEnv } from './types';

const FIREBASE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const DEFAULT_PROJECT_ID = 'ombhi-a81ae';

interface JwkEntry {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n: string;
  e: string;
}

interface JwksCacheEntry {
  keys: Map<string, CryptoKey>;
  expiresAtMs: number;
}

let inMemoryJwksCache: JwksCacheEntry | null = null;

export function parseBearerToken(authHeader?: string | null): { token?: string; error?: string } {
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

function base64UrlToUint8Array(input: string): Uint8Array<ArrayBuffer> {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlToJson<T>(input: string): T {
  const bytes = base64UrlToUint8Array(input);
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text) as T;
}

function parseMaxAgeSeconds(cacheControl: string | null): number {
  if (!cacheControl) return 3600;
  const match = cacheControl.match(/max-age=(\d+)/i);
  if (!match) return 3600;
  const parsed = parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 60 ? parsed : 3600;
}

async function fetchFirebaseJwks(
  forceRefresh: boolean,
  fetchImpl: typeof fetch
): Promise<Map<string, CryptoKey>> {
  const nowMs = Date.now();
  if (!forceRefresh && inMemoryJwksCache && inMemoryJwksCache.expiresAtMs > nowMs) {
    return inMemoryJwksCache.keys;
  }

  let response: Response | undefined;
  const cfCache =
    typeof caches !== 'undefined' && (caches as unknown as { default?: Cache }).default
      ? (caches as unknown as { default: Cache }).default
      : null;

  if (!forceRefresh && cfCache) {
    const cached = await cfCache.match(FIREBASE_JWKS_URL).catch(() => undefined);
    if (cached) {
      response = cached;
    }
  }

  if (!response) {
    const fresh = await fetchImpl(FIREBASE_JWKS_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!fresh.ok) {
      throw new Error(`Failed to fetch Firebase public JWKS (${fresh.status})`);
    }
    if (cfCache) {
      await cfCache.put(FIREBASE_JWKS_URL, fresh.clone()).catch(() => {});
    }
    response = fresh;
  }

  const maxAgeSec = parseMaxAgeSeconds(response.headers.get('cache-control'));
  const jwksBody = (await response.json()) as { keys?: JwkEntry[] };
  if (!jwksBody || !Array.isArray(jwksBody.keys)) {
    throw new Error('Invalid Firebase JWKS response payload.');
  }

  const imported = new Map<string, CryptoKey>();
  for (const jwk of jwksBody.keys) {
    if (!jwk.kid || jwk.kty !== 'RSA') continue;
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: jwk.alg || 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    imported.set(jwk.kid, key);
  }

  inMemoryJwksCache = {
    keys: imported,
    expiresAtMs: Date.now() + maxAgeSec * 1000,
  };
  return imported;
}

async function checkFirebaseTokenRevocation(params: {
  uid: string;
  authTimeSec: number;
  projectId: string;
  serviceAccountJson: string;
  fetchImpl: typeof fetch;
}): Promise<void> {
  const accessToken = await getGoogleAccessToken(params.serviceAccountJson, params.fetchImpl);
  const lookupUrl = `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(
    params.projectId
  )}/accounts:lookup`;

  const response = await params.fetchImpl(lookupUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ localId: [params.uid] }),
  });

  if (!response.ok) {
    const err = new Error(`Identity Toolkit lookup failed (${response.status})`) as Error & { code?: string };
    err.code = 'AUTH_SERVICE_UNAVAILABLE';
    throw err;
  }

  const data = (await response.json()) as {
    users?: Array<{ localId?: string; disabled?: boolean; validSince?: string }>;
  };

  const userRecord = data.users?.[0];
  if (!userRecord) {
    const err = new Error('User record not found.') as Error & { code?: string };
    err.code = 'auth/user-not-found';
    throw err;
  }

  if (userRecord.disabled) {
    const err = new Error('User account has been disabled.') as Error & { code?: string };
    err.code = 'auth/user-disabled';
    throw err;
  }

  if (userRecord.validSince) {
    const validSinceSec = Number(userRecord.validSince);
    if (Number.isFinite(validSinceSec) && params.authTimeSec < validSinceSec) {
      const err = new Error('Token has been revoked.') as Error & { code?: string };
      err.code = 'auth/id-token-revoked';
      throw err;
    }
  }
}

export interface VerifyTokenOptions {
  checkRevoked?: boolean;
  fetchImpl?: typeof fetch;
  nowSec?: number;
}

export class FirebaseAuthError extends Error {
  code: string;
  httpStatus: number;
  constructor(message: string, code: string, httpStatus = 401) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/**
 * Verifies a Firebase ID Token JWT in Cloudflare Workers via Web Crypto RS256 + JWKS + Identity Toolkit revocation check.
 * Preserves fail-closed guarantees matching src/server/auth.ts.
 */
export async function verifyFirebaseIdTokenWorker(
  token: string,
  env: WorkerEnv,
  options: VerifyTokenOptions = {}
): Promise<DecodedFirebaseToken> {
  const projectId = (env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID).trim();
  const fetchImpl = options.fetchImpl || fetch;
  const checkRevoked = options.checkRevoked !== false;
  const nowSec = options.nowSec ?? Math.floor(Date.now() / 1000);

  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON || !env.FIREBASE_SERVICE_ACCOUNT_JSON.trim()) {
    throw new FirebaseAuthError(
      'Unauthorized: Server authentication service is unavailable. Server credentials must be configured.',
      'AUTH_SERVICE_UNAVAILABLE',
      401
    );
  }

  const segments = token.split('.');
  if (segments.length !== 3) {
    throw new FirebaseAuthError('Unauthorized: Invalid or expired token.', 'auth/argument-error', 401);
  }

  let header: { alg?: string; kid?: string };
  let payload: Record<string, unknown>;
  let signatureBytes: Uint8Array<ArrayBuffer>;

  try {
    header = base64UrlToJson<{ alg?: string; kid?: string }>(segments[0]);
    payload = base64UrlToJson<Record<string, unknown>>(segments[1]);
    signatureBytes = base64UrlToUint8Array(segments[2]);
  } catch {
    throw new FirebaseAuthError('Unauthorized: Invalid or expired token.', 'auth/argument-error', 401);
  }

  if (header.alg !== 'RS256' || !header.kid || typeof header.kid !== 'string') {
    throw new FirebaseAuthError('Unauthorized: Invalid or expired token.', 'auth/argument-error', 401);
  }

  // Validate claims per Firebase ID token verification specification
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  const exp = typeof payload.exp === 'number' ? payload.exp : 0;
  const iat = typeof payload.iat === 'number' ? payload.iat : 0;
  const authTime = typeof payload.auth_time === 'number' ? payload.auth_time : 0;
  const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';

  if (exp <= nowSec) {
    throw new FirebaseAuthError(
      'Unauthorized: Token has expired. Please refresh your session.',
      'auth/id-token-expired',
      401
    );
  }
  if (iat > nowSec + 300 || authTime > nowSec + 300) {
    throw new FirebaseAuthError('Unauthorized: Invalid token timestamp.', 'auth/argument-error', 401);
  }
  if (payload.aud !== projectId || payload.iss !== expectedIssuer) {
    throw new FirebaseAuthError('Unauthorized: Invalid token audience or issuer.', 'auth/invalid-id-token', 401);
  }
  if (!sub || !SAFE_ID_REGEX.test(sub)) {
    throw new FirebaseAuthError('Unauthorized: Invalid token payload.', 'UNAUTHORIZED_INVALID_TOKEN', 401);
  }

  // Verify RS256 cryptographic signature against cached Google JWKS (retry once on key rotation)
  let keys = await fetchFirebaseJwks(false, fetchImpl);
  let verifyKey = keys.get(header.kid);
  if (!verifyKey) {
    keys = await fetchFirebaseJwks(true, fetchImpl);
    verifyKey = keys.get(header.kid);
  }
  if (!verifyKey) {
    throw new FirebaseAuthError('Unauthorized: Invalid or expired token.', 'auth/invalid-id-token', 401);
  }

  const signingStr = `${segments[0]}.${segments[1]}`;
  const signingBuffer = new ArrayBuffer(signingStr.length);
  const signingInput = new Uint8Array(signingBuffer);
  for (let i = 0; i < signingStr.length; i++) {
    signingInput[i] = signingStr.charCodeAt(i);
  }

  const isValidSig = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    verifyKey,
    signatureBytes,
    signingInput
  );

  if (!isValidSig) {
    throw new FirebaseAuthError('Unauthorized: Invalid or expired token.', 'auth/invalid-id-token', 401);
  }

  if (checkRevoked) {
    try {
      await checkFirebaseTokenRevocation({
        uid: sub,
        authTimeSec: authTime,
        projectId,
        serviceAccountJson: env.FIREBASE_SERVICE_ACCOUNT_JSON,
        fetchImpl,
      });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || 'AUTH_SERVICE_UNAVAILABLE';
      if (code === 'auth/id-token-revoked') {
        throw new FirebaseAuthError(
          'Unauthorized: Token has been revoked. Please re-authenticate.',
          'auth/id-token-revoked',
          401
        );
      }
      if (code === 'auth/user-disabled' || code === 'auth/user-not-found') {
        throw new FirebaseAuthError('Unauthorized: Account is disabled or unavailable.', code, 401);
      }
      throw new FirebaseAuthError(
        'Unauthorized: Server authentication service is unavailable. Server credentials must be configured.',
        'AUTH_SERVICE_UNAVAILABLE',
        401
      );
    }
  }

  const firebaseClaims =
    payload.firebase && typeof payload.firebase === 'object'
      ? (payload.firebase as DecodedFirebaseToken['firebase'])
      : undefined;

  const decoded: DecodedFirebaseToken = {
    uid: sub,
    sub,
    aud: String(payload.aud),
    iss: String(payload.iss),
    exp,
    iat,
    auth_time: authTime,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    email_verified: typeof payload.email_verified === 'boolean' ? payload.email_verified : undefined,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    picture: typeof payload.picture === 'string' ? payload.picture : undefined,
    firebase: firebaseClaims,
  };

  if (env.REQUIRE_MFA === 'true' && !decoded.firebase?.sign_in_second_factor) {
    throw new FirebaseAuthError(
      'Forbidden: Multi-factor authentication is required for this resource.',
      'MFA_REQUIRED',
      403
    );
  }

  return decoded;
}

export function resetFirebaseJwksCacheForTests(): void {
  inMemoryJwksCache = null;
}
