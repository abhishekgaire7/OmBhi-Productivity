import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeterministicNotificationId,
  computeNextOccurrence,
  computeNextRunAtUtcMs,
  evaluateRemindersBatch,
  parseDateTimeInTimezone,
  ReminderProcessItem,
} from './reminderScheduler';

describe('Shared Reminder Scheduler (DST, Recurrence, Deduplication)', () => {
  test('parseDateTimeInTimezone handles Europe/Berlin winter (CET UTC+1) and summer (CEST UTC+2)', () => {
    const winterMs = parseDateTimeInTimezone('2026-01-15', '09:00', 'Europe/Berlin');
    assert.equal(new Date(winterMs).toISOString(), '2026-01-15T08:00:00.000Z');

    const summerMs = parseDateTimeInTimezone('2026-07-15', '09:00', 'Europe/Berlin');
    assert.equal(new Date(summerMs).toISOString(), '2026-07-15T07:00:00.000Z');
  });

  test('parseDateTimeInTimezone safely resolves Europe/Berlin DST Spring Forward and Fall Back', () => {
    // 2026-03-29: clocks jump 02:00 -> 03:00 in Europe/Berlin (02:30 does not exist)
    const springSkippedMs = parseDateTimeInTimezone('2026-03-29', '02:30', 'Europe/Berlin');
    assert.ok(springSkippedMs >= Date.UTC(2026, 2, 29, 1, 0, 0));

    // 2026-10-25: clocks fall back 03:00 -> 02:00 in Europe/Berlin (02:30 happens twice)
    const fallBackMs = parseDateTimeInTimezone('2026-10-25', '02:30', 'Europe/Berlin');
    assert.ok(
      fallBackMs === Date.UTC(2026, 9, 25, 0, 30, 0) ||
        fallBackMs === Date.UTC(2026, 9, 25, 1, 30, 0)
    );
  });

  test('computeNextOccurrence advances daily, weekly, monthly, yearly, and custom weekday reminders', () => {
    assert.deepEqual(
      computeNextOccurrence({ date: '2026-03-29', time: '09:00', repeat: 'daily' }),
      { date: '2026-03-30', time: '09:00' }
    );
    assert.deepEqual(
      computeNextOccurrence({ date: '2026-03-29', time: '09:00', repeat: 'weekly' }),
      { date: '2026-04-05', time: '09:00' }
    );
    assert.deepEqual(
      computeNextOccurrence({ date: '2026-03-29', time: '09:00', repeat: 'monthly' }),
      { date: '2026-04-29', time: '09:00' }
    );
    assert.deepEqual(
      computeNextOccurrence({ date: '2026-03-29', time: '09:00', repeat: 'yearly' }),
      { date: '2027-03-29', time: '09:00' }
    );
    // 2026-11-16 is Monday (1); custom days [3, 5] => Wednesday 2026-11-18
    assert.deepEqual(
      computeNextOccurrence({
        date: '2026-11-16',
        time: '14:00',
        repeat: 'custom',
        customRepeatDays: [3, 5],
      }),
      { date: '2026-11-18', time: '14:00' }
    );
  });

  test('buildDeterministicNotificationId obeys Firestore rule ID regex and length <= 128', () => {
    const id = buildDeterministicNotificationId('rem/with invalid:chars-' + 'a'.repeat(150), 1794841200000);
    assert.ok(id.length <= 128);
    assert.match(id, /^[a-zA-Z0-9_\-]+$/);
  });

  test('evaluateRemindersBatch triggers due reminders once and advances recurring occurrences', () => {
    const dueReminder: ReminderProcessItem = {
      id: 'rem-daily-1',
      userId: 'uid-alice',
      title: 'Take Vitamins',
      date: '2026-11-16',
      time: '08:00',
      priority: 'high',
      repeat: 'daily',
      notificationMethod: 'in_app',
      completed: false,
      timezone: 'Europe/Berlin',
    };

    const futureReminder: ReminderProcessItem = {
      id: 'rem-future-2',
      userId: 'uid-alice',
      title: 'Evening Review',
      date: '2026-11-16',
      time: '20:00',
      priority: 'medium',
      repeat: 'never',
      notificationMethod: 'in_app',
      completed: false,
      timezone: 'Europe/Berlin',
    };

    const now = new Date('2026-11-16T08:05:00.000Z'); // 09:05 CET
    const outcomes = evaluateRemindersBatch({
      userId: 'uid-alice',
      reminders: [dueReminder, futureReminder],
      timezone: 'Europe/Berlin',
      now,
    });

    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0].reminderId, 'rem-daily-1');
    assert.equal(outcomes[0].notification.userId, 'uid-alice');
    assert.equal(outcomes[0].updatedReminder.date, '2026-11-17');
    assert.equal(outcomes[0].updatedReminder.lastNotifiedAt, undefined);
    assert.equal(
      outcomes[0].updatedReminder.nextRunAtUtcMs,
      computeNextRunAtUtcMs({ date: '2026-11-17', time: '08:00', completed: false, timezone: 'Europe/Berlin' })
    );

    // Re-evaluating an already-notified non-recurring reminder at the same instant produces zero duplicates
    const oneTimeDone: ReminderProcessItem = {
      id: 'rem-once-3',
      userId: 'uid-alice',
      title: 'One-off task',
      date: '2026-11-16',
      time: '08:00',
      priority: 'low',
      repeat: 'never',
      notificationMethod: 'in_app',
      completed: false,
      timezone: 'Europe/Berlin',
      lastNotifiedAt: '2026-11-16T07:01:00.000Z',
    };
    const dupOutcomes = evaluateRemindersBatch({
      userId: 'uid-alice',
      reminders: [oneTimeDone],
      timezone: 'Europe/Berlin',
      now,
    });
    assert.equal(dupOutcomes.length, 0);
  });
});
