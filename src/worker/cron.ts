import {
  evaluateRemindersBatch,
  ReminderProcessItem,
} from '../shared/reminderScheduler';
import { redactSensitiveError, sanitizeReminderInput } from '../shared/security';
import { FirestoreRestClient, toFirestoreFields } from './firestoreRest';
import { WorkerEnv } from './types';

export interface CronRunSummary {
  checkedAt: string;
  scannedCount: number;
  triggeredCount: number;
  conflictSkippedCount: number;
}

/**
 * Durable, duplicate-safe Cloudflare Cron scheduler backed by Cloud Firestore.
 * Queries active due reminders via collectionGroup('reminders') index
 * (completed == false AND nextRunAtUtcMs <= nowMs) and commits notifications + updates atomically.
 */
export async function runCronReminderScheduler(
  env: WorkerEnv,
  options?: {
    now?: Date;
    fetchImpl?: typeof fetch;
    dbClient?: FirestoreRestClient;
  }
): Promise<CronRunSummary> {
  const now = options?.now || new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  const db = options?.dbClient || new FirestoreRestClient(env, options?.fetchImpl || fetch);

  let triggeredCount = 0;
  let conflictSkippedCount = 0;
  let scannedCount = 0;

  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON || !env.FIREBASE_SERVICE_ACCOUNT_JSON.trim()) {
    console.warn('[OmBhi Cron] FIREBASE_SERVICE_ACCOUNT_JSON is not configured; skipping scheduler run.');
    return { checkedAt: nowIso, scannedCount: 0, triggeredCount: 0, conflictSkippedCount: 0 };
  }

  try {
    const dueDocs = await db.runCollectionGroupQuery<Record<string, unknown>>({
      from: [{ collectionId: 'reminders', allDescendants: true }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'completed' },
                op: 'EQUAL',
                value: { booleanValue: false },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'nextRunAtUtcMs' },
                op: 'LESS_THAN_OR_EQUAL',
                value: { integerValue: String(nowMs) },
              },
            },
          ],
        },
      },
      orderBy: [{ field: { fieldPath: 'nextRunAtUtcMs' }, direction: 'ASCENDING' }],
      limit: 100,
    });

    scannedCount = dueDocs.length;
    const userTimezoneCache = new Map<string, string>();

    for (const docItem of dueDocs) {
      if (!docItem.userId) continue;

      let userTz = userTimezoneCache.get(docItem.userId);
      if (!userTz) {
        try {
          const userDoc = await db.getDocument<{ timezone?: string }>(db.userDocPath(docItem.userId));
          userTz = typeof userDoc.data?.timezone === 'string' && userDoc.data.timezone
            ? userDoc.data.timezone
            : 'UTC';
        } catch {
          userTz = 'UTC';
        }
        userTimezoneCache.set(docItem.userId, userTz);
      }

      const sanitized = sanitizeReminderInput({ ...docItem.data, id: docItem.id }, docItem.userId);
      if (!sanitized) continue;

      const reminderItem: ReminderProcessItem = {
        ...sanitized,
        nextRunAtUtcMs:
          typeof docItem.data.nextRunAtUtcMs === 'number' ? docItem.data.nextRunAtUtcMs : undefined,
      };

      const outcomes = evaluateRemindersBatch({
        userId: docItem.userId,
        reminders: [reminderItem],
        timezone: reminderItem.timezone || userTz,
        now,
      });

      if (outcomes.length === 0) continue;

      const outcome = outcomes[0];
      const notifPath = db.docResourceName(
        db.userSubcollectionDocPath(docItem.userId, 'notifications', outcome.notification.id)
      );
      const remPath = db.docResourceName(
        db.userSubcollectionDocPath(docItem.userId, 'reminders', docItem.id)
      );

      const updateFields: Record<string, unknown> = {
        date: outcome.updatedReminder.date,
        time: outcome.updatedReminder.time,
        lastNotifiedAt: outcome.updatedReminder.lastNotifiedAt ?? null,
        snoozedUntil: outcome.updatedReminder.snoozedUntil ?? null,
        nextRunAtUtcMs: outcome.updatedReminder.nextRunAtUtcMs ?? null,
        updatedAt: nowIso,
      };

      const commitResult = await db.commitWrites([
        {
          update: {
            name: notifPath,
            fields: toFirestoreFields(outcome.notification as unknown as Record<string, unknown>),
          },
          currentDocument: { exists: false },
        },
        {
          update: {
            name: remPath,
            fields: toFirestoreFields(updateFields),
          },
          updateMask: {
            fieldPaths: ['date', 'time', 'lastNotifiedAt', 'snoozedUntil', 'nextRunAtUtcMs', 'updatedAt'],
          },
          ...(docItem.updateTime ? { currentDocument: { updateTime: docItem.updateTime } } : {}),
        },
      ]);

      if (commitResult.committed) {
        triggeredCount++;
      } else if (commitResult.conflict) {
        conflictSkippedCount++;
      }
    }

    // Record persistent scheduler heartbeat outside user collections
    await db
      .patchDocument(
        '_system/schedulerStatus',
        {
          lastRunAt: nowIso,
          checkIntervalSeconds: 60,
          lastScannedCount: scannedCount,
          lastTriggeredCount: triggeredCount,
        },
        ['lastRunAt', 'checkIntervalSeconds', 'lastScannedCount', 'lastTriggeredCount']
      )
      .catch((err) => {
        console.warn('[OmBhi Cron] Failed to write scheduler status:', redactSensitiveError(err));
      });
  } catch (err) {
    console.error('[OmBhi Cron] Background scheduler failed:', redactSensitiveError(err));
  }

  return {
    checkedAt: nowIso,
    scannedCount,
    triggeredCount,
    conflictSkippedCount,
  };
}
