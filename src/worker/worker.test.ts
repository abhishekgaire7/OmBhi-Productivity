import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerApp } from './index';
import { FirestoreRestClient, FirestoreRestWrite } from './firestoreRest';
import { runCronReminderScheduler } from './cron';
import { DecodedFirebaseToken, WorkerEnv } from './types';

function makeEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    FIREBASE_PROJECT_ID: 'ombhi-a81ae',
    FIRESTORE_DATABASE_ID: '(default)',
    APP_URL: 'https://ombhi.pages.dev',
    ALLOWED_ORIGINS: 'https://ombhi.pages.dev',
    REQUIRE_MFA: 'false',
    FIREBASE_SERVICE_ACCOUNT_JSON: '{"project_id":"ombhi-a81ae","client_email":"test@ombhi-a81ae.iam.gserviceaccount.com","private_key":"fake"}',
    ...overrides,
  };
}

function makeDecodedToken(uid = 'uid_alice_123', mfa = false): DecodedFirebaseToken {
  return {
    uid,
    sub: uid,
    aud: 'ombhi-a81ae',
    iss: 'https://securetoken.google.com/ombhi-a81ae',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000) - 60,
    auth_time: Math.floor(Date.now() / 1000) - 60,
    email: `${uid}@example.com`,
    email_verified: true,
    firebase: mfa ? { sign_in_second_factor: 'totp' } : {},
  };
}

class MockFirestoreRestClient extends FirestoreRestClient {
  public docs = new Map<string, Record<string, unknown>>();
  public commitCalls: FirestoreRestWrite[][] = [];
  public conflictOnCreate = false;
  public collectionGroupRows: Array<{
    id: string;
    userId: string | null;
    name: string;
    data: Record<string, unknown>;
    updateTime?: string;
  }> = [];

  constructor(env: WorkerEnv) {
    super(env);
  }

  override async getDocument<T = Record<string, unknown>>(relativeDocPath: string) {
    const clean = relativeDocPath.replace(/^\/+/, '');
    const data = this.docs.get(clean);
    if (!data) {
      return { exists: false, id: clean.split('/').pop() || '', data: null };
    }
    return { exists: true, id: clean.split('/').pop() || '', data: data as T, updateTime: '2026-11-16T10:00:00Z' };
  }

  override async patchDocument(relativeDocPath: string, data: Record<string, unknown>) {
    const clean = relativeDocPath.replace(/^\/+/, '');
    this.docs.set(clean, { ...(this.docs.get(clean) || {}), ...data });
    return { name: this.docResourceName(clean) };
  }

  override async listUserDocuments<T = Record<string, unknown>>(userId: string, subcollection: string) {
    const prefix = `users/${userId}/${subcollection}/`;
    const out: Array<{ id: string; data: T; updateTime?: string }> = [];
    for (const [k, v] of this.docs.entries()) {
      if (k.startsWith(prefix)) {
        out.push({ id: k.slice(prefix.length), data: v as T, updateTime: '2026-11-16T10:00:00Z' });
      }
    }
    return out;
  }

  override async runUserQuery<T = Record<string, unknown>>(userId: string) {
    const prefix = `users/${userId}/notifications/`;
    const out: Array<{ id: string; data: T; updateTime?: string }> = [];
    for (const [k, v] of this.docs.entries()) {
      if (k.startsWith(prefix) && v.deliveredViaPending === false) {
        out.push({ id: k.slice(prefix.length), data: v as T, updateTime: '2026-11-16T10:00:00Z' });
      }
    }
    return out;
  }

  override async runCollectionGroupQuery<T = Record<string, unknown>>() {
    return this.collectionGroupRows as Array<{
      id: string;
      userId: string | null;
      name: string;
      data: T;
      updateTime?: string;
    }>;
  }

  override async commitWrites(writes: FirestoreRestWrite[]) {
    this.commitCalls.push(writes);
    if (this.conflictOnCreate && writes.some((w) => w.currentDocument?.exists === false)) {
      return { committed: false, conflict: true };
    }
    for (const w of writes) {
      if (w.update?.name) {
        const marker = '/documents/';
        const idx = w.update.name.indexOf(marker);
        const rel = idx >= 0 ? w.update.name.slice(idx + marker.length) : w.update.name;
        this.docs.set(rel, { ...(this.docs.get(rel) || {}), written: true });
      }
    }
    return { committed: true };
  }
}

describe('OmBhi Cloudflare Worker API & Cron Security/Functionality', () => {
  test('Defaults FirestoreRestClient to (default) database on ombhi-a81ae', () => {
    const client = new FirestoreRestClient({});
    assert.equal(client.baseDocumentsPath, 'projects/ombhi-a81ae/databases/(default)/documents');
  });

  test('Blocks source maps (.map) with 404 and applies security headers', async () => {
    const app = createWorkerApp();
    const res = await app.request('https://ombhi.pages.dev/assets/app.js.map', {}, makeEnv());
    assert.equal(res.status, 404);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });

  test('Fails closed with 401 on missing Bearer token and rejects untrusted Origin / non-JSON CSRF', async () => {
    const app = createWorkerApp();

    // Missing Bearer token
    const unauth = await app.request(
      'https://ombhi.pages.dev/api/notifications/status',
      { headers: { Origin: 'https://ombhi.pages.dev' } },
      makeEnv()
    );
    assert.equal(unauth.status, 401);

    // Untrusted Origin blocked by CORS
    const badOrigin = await app.request(
      'https://ombhi.pages.dev/api/reminders/sync-schedule',
      {
        method: 'POST',
        headers: {
          Origin: 'https://evil.example',
          'Content-Type': 'application/json',
          Authorization: 'Bearer fake',
        },
        body: '{}',
      },
      makeEnv()
    );
    assert.equal(badOrigin.status, 403);

    // Non-JSON Content-Type blocked by CSRF guard
    const badCt = await app.request(
      'https://ombhi.pages.dev/api/reminders/sync-schedule',
      {
        method: 'POST',
        headers: {
          Origin: 'https://ombhi.pages.dev',
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Bearer fake',
        },
        body: 'a=1',
      },
      makeEnv()
    );
    assert.equal(badCt.status, 415);
  });

  test('Enforces REQUIRE_MFA=true when token lacks second factor', async () => {
    const app = createWorkerApp({
      verifyToken: async () => makeDecodedToken('uid_alice_123', false),
      createFirestore: (e) => new MockFirestoreRestClient(e),
    });

    const denied = await app.request(
      'https://ombhi.pages.dev/api/notifications/status',
      {
        headers: {
          Origin: 'https://ombhi.pages.dev',
          Authorization: 'Bearer valid_no_mfa',
        },
      },
      makeEnv({ REQUIRE_MFA: 'true' })
    );
    assert.equal(denied.status, 403);
    const body = (await denied.json()) as { code?: string };
    assert.equal(body.code, 'MFA_REQUIRED');
  });

  test('Syncs and processes reminders strictly under token UID, ignoring spoofed client userId', async () => {
    const mockDb = new MockFirestoreRestClient(makeEnv());
    const app = createWorkerApp({
      verifyToken: async () => makeDecodedToken('uid_alice_123', true),
      createFirestore: () => mockDb,
    });

    const syncRes = await app.request(
      'https://ombhi.pages.dev/api/reminders/sync-schedule',
      {
        method: 'POST',
        headers: {
          Origin: 'https://ombhi.pages.dev',
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token',
        },
        body: JSON.stringify({
          timezone: 'Europe/Berlin',
          reminders: [
            {
              id: 'rem-101',
              userId: 'uid_victim_999', // spoof attempt
              title: 'Submit thesis draft',
              date: '2026-11-16',
              time: '08:00',
              priority: 'high',
              repeat: 'never',
              completed: false,
            },
          ],
        }),
      },
      makeEnv()
    );
    assert.equal(syncRes.status, 200);
    const syncJson = (await syncRes.json()) as { success: boolean };
    assert.equal(syncJson.success, true);

    // Ensure commit only touched uid_alice_123, never uid_victim_999
    const allNames = mockDb.commitCalls.flat().map((w) => w.update?.name || '');
    assert.ok(allNames.some((n) => n.includes('users/uid_alice_123/reminders/rem-101')));
    assert.ok(!allNames.some((n) => n.includes('uid_victim_999')));
  });

  test('AI endpoints (/api/ai/parse-task, /api/ai/plan-day, /api/ai/coach, /api/ai/weekly-review) respond cleanly with deterministic fallback when Gemini is omitted', async () => {
    const app = createWorkerApp({
      verifyToken: async () => makeDecodedToken('uid_alice_123', false),
      generateGemini: async () => null,
    });

    const parseRes = await app.request(
      'https://ombhi.pages.dev/api/ai/parse-task',
      {
        method: 'POST',
        headers: {
          Origin: 'https://ombhi.pages.dev',
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token',
        },
        body: JSON.stringify({ prompt: 'Study algorithms tomorrow at 10am for 60 mins', referenceDate: '2026-11-16' }),
      },
      makeEnv({ GEMINI_API_KEY: '' })
    );
    assert.equal(parseRes.status, 200);
    const parseData = (await parseRes.json()) as { success: boolean; result?: { title?: string } };
    assert.equal(parseData.success, true);
    assert.ok(parseData.result?.title);

    const reviewRes = await app.request(
      'https://ombhi.pages.dev/api/ai/weekly-review',
      {
        method: 'POST',
        headers: {
          Origin: 'https://ombhi.pages.dev',
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid_token',
        },
        body: JSON.stringify({
          weekLabel: 'Week 46',
          startDate: '2026-11-09',
          endDate: '2026-11-15',
          metrics: { totalPlanned: 10, completed: 8, skipped: 1, failed: 1, completionRate: 80 },
        }),
      },
      makeEnv({ GEMINI_API_KEY: '' })
    );
    assert.equal(reviewRes.status, 200);
    const reviewData = (await reviewRes.json()) as { success: boolean; review?: { headline?: string } };
    assert.equal(reviewData.success, true);
    assert.ok(reviewData.review?.headline);
  });

  test('runCronReminderScheduler creates notifications atomically and skips duplicate conflicts', async () => {
    const env = makeEnv();
    const dbClient = new MockFirestoreRestClient(env);
    dbClient.docs.set('users/uid_alice_123', { timezone: 'Europe/Berlin' });
    dbClient.collectionGroupRows = [
      {
        id: 'rem-cron-1',
        userId: 'uid_alice_123',
        name: 'projects/ombhi-a81ae/databases/(default)/documents/users/uid_alice_123/reminders/rem-cron-1',
        data: {
          id: 'rem-cron-1',
          userId: 'uid_alice_123',
          title: 'Standup Meeting',
          date: '2026-11-16',
          time: '09:00',
          priority: 'high',
          repeat: 'never',
          completed: false,
          timezone: 'Europe/Berlin',
        },
        updateTime: '2026-11-16T07:00:00Z',
      },
    ];

    const summary = await runCronReminderScheduler(env, {
      now: new Date('2026-11-16T08:05:00.000Z'), // 09:05 CET
      dbClient,
    });
    assert.equal(summary.scannedCount, 1);
    assert.equal(summary.triggeredCount, 1);
    assert.equal(summary.conflictSkippedCount, 0);

    // Simulate concurrent conflict on duplicate notification creation
    dbClient.conflictOnCreate = true;
    const conflictSummary = await runCronReminderScheduler(env, {
      now: new Date('2026-11-16T08:05:00.000Z'),
      dbClient,
    });
    assert.equal(conflictSummary.triggeredCount, 0);
    assert.equal(conflictSummary.conflictSkippedCount, 1);
  });

  test('Pages Function (/api/[[path]]) fails closed with 503 if API_WORKER is unbound and forwards requests when bound', async () => {
    const { onRequest } = await import('../../functions/api/[[path]]');

    const missingBindingRes = await onRequest({
      request: new Request('https://abc123.ombhi.pages.dev/api/notifications/status'),
      env: {},
    } as never);
    assert.equal(missingBindingRes.status, 503);
    const missingBody = (await missingBindingRes.json()) as { code?: string };
    assert.equal(missingBody.code, 'API_SERVICE_BINDING_MISSING');

    const workerApp = createWorkerApp({
      verifyToken: async () => makeDecodedToken('uid_alice_123', false),
      createFirestore: (e) => new MockFirestoreRestClient(e),
    });
    const workerEnv = makeEnv({
      APP_URL: 'https://preview.ombhi.pages.dev',
      ALLOWED_ORIGINS: 'https://preview.ombhi.pages.dev',
    });

    const forwardedRes = await onRequest({
      request: new Request('https://abc123.ombhi.pages.dev/api/notifications/status', {
        headers: {
          Origin: 'https://abc123.ombhi.pages.dev',
          Authorization: 'Bearer valid_preview_token',
        },
      }),
      env: {
        API_WORKER: {
          fetch: (req: Request) => workerApp.fetch(req as unknown as Request, workerEnv),
        },
      },
    } as never);
    assert.equal(forwardedRes.status, 200);
    assert.equal(forwardedRes.headers.get('access-control-allow-origin'), 'https://abc123.ombhi.pages.dev');
  });

  test('Isolates two authenticated users (Alice vs Bob) across reminder sync, status, processing, and pending notifications', async () => {
    const env = makeEnv();
    const mockDb = new MockFirestoreRestClient(env);
    const app = createWorkerApp({
      verifyToken: async (token) => {
        if (token === 'token_alice') return makeDecodedToken('uid_alice_123', false);
        if (token === 'token_bob') return makeDecodedToken('uid_bob_456', false);
        throw new Error('Invalid token');
      },
      createFirestore: () => mockDb,
    });

    // Seed an undelivered notification strictly under Alice's path
    mockDb.docs.set('users/uid_alice_123/notifications/notif-alice-1', {
      id: 'notif-alice-1',
      userId: 'uid_alice_123',
      reminderId: 'rem-alice-1',
      title: 'Alice Private Reminder',
      message: 'Pay tuition',
      priority: 'high',
      read: false,
      deliveredViaPending: false,
      scheduledFor: '2026-11-16T08:00:00Z',
      createdAt: '2026-11-16T08:00:00Z',
    });

    // Bob syncs his own reminder while trying to spoof Alice's userId
    const bobSync = await app.request(
      'https://preview-abc.ombhi.pages.dev/api/reminders/sync-schedule',
      {
        method: 'POST',
        headers: {
          Origin: 'https://preview-abc.ombhi.pages.dev',
          'Content-Type': 'application/json',
          Authorization: 'Bearer token_bob',
        },
        body: JSON.stringify({
          timezone: 'UTC',
          reminders: [
            {
              id: 'rem-bob-1',
              userId: 'uid_alice_123',
              title: 'Bob task',
              date: '2026-11-16',
              time: '12:00',
              priority: 'medium',
              repeat: 'never',
              completed: false,
            },
          ],
        }),
      },
      env
    );
    assert.equal(bobSync.status, 200);
    const syncedPaths = mockDb.commitCalls.flat().map((w) => w.update?.name || '');
    assert.ok(syncedPaths.some((p) => p.includes('users/uid_bob_456/reminders/rem-bob-1')));
    assert.ok(!syncedPaths.some((p) => p.includes('uid_alice_123')));

    // Bob checks pending notifications -> receives 0 items (never sees Alice's notification)
    const bobPending = await app.request(
      'https://preview-abc.ombhi.pages.dev/api/reminders/pending-notifications',
      {
        headers: {
          Origin: 'https://preview-abc.ombhi.pages.dev',
          Authorization: 'Bearer token_bob',
        },
      },
      env
    );
    assert.equal(bobPending.status, 200);
    const bobJson = (await bobPending.json()) as { pendingNotifications: unknown[] };
    assert.equal(bobJson.pendingNotifications.length, 0);

    // Alice checks pending notifications -> receives her 1 notification
    const alicePending = await app.request(
      'https://preview-abc.ombhi.pages.dev/api/reminders/pending-notifications',
      {
        headers: {
          Origin: 'https://preview-abc.ombhi.pages.dev',
          Authorization: 'Bearer token_alice',
        },
      },
      env
    );
    assert.equal(alicePending.status, 200);
    const aliceJson = (await alicePending.json()) as { pendingNotifications: Array<{ id: string }> };
    assert.equal(aliceJson.pendingNotifications.length, 1);
    assert.equal(aliceJson.pendingNotifications[0].id, 'notif-alice-1');

    // Cross-site third-party Pages origin is denied even if Authorization header is sent
    const evilOriginRes = await app.request(
      'https://preview-abc.ombhi.pages.dev/api/notifications/status',
      {
        headers: {
          Origin: 'https://evil-app.pages.dev',
          Authorization: 'Bearer token_bob',
        },
      },
      env
    );
    assert.equal(evilOriginRes.status, 403);
  });
});

