import type { Request, Response, NextFunction } from 'express';

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SAFE_ID_REGEX = /^[a-zA-Z0-9_\-]{1,128}$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_24H_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Recursively strips prototype-pollution keys (__proto__, constructor, prototype)
 * and enforces bounded object depth to prevent stack exhaustion.
 */
export function stripDangerousKeys<T>(input: T, depth = 0): T {
  if (depth > 15 || input === null || typeof input !== 'object') {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => stripDangerousKeys(item, depth + 1)) as unknown as T;
  }

  const clean: Record<string, unknown> = Object.create(null);
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.has(key)) {
      continue;
    }
    clean[key] = stripDangerousKeys(value, depth + 1);
  }
  return Object.assign({}, clean) as T;
}

/**
 * Redacts potentially sensitive details (JWTs, API keys, service account fields) from error strings.
 */
export function redactSensitiveError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Internal error';
  return raw
    .replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, 'Bearer [REDACTED]')
    .replace(/eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*/g, '[JWT_REDACTED]')
    .replace(/AIza[0-9A-Za-z\-_]{20,}/g, '[API_KEY_REDACTED]')
    .replace(/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, '[PRIVATE_KEY_REDACTED]');
}

/**
 * Blocks any requests for JavaScript/CSS source map files so internal source code is never exposed.
 */
export function blockSourceMapsMiddleware(req: Request, res: Response, next: NextFunction) {
  const reqPath = (req.path || '').toLowerCase();
  if (reqPath.endsWith('.map')) {
    return res.status(404).type('text/plain').send('Not Found');
  }
  return next();
}

/**
 * Sets defensive security headers (anti-MIME-sniffing, referrer policy, COOP, CSP for APIs).
 * Preserves iframe embedding for the web shell and popups for Google Sign-In.
 */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

  if (req.path.startsWith('/api')) {
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
  }
  return next();
}

function normalizeOrigin(originOrUrl: string): string | null {
  try {
    const parsed = new URL(originOrUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function buildAllowedOrigins(req: Request, extraOrigins: string[]): Set<string> {
  const allowed = new Set<string>(extraOrigins);

  const host = req.get('x-forwarded-host') || req.get('host');
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  if (host) {
    const cleanHost = host.split(',')[0].trim();
    const derived = normalizeOrigin(`${proto}://${cleanHost}`);
    if (derived) allowed.add(derived);
    // Also support http/https variant for local dev
    const httpDerived = normalizeOrigin(`http://${cleanHost}`);
    if (httpDerived) allowed.add(httpDerived);
    const httpsDerived = normalizeOrigin(`https://${cleanHost}`);
    if (httpsDerived) allowed.add(httpsDerived);
  }

  return allowed;
}

/**
 * Strict CORS & CSRF protection middleware for /api/* routes:
 * - Never uses wildcard Access-Control-Allow-Origin: *
 * - Validates Origin and Referer against same-origin + explicit allowlist
 * - Enforces application/json Content-Type on state-changing requests (blocks HTML form CSRF)
 */
export function createCorsAndCsrfMiddleware(options?: { allowedOriginsEnv?: string; appUrlEnv?: string }) {
  const staticOrigins: string[] = [];
  const rawList = [options?.allowedOriginsEnv || '', options?.appUrlEnv || '']
    .join(',')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const candidate of rawList) {
    const norm = normalizeOrigin(candidate);
    if (norm) staticOrigins.push(norm);
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const allowedOrigins = buildAllowedOrigins(req, staticOrigins);
    const originHeader = req.get('origin');

    if (originHeader) {
      const normalized = normalizeOrigin(originHeader);
      if (!normalized || !allowedOrigins.has(normalized)) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: Origin is not allowed by CORS policy.',
          code: 'CORS_ORIGIN_DENIED',
        });
      }
      res.setHeader('Access-Control-Allow-Origin', normalized);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With');
      res.setHeader('Access-Control-Max-Age', '600');
    }

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    // CSRF defense-in-depth on state-changing methods
    const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase());
    if (isStateChanging) {
      // Check Referer if Origin wasn't sent by browser
      const refererHeader = req.get('referer');
      if (!originHeader && refererHeader) {
        const refOrigin = normalizeOrigin(refererHeader);
        if (!refOrigin || !allowedOrigins.has(refOrigin)) {
          return res.status(403).json({
            success: false,
            error: 'Forbidden: Cross-site request blocked by CSRF policy.',
            code: 'CSRF_REFERER_DENIED',
          });
        }
      }

      // Enforce application/json to prevent simple form/text CSRF submissions
      const contentType = (req.get('content-type') || '').toLowerCase();
      if (!contentType.includes('application/json')) {
        return res.status(415).json({
          success: false,
          error: 'Unsupported Media Type: Content-Type must be application/json.',
          code: 'UNSUPPORTED_MEDIA_TYPE',
        });
      }
    }

    return next();
  };
}

export interface SanitizedReminderItem {
  id: string;
  userId: string;
  title: string;
  description?: string;
  date: string;
  time: string;
  categoryId?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  repeat: 'never' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  customRepeatDays?: number[];
  notificationMethod: 'in_app' | 'email' | 'both';
  completed: boolean;
  completedAt?: string;
  snoozedUntil?: string;
  lastNotifiedAt?: string;
  timezone?: string;
  createdAt?: string;
  updatedAt?: string;
}

const VALID_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);
const VALID_REPEATS = new Set(['never', 'daily', 'weekly', 'monthly', 'yearly', 'custom']);

/**
 * Strictly validates and allowlists reminder fields and unconditionally binds userId to the verified UID.
 */
export function sanitizeReminderInput(raw: unknown, verifiedUserId: string): SanitizedReminderItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const r = stripDangerousKeys(raw as Record<string, unknown>);
  const rawId = typeof r.id === 'string' ? r.id.trim() : '';
  if (!SAFE_ID_REGEX.test(rawId)) {
    return null;
  }

  const title = typeof r.title === 'string' ? r.title.trim().slice(0, 200) : '';
  if (!title) {
    return null;
  }

  const date = typeof r.date === 'string' && ISO_DATE_REGEX.test(r.date.trim())
    ? r.date.trim()
    : new Date().toISOString().split('T')[0];

  const time = typeof r.time === 'string' && TIME_24H_REGEX.test(r.time.trim())
    ? r.time.trim()
    : '09:00';

  const priority = typeof r.priority === 'string' && VALID_PRIORITIES.has(r.priority)
    ? (r.priority as SanitizedReminderItem['priority'])
    : 'medium';

  const repeat = typeof r.repeat === 'string' && VALID_REPEATS.has(r.repeat)
    ? (r.repeat as SanitizedReminderItem['repeat'])
    : 'never';

  const customRepeatDays = Array.isArray(r.customRepeatDays)
    ? r.customRepeatDays
        .filter((d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6)
        .slice(0, 7)
    : undefined;

  const item: SanitizedReminderItem = {
    id: rawId,
    userId: verifiedUserId,
    title,
    date,
    time,
    priority,
    repeat,
    notificationMethod: 'in_app',
    completed: Boolean(r.completed),
  };

  if (typeof r.description === 'string' && r.description.trim()) {
    item.description = r.description.trim().slice(0, 2000);
  }
  if (typeof r.categoryId === 'string' && SAFE_ID_REGEX.test(r.categoryId.trim())) {
    item.categoryId = r.categoryId.trim();
  }
  if (customRepeatDays && customRepeatDays.length > 0) {
    item.customRepeatDays = customRepeatDays;
  }
  if (typeof r.completedAt === 'string' && r.completedAt.length <= 64) {
    item.completedAt = r.completedAt;
  }
  if (typeof r.snoozedUntil === 'string' && r.snoozedUntil.length <= 64) {
    item.snoozedUntil = r.snoozedUntil;
  }
  if (typeof r.lastNotifiedAt === 'string' && r.lastNotifiedAt.length <= 64) {
    item.lastNotifiedAt = r.lastNotifiedAt;
  }
  if (typeof r.timezone === 'string' && r.timezone.trim().length <= 80) {
    item.timezone = r.timezone.trim();
  }
  if (typeof r.createdAt === 'string' && r.createdAt.length <= 64) {
    item.createdAt = r.createdAt;
  }
  if (typeof r.updatedAt === 'string' && r.updatedAt.length <= 64) {
    item.updatedAt = r.updatedAt;
  }

  return item;
}
