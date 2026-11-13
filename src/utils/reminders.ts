import { Reminder, ReminderPriority, ReminderRepeat } from '../types';

/**
 * Returns the browser's current timezone or fallback
 */
export function getSystemTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Common world timezones for settings dropdown
 */
export const MAJOR_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Rome',
  'Europe/Madrid',
  'Europe/Zurich',
  'Europe/Athens',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Kathmandu',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
];

/**
 * Formats a reminder's date and time into a Date object or timestamp
 */
export function getReminderScheduledTimestamp(reminder: Reminder): number {
  if (reminder.snoozedUntil) {
    const snoozedTs = new Date(reminder.snoozedUntil).getTime();
    if (!isNaN(snoozedTs)) return snoozedTs;
  }
  // Standard YYYY-MM-DDTHH:mm:00
  const dateStr = `${reminder.date}T${reminder.time || '09:00'}:00`;
  const parsed = new Date(dateStr).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Checks if a reminder is currently due for notification
 */
/**
 * Checks if a reminder is currently due for notification
 */
export function isReminderDue(reminder: Reminder, now = new Date()): boolean {
  if (reminder.completed) return false;
  const targetTs = getReminderScheduledTimestamp(reminder);
  const currentTs = now.getTime();
  return targetTs <= currentTs;
}

/**
 * Checks if a reminder is overdue (due and not completed)
 */
export function isReminderOverdue(reminder: Reminder, now = new Date()): boolean {
  if (reminder.completed) return false;
  return isReminderDue(reminder, now);
}

/**
 * Checks if a reminder is due now and hasn't already been triggered/notified
 */
export function isReminderDueNow(reminder: Reminder, now = new Date()): boolean {
  if (reminder.completed) return false;
  if (!isReminderDue(reminder, now)) return false;

  // Duplicate prevention: if already notified for this scheduled time, do not notify again
  if (reminder.lastNotifiedAt) {
    const scheduledTs = getReminderScheduledTimestamp(reminder);
    const notifiedTs = new Date(reminder.lastNotifiedAt).getTime();
    if (!isNaN(notifiedTs) && notifiedTs >= scheduledTs) {
      return false;
    }
  }
  return true;
}

/**
 * Returns today's ISO date (YYYY-MM-DD) in the specified timezone
 */
export function getTodayDateString(timezone?: string): string {
  try {
    const tz = timezone || getSystemTimezone();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Returns tomorrow's ISO date (YYYY-MM-DD) in the specified timezone
 */
export function getTomorrowDateString(timezone?: string): string {
  const today = getTodayDateString(timezone);
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0];
}

/**
 * Calculates start and end dates of current week (Mon-Sun or Sun-Sat)
 */
export function getThisWeekRange(timezone?: string): { start: string; end: string } {
  const today = getTodayDateString(timezone);
  const now = new Date(`${today}T12:00:00Z`);
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const mon = new Date(now);
  mon.setUTCDate(now.getUTCDate() + diffToMonday);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  return {
    start: mon.toISOString().split('T')[0],
    end: sun.toISOString().split('T')[0],
  };
}

/**
 * Computes snoozed date and time from a base date and time string
 */
export function computeSnoozedDateTime(
  dateStr: string,
  timeStr: string,
  minutes: number
): { date: string; time: string } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '09:00').split(':').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d, hh, mm));

  if (minutes >= 1440) {
    // Tomorrow at same time
    target.setUTCDate(target.getUTCDate() + 1);
  } else {
    target.setUTCMinutes(target.getUTCMinutes() + minutes);
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(target.getUTCDate())}`,
    time: `${pad(target.getUTCHours())}:${pad(target.getUTCMinutes())}`,
  };
}

/**
 * Calculates snooze date, time, and snoozedUntil timestamp
 */
export function calculateSnooze(
  minutesOrOption: 10 | 30 | 60 | 'tomorrow',
  currentTime = new Date()
): { date: string; time: string; snoozedUntil: string } {
  const target = new Date(currentTime);

  if (minutesOrOption === 'tomorrow') {
    target.setDate(target.getDate() + 1);
    // Set to 09:00 AM next day
    target.setHours(9, 0, 0, 0);
  } else {
    target.setMinutes(target.getMinutes() + minutesOrOption);
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;
  const time = `${pad(target.getHours())}:${pad(target.getMinutes())}`;

  return {
    date,
    time,
    snoozedUntil: target.toISOString(),
  };
}

/**
 * Computes next scheduled occurrence for a recurring reminder
 */
export function getNextReminderOccurrence(
  reminderOrDate: Reminder | string,
  timeArg?: string,
  repeatArg?: ReminderRepeat,
  customDaysArg?: number[]
): { date: string; time: string } {
  let dateStr: string;
  let timeStr: string;
  let repeat: ReminderRepeat;
  let customRepeatDays: number[] | undefined;

  if (typeof reminderOrDate === 'object') {
    dateStr = reminderOrDate.date;
    timeStr = reminderOrDate.time;
    repeat = reminderOrDate.repeat;
    customRepeatDays = reminderOrDate.customRepeatDays;
  } else {
    dateStr = reminderOrDate;
    timeStr = timeArg || '09:00';
    repeat = repeatArg || 'never';
    customRepeatDays = customDaysArg;
  }

  if (repeat === 'never') {
    return { date: dateStr, time: timeStr };
  }

  const [y, m, d] = dateStr.split('-').map(Number);
  const nextDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

  if (repeat === 'daily') {
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  } else if (repeat === 'weekly') {
    nextDate.setUTCDate(nextDate.getUTCDate() + 7);
  } else if (repeat === 'monthly') {
    nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);
  } else if (repeat === 'yearly') {
    nextDate.setUTCFullYear(nextDate.getUTCFullYear() + 1);
  } else if (repeat === 'custom' && customRepeatDays?.length) {
    const sortedDays = [...customRepeatDays].sort((a, b) => a - b);
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
    time: timeStr,
  };
}

export type ReminderTab =
  | 'all'
  | 'today'
  | 'tomorrow'
  | 'this_week'
  | 'upcoming'
  | 'overdue'
  | 'completed';

export function filterRemindersByTab(
  reminders: Reminder[],
  tab: ReminderTab,
  timezone?: string,
  now = new Date()
): Reminder[] {
  const today = getTodayDateString(timezone);
  const tomorrow = getTomorrowDateString(timezone);
  const weekRange = getThisWeekRange(timezone);

  return reminders.filter((r) => {
    const isOverdue = isReminderOverdue(r, now);

    if (tab === 'all') {
      return true;
    }

    if (tab === 'completed') {
      return r.completed;
    }

    // For active tabs, exclude completed reminders
    if (r.completed) return false;

    if (tab === 'overdue') {
      return isOverdue;
    }

    if (tab === 'today') {
      return r.date === today;
    }

    if (tab === 'tomorrow') {
      return r.date === tomorrow;
    }

    if (tab === 'this_week') {
      return r.date >= weekRange.start && r.date <= weekRange.end;
    }

    if (tab === 'upcoming') {
      // Future reminders after today
      return r.date > today;
    }

    return true;
  });
}

const PRIORITY_ORDER: Record<ReminderPriority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export type ReminderSortBy = 'date_asc' | 'date_desc' | 'priority_desc' | 'priority_asc' | 'title_asc' | 'priority' | 'date';

export function sortReminders(reminders: Reminder[], sortBy: ReminderSortBy | string): Reminder[] {
  return [...reminders].sort((a, b) => {
    if (sortBy === 'priority_desc' || sortBy === 'priority') {
      const diff = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
      if (diff !== 0) return diff;
      return a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
    }
    if (sortBy === 'priority_asc') {
      const diff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (diff !== 0) return diff;
      return a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
    }
    if (sortBy === 'date_desc') {
      const diff = b.date.localeCompare(a.date);
      if (diff !== 0) return diff;
      return b.time.localeCompare(a.time);
    }
    if (sortBy === 'title_asc') {
      return a.title.localeCompare(b.title);
    }
    // Default 'date_asc'
    const diff = a.date.localeCompare(b.date);
    if (diff !== 0) return diff;
    return a.time.localeCompare(b.time);
  });
}

export function formatTimeDisplay(timeStr: string, timeFormat24h = true): string {
  if (!timeStr) return '';
  if (timeFormat24h) return timeStr;

  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

export function formatReadableReminderDate(dateStr: string, timezone?: string): string {
  if (!dateStr) return '';
  const today = getTodayDateString(timezone);
  const tomorrow = getTomorrowDateString(timezone);

  if (dateStr === today) return 'Today';
  if (dateStr === tomorrow) return 'Tomorrow';

  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
  } catch {
    return dateStr;
  }
}
