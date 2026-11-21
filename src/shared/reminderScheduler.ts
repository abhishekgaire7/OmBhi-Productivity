import { SanitizedReminderItem } from './security';

export interface ReminderProcessItem extends SanitizedReminderItem {
  emailSentAt?: string;
  nextRunAtUtcMs?: number | null;
}

export interface GeneratedNotificationItem {
  id: string;
  userId: string;
  reminderId: string;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  read: boolean;
  scheduledFor: string;
  createdAt: string;
  deliveredViaPending?: boolean;
}

/**
 * Advances a recurring reminder to its next calendar occurrence while preserving wall-clock time.
 * Uses UTC noon arithmetic so calendar dates never drift around DST transitions.
 */
export function computeNextOccurrence(r: Pick<ReminderProcessItem, 'date' | 'time' | 'repeat' | 'customRepeatDays'>): {
  date: string;
  time: string;
} {
  const [y, m, d] = r.date.split('-').map(Number);
  const nextDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

  if (r.repeat === 'daily') {
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  } else if (r.repeat === 'weekly') {
    nextDate.setUTCDate(nextDate.getUTCDate() + 7);
  } else if (r.repeat === 'monthly') {
    nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);
  } else if (r.repeat === 'yearly') {
    nextDate.setUTCFullYear(nextDate.getUTCFullYear() + 1);
  } else if (r.repeat === 'custom' && r.customRepeatDays?.length) {
    const sortedDays = [...r.customRepeatDays].sort((a, b) => a - b);
    let found = false;
    for (let i = 1; i <= 7; i++) {
      const candidate = new Date(nextDate);
      candidate.setUTCDate(candidate.getUTCDate() + i);
      const dayOfWeek = candidate.getUTCDay();
      if (sortedDays.includes(dayOfWeek)) {
        nextDate.setUTCDate(nextDate.getUTCDate() + i);
        found = true;
        break;
      }
    }
    if (!found) {
      nextDate.setUTCDate(nextDate.getUTCDate() + 7);
    }
  }

  return {
    date: nextDate.toISOString().split('T')[0],
    time: r.time,
  };
}

function getTimezonePartsAsUtcMs(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const p: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      p[part.type] = parseInt(part.value, 10);
    }
  }
  const tzHour = p.hour === 24 ? 0 : p.hour;
  return Date.UTC(p.year, p.month - 1, p.day, tzHour, p.minute, p.second || 0);
}

/**
 * Resolves a local date (YYYY-MM-DD) + time (HH:mm) in an IANA timezone (e.g. Europe/Berlin)
 * into a UTC epoch timestamp in milliseconds, safely handling Daylight Saving Time (CET <-> CEST).
 *
 * Uses two-pass iterative refinement:
 * - On normal days: converges to the exact UTC instant.
 * - On Spring Forward skipped times (e.g. 02:30 on last Sunday of March in Europe/Berlin):
 *   advances cleanly into the new offset (03:30 CEST) rather than firing 1 hour early.
 * - On Fall Back ambiguous times (e.g. 02:30 on last Sunday of October):
 *   deterministically resolves to a single stable UTC instant so reminders never double-fire.
 */
export function parseDateTimeInTimezone(dateStr: string, timeStr: string, timeZone?: string): number {
  if (!dateStr) return 0;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '09:00').split(':').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d) || isNaN(hh) || isNaN(mm)) return 0;

  const tz = timeZone && timeZone.trim() ? timeZone.trim() : 'UTC';
  try {
    const targetWallUtc = Date.UTC(y, m - 1, d, hh, mm, 0);

    const offset1 = getTimezonePartsAsUtcMs(targetWallUtc, tz) - targetWallUtc;
    const guess1 = targetWallUtc - offset1;

    const wallAtGuess1 = getTimezonePartsAsUtcMs(guess1, tz);
    if (wallAtGuess1 === targetWallUtc) {
      return guess1;
    }

    const offset2 = wallAtGuess1 - guess1;
    const guess2 = targetWallUtc - offset2;
    const wallAtGuess2 = getTimezonePartsAsUtcMs(guess2, tz);
    if (wallAtGuess2 === targetWallUtc) {
      return guess2;
    }

    // Spring-forward nonexistent wall time: pick the post-transition instant (>= target)
    return Math.max(guess1, guess2);
  } catch {
    const fallback = new Date(`${dateStr}T${timeStr || '09:00'}:00Z`).getTime();
    return Number.isNaN(fallback) ? 0 : fallback;
  }
}

/**
 * Computes the UTC epoch ms for when a reminder should next trigger (for indexed Firestore Cron queries).
 * Returns null if completed or invalid.
 */
export function computeNextRunAtUtcMs(
  r: Pick<ReminderProcessItem, 'completed' | 'snoozedUntil' | 'date' | 'time' | 'timezone'>,
  fallbackTimezone = 'UTC'
): number | null {
  if (r.completed) return null;

  if (r.snoozedUntil) {
    const snoozedTs = new Date(r.snoozedUntil).getTime();
    if (!Number.isNaN(snoozedTs) && snoozedTs > 0) {
      return snoozedTs;
    }
  }

  const ts = parseDateTimeInTimezone(r.date, r.time, r.timezone || fallbackTimezone);
  return ts > 0 && !Number.isNaN(ts) ? ts : null;
}

/**
 * Builds a deterministic, Firestore-rule-compliant notification document ID (<= 128 chars, [a-zA-Z0-9_-])
 * bound to a specific reminder occurrence timestamp so Cron + client polling can never duplicate.
 */
export function buildDeterministicNotificationId(reminderId: string, scheduledTs: number): string {
  const safeRemId = reminderId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96) || 'rem';
  return `notif-${safeRemId}-${Math.trunc(scheduledTs)}`;
}

export interface EvaluatedReminderOutcome {
  reminderId: string;
  scheduledTs: number;
  notification: GeneratedNotificationItem;
  updatedReminder: ReminderProcessItem;
}

export function evaluateRemindersBatch(params: {
  userId: string;
  reminders: ReminderProcessItem[];
  timezone?: string;
  now?: Date;
}): EvaluatedReminderOutcome[] {
  const now = params.now || new Date();
  const nowIso = now.toISOString();
  const nowTs = now.getTime();
  const effectiveTz = params.timezone || 'UTC';
  const outcomes: EvaluatedReminderOutcome[] = [];

  for (const r of params.reminders) {
    if (r.completed) continue;

    const scheduledTs = computeNextRunAtUtcMs(r, effectiveTz);
    if (!scheduledTs || scheduledTs > nowTs) {
      continue;
    }

    const alreadyNotified = Boolean(
      r.lastNotifiedAt &&
        !Number.isNaN(new Date(r.lastNotifiedAt).getTime()) &&
        new Date(r.lastNotifiedAt).getTime() >= scheduledTs
    );

    if (alreadyNotified) {
      continue;
    }

    const notificationId = buildDeterministicNotificationId(r.id, scheduledTs);
    const notification: GeneratedNotificationItem = {
      id: notificationId,
      userId: params.userId,
      reminderId: r.id,
      title: r.title,
      message: r.description
        ? `${r.description} · Scheduled for ${r.time}`
        : `Scheduled for ${r.date} at ${r.time}`,
      priority: r.priority || 'medium',
      read: false,
      scheduledFor: new Date(scheduledTs).toISOString(),
      createdAt: nowIso,
      deliveredViaPending: false,
    };

    const updatedReminder: ReminderProcessItem = {
      ...r,
      userId: params.userId,
      lastNotifiedAt: nowIso,
      updatedAt: nowIso,
    };

    if (r.repeat && r.repeat !== 'never') {
      const next = computeNextOccurrence(r);
      updatedReminder.date = next.date;
      updatedReminder.time = next.time;
      updatedReminder.lastNotifiedAt = undefined;
      updatedReminder.snoozedUntil = undefined;
      updatedReminder.nextRunAtUtcMs = computeNextRunAtUtcMs(updatedReminder, effectiveTz);
    } else {
      updatedReminder.nextRunAtUtcMs = null;
    }

    outcomes.push({
      reminderId: r.id,
      scheduledTs,
      notification,
      updatedReminder,
    });
  }

  return outcomes;
}
