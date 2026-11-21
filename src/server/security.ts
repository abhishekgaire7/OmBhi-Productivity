import type { Request, Response, NextFunction } from 'express';
import {
  stripDangerousKeys,
  redactSensitiveError,
  sanitizeReminderInput,
  SanitizedReminderItem,
  isSourceMapPath,
  getSecurityHeaders,
  parseStaticAllowedOrigins,
  buildAllowedOriginsSet,
  evaluateCorsAndCsrf,
} from '../shared/security';

export {
  stripDangerousKeys,
  redactSensitiveError,
  sanitizeReminderInput,
  type SanitizedReminderItem,
};

/**
 * Blocks any requests for JavaScript/CSS source map files so internal source code is never exposed.
 */
export function blockSourceMapsMiddleware(req: Request, res: Response, next: NextFunction) {
  if (isSourceMapPath(req.path || '')) {
    return res.status(404).type('text/plain').send('Not Found');
  }
  return next();
}

/**
 * Sets defensive security headers (anti-MIME-sniffing, referrer policy, COOP, CSP for APIs).
 * Preserves iframe embedding for the web shell and popups for Google Sign-In.
 */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  const headers = getSecurityHeaders(req.path || '');
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  return next();
}

/**
 * Strict CORS & CSRF protection middleware for /api/* routes:
 * - Never uses wildcard Access-Control-Allow-Origin: *
 * - Validates Origin and Referer against same-origin + explicit allowlist
 * - Enforces application/json Content-Type on state-changing requests (blocks HTML form CSRF)
 */
export function createCorsAndCsrfMiddleware(options?: { allowedOriginsEnv?: string; appUrlEnv?: string }) {
  const staticOrigins = parseStaticAllowedOrigins(options?.allowedOriginsEnv, options?.appUrlEnv);

  return (req: Request, res: Response, next: NextFunction) => {
    const allowedOrigins = buildAllowedOriginsSet({
      host: req.get('host'),
      forwardedHost: req.get('x-forwarded-host'),
      forwardedProto: req.get('x-forwarded-proto'),
      protocol: req.protocol,
      staticOrigins,
    });

    const evalResult = evaluateCorsAndCsrf({
      method: req.method,
      originHeader: req.get('origin'),
      refererHeader: req.get('referer'),
      contentTypeHeader: req.get('content-type'),
      allowedOrigins,
    });

    for (const [k, v] of Object.entries(evalResult.headers)) {
      res.setHeader(k, v);
    }

    if (evalResult.isPreflight) {
      return res.status(204).end();
    }

    if (!evalResult.allowed && evalResult.status && evalResult.errorBody) {
      return res.status(evalResult.status).json(evalResult.errorBody);
    }

    return next();
  };
}
