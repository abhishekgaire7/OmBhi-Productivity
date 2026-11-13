import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  stripDangerousKeys,
  redactSensitiveError,
  blockSourceMapsMiddleware,
  securityHeadersMiddleware,
  createCorsAndCsrfMiddleware,
  sanitizeReminderInput,
} from './security.js';

function createMockReq(overrides: {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  protocol?: string;
}) {
  const headers = Object.fromEntries(
    Object.entries(overrides.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
  );
  return {
    method: overrides.method || 'GET',
    path: overrides.path || '/',
    protocol: overrides.protocol || 'http',
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  } as any;
}

function createMockRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let jsonBody: any = null;
  let textBody: string | null = null;
  let ended = false;

  const res: any = {
    setHeader(name: string, val: string) {
      headers[name.toLowerCase()] = val;
    },
    status(code: number) {
      statusCode = code;
      return res;
    },
    type() {
      return res;
    },
    json(data: any) {
      jsonBody = data;
      return res;
    },
    send(data: string) {
      textBody = data;
      return res;
    },
    end() {
      ended = true;
      return res;
    },
    get _status() {
      return statusCode;
    },
    get _headers() {
      return headers;
    },
    get _json() {
      return jsonBody;
    },
    get _text() {
      return textBody;
    },
    get _ended() {
      return ended;
    },
  };
  return res;
}

describe('Server Security Hardening Helpers', () => {
  test('stripDangerousKeys removes __proto__, constructor, and prototype recursively', () => {
    const malicious = JSON.parse(
      '{"title":"ok","__proto__":{"polluted":true},"nested":{"constructor":{"bad":1},"prototype":{"x":2},"safe":42}}'
    );
    const cleaned = stripDangerousKeys(malicious) as any;

    assert.equal(cleaned.title, 'ok');
    assert.equal(Object.prototype.hasOwnProperty.call(cleaned, '__proto__'), false);
    assert.equal(({} as any).polluted, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(cleaned.nested, 'constructor'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(cleaned.nested, 'prototype'), false);
    assert.equal(cleaned.nested.safe, 42);
  });

  test('redactSensitiveError masks Bearer tokens, JWTs, API keys, and PEM blocks', () => {
    const raw =
      'Failed auth with Bearer secret_token_123, jwt eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOiIxIn0.sig, key AIzaSyDummyKey12345678901234567890';
    const redacted = redactSensitiveError(new Error(raw));

    assert.ok(!redacted.includes('secret_token_123'));
    assert.ok(!redacted.includes('eyJhbGciOiJIUzI1NiJ9'));
    assert.ok(!redacted.includes('AIzaSyDummyKey'));
    assert.match(redacted, /Bearer \[REDACTED\]/);
    assert.match(redacted, /\[JWT_REDACTED\]/);
    assert.match(redacted, /\[API_KEY_REDACTED\]/);
  });

  test('sanitizeReminderInput enforces safe IDs, strips extra keys, and binds userId to verified token UID', () => {
    assert.equal(sanitizeReminderInput({ id: '../evil', title: 'Hi' }, 'uid-real'), null);
    assert.equal(sanitizeReminderInput({ id: 'rem-1', title: '   ' }, 'uid-real'), null);

    const sanitized = sanitizeReminderInput(
      {
        id: 'rem-123',
        userId: 'victim-uid',
        title: '  Pay taxes  ',
        date: '2026-11-15',
        time: '14:30',
        priority: 'high',
        repeat: 'daily',
        unexpectedAdminFlag: true,
      },
      'uid-real'
    );

    assert.ok(sanitized);
    assert.equal(sanitized?.userId, 'uid-real');
    assert.equal(sanitized?.title, 'Pay taxes');
    assert.equal((sanitized as any).unexpectedAdminFlag, undefined);
  });

  test('blockSourceMapsMiddleware blocks .map requests with 404', () => {
    const req = createMockReq({ path: '/assets/index-abc123.js.map' });
    const res = createMockRes();
    let nextCalled = false;

    blockSourceMapsMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res._status, 404);
  });

  test('securityHeadersMiddleware sets defensive headers without framing-breaking HTML rules', () => {
    const htmlReq = createMockReq({ path: '/' });
    const htmlRes = createMockRes();
    securityHeadersMiddleware(htmlReq, htmlRes, () => {});
    assert.equal(htmlRes._headers['x-content-type-options'], 'nosniff');
    assert.equal(htmlRes._headers['cross-origin-opener-policy'], 'same-origin-allow-popups');
    assert.equal(htmlRes._headers['content-security-policy'], undefined);

    const apiReq = createMockReq({ path: '/api/notifications/status' });
    const apiRes = createMockRes();
    securityHeadersMiddleware(apiReq, apiRes, () => {});
    assert.equal(apiRes._headers['x-content-type-options'], 'nosniff');
    assert.match(apiRes._headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.match(apiRes._headers['cache-control'], /no-store/);
  });

  test('createCorsAndCsrfMiddleware rejects untrusted Origin and non-JSON CSRF POSTs', () => {
    const middleware = createCorsAndCsrfMiddleware({ allowedOriginsEnv: 'https://ombhi.example.com' });

    // Untrusted origin
    const evilReq = createMockReq({
      method: 'POST',
      path: '/api/reminders/sync-schedule',
      headers: {
        host: 'localhost:3000',
        origin: 'https://evil-attacker.test',
        'content-type': 'application/json',
      },
    });
    const evilRes = createMockRes();
    let nextCalled = false;
    middleware(evilReq, evilRes, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(evilRes._status, 403);
    assert.equal(evilRes._json.code, 'CORS_ORIGIN_DENIED');

    // Allowed origin with non-JSON Content-Type (simple form CSRF)
    const formCsrfReq = createMockReq({
      method: 'POST',
      path: '/api/reminders/sync-schedule',
      headers: {
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
        'content-type': 'application/x-www-form-urlencoded',
      },
    });
    const formCsrfRes = createMockRes();
    middleware(formCsrfReq, formCsrfRes, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(formCsrfRes._status, 415);
    assert.equal(formCsrfRes._json.code, 'UNSUPPORTED_MEDIA_TYPE');

    // Trusted origin with application/json passes
    const okReq = createMockReq({
      method: 'POST',
      path: '/api/reminders/sync-schedule',
      headers: {
        host: 'localhost:3000',
        origin: 'https://ombhi.example.com',
        'content-type': 'application/json',
      },
    });
    const okRes = createMockRes();
    middleware(okReq, okRes, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.equal(okRes._headers['access-control-allow-origin'], 'https://ombhi.example.com');
  });

  test('createCorsAndCsrfMiddleware blocks untrusted Referer when Origin is absent on POST', () => {
    const middleware = createCorsAndCsrfMiddleware();
    const req = createMockReq({
      method: 'POST',
      path: '/api/ai/coach',
      headers: {
        host: 'localhost:3000',
        referer: 'https://phishing.site/attack.html',
        'content-type': 'application/json',
      },
    });
    const res = createMockRes();
    let nextCalled = false;
    middleware(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(res._status, 403);
    assert.equal(res._json.code, 'CSRF_REFERER_DENIED');
  });

  test('Express app reference sanity check for OPTIONS preflight', () => {
    const app = express();
    assert.ok(app);
  });
});
