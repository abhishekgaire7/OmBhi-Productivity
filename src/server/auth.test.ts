import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBearerToken, createRateLimiter } from './auth';

test('parseBearerToken rejects undefined and null headers', () => {
  assert.equal(parseBearerToken(undefined).error, 'Missing Authorization header.');
  assert.equal(parseBearerToken('').error, 'Missing Authorization header.');
});

test('parseBearerToken rejects non-Bearer schemes', () => {
  const basic = parseBearerToken('Basic dXNlcjpwYXNz');
  assert.match(basic.error || '', /Malformed Authorization header/);

  const raw = parseBearerToken('token123');
  assert.match(raw.error || '', /Malformed Authorization header/);
});

test('parseBearerToken rejects empty Bearer tokens', () => {
  const empty = parseBearerToken('Bearer    ');
  assert.equal(empty.error, 'Empty Bearer token provided.');
});

test('parseBearerToken correctly extracts valid token string', () => {
  const result = parseBearerToken('Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature');
  assert.equal(result.token, 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature');
  assert.equal(result.error, undefined);
});

test('createRateLimiter allows requests up to threshold and blocks subsequent ones', () => {
  const limiter = createRateLimiter({
    windowMs: 60000,
    maxRequests: 3,
    message: 'Rate limit test exceeded',
  });

  const req: any = { userId: 'test-user-123', headers: {} };
  let passedCount = 0;
  let rejected = false;
  let statusCode = 200;
  let responseBody: any = null;

  const res: any = {
    setHeader: () => {},
    status: (code: number) => {
      statusCode = code;
      return {
        json: (body: any) => {
          responseBody = body;
        },
      };
    },
  };

  const next = () => {
    passedCount++;
  };

  // First 3 requests should pass
  limiter(req, res, next);
  limiter(req, res, next);
  limiter(req, res, next);
  assert.equal(passedCount, 3);

  // 4th request must be rejected with 429
  limiter(req, res, next);
  assert.equal(passedCount, 3);
  assert.equal(statusCode, 429);
  assert.equal(responseBody?.code, 'RATE_LIMIT_EXCEEDED');
});

test('createRateLimiter isolates rate limits per user', () => {
  const limiter = createRateLimiter({
    windowMs: 60000,
    maxRequests: 1,
  });

  let user1Passed = 0;
  let user2Passed = 0;

  const res: any = {
    setHeader: () => {},
    status: () => ({ json: () => {} }),
  };

  limiter({ userId: 'user-1', headers: {} } as any, res, () => user1Passed++);
  limiter({ userId: 'user-2', headers: {} } as any, res, () => user2Passed++);

  assert.equal(user1Passed, 1);
  assert.equal(user2Passed, 1);
});
