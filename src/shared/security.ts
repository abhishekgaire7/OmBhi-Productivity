export const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
export const SAFE_ID_REGEX = /^[a-zA-Z0-9_\-]{1,128}$/;
export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_24H_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

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

export function isSourceMapPath(pathname: string): boolean {
  return pathname.toLowerCase().endsWith('.map');
}

export function getSecurityHeaders(pathname: string): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  };

  if (pathname.startsWith('/api')) {
    headers['Content-Security-Policy'] = "default-src 'none'; frame-ancestors 'none'";
    headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, private';
    headers['Pragma'] = 'no-cache';
  }

  return headers;
}

export function normalizeOrigin(originOrUrl: string): string | null {
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

export function parseStaticAllowedOrigins(allowedOriginsEnv?: string, appUrlEnv?: string): string[] {
  const staticOrigins: string[] = [];
  const rawList = [allowedOriginsEnv || '', appUrlEnv || '']
    .join(',')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const candidate of rawList) {
    const norm = normalizeOrigin(candidate);
    if (norm) staticOrigins.push(norm);
  }
  return staticOrigins;
}

export function buildAllowedOriginsSet(params: {
  host?: string | null;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  protocol?: string | null;
  staticOrigins: string[];
}): Set<string> {
  const allowed = new Set<string>(params.staticOrigins);

  const host = params.forwardedHost || params.host;
  const proto = (params.forwardedProto || params.protocol || 'https').split(',')[0].trim();
  if (host) {
    const cleanHost = host.split(',')[0].trim();
    const derived = normalizeOrigin(`${proto}://${cleanHost}`);
    if (derived) allowed.add(derived);
    const httpDerived = normalizeOrigin(`http://${cleanHost}`);
    if (httpDerived) allowed.add(httpDerived);
    const httpsDerived = normalizeOrigin(`https://${cleanHost}`);
    if (httpsDerived) allowed.add(httpsDerived);
  }

  return allowed;
}

export interface CorsCsrfEvalResult {
  allowed: boolean;
  isPreflight?: boolean;
  status?: number;
  errorBody?: {
    success: false;
    error: string;
    code: string;
  };
  headers: Record<string, string>;
}

/**
 * Framework-agnostic strict CORS & CSRF evaluator for /api/* routes:
 * - Never uses wildcard Access-Control-Allow-Origin: *
 * - Validates Origin and Referer against same-origin + explicit allowlist
 * - Enforces application/json Content-Type on state-changing requests
 */
export function evaluateCorsAndCsrf(params: {
  method: string;
  originHeader?: string | null;
  refererHeader?: string | null;
  contentTypeHeader?: string | null;
  allowedOrigins: Set<string>;
}): CorsCsrfEvalResult {
  const headers: Record<string, string> = {};
  const method = params.method.toUpperCase();

  if (params.originHeader) {
    const normalized = normalizeOrigin(params.originHeader);
    if (!normalized || !params.allowedOrigins.has(normalized)) {
      return {
        allowed: false,
        status: 403,
        errorBody: {
          success: false,
          error: 'Forbidden: Origin is not allowed by CORS policy.',
          code: 'CORS_ORIGIN_DENIED',
        },
        headers,
      };
    }
    headers['Access-Control-Allow-Origin'] = normalized;
    headers['Vary'] = 'Origin';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type, X-Requested-With';
    headers['Access-Control-Max-Age'] = '600';
  }

  if (method === 'OPTIONS') {
    return {
      allowed: true,
      isPreflight: true,
      status: 204,
      headers,
    };
  }

  const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  if (isStateChanging) {
    if (!params.originHeader && params.refererHeader) {
      const refOrigin = normalizeOrigin(params.refererHeader);
      if (!refOrigin || !params.allowedOrigins.has(refOrigin)) {
        return {
          allowed: false,
          status: 403,
          errorBody: {
            success: false,
            error: 'Forbidden: Cross-site request blocked by CSRF policy.',
            code: 'CSRF_REFERER_DENIED',
          },
          headers,
        };
      }
    }

    const contentType = (params.contentTypeHeader || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      return {
        allowed: false,
        status: 415,
        errorBody: {
          success: false,
          error: 'Unsupported Media Type: Content-Type must be application/json.',
          code: 'UNSUPPORTED_MEDIA_TYPE',
        },
        headers,
      };
    }
  }

  return {
    allowed: true,
    headers,
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
