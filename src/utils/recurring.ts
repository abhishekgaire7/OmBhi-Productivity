import { Priority, RecurringSchedule, Subtask, Task, TaskStatus } from '../types';
import { formatDateToISO, parseISODate } from './date';

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Returns a human-readable summary of a recurring schedule or multi-date schedule.
 */
export function formatScheduleSummary(
  schedule: Pick<
    RecurringSchedule,
    'scheduleMode' | 'frequency' | 'recurrenceDays' | 'specificDates' | 'startDate' | 'endDate'
  >
): string {
  if (schedule.scheduleMode === 'multi_date') {
    const count = schedule.specificDates?.length || 0;
    return `${count} specific date${count === 1 ? '' : 's'}`;
  }

  switch (schedule.frequency) {
    case 'daily':
      return schedule.endDate ? `Daily until ${schedule.endDate}` : 'Every day';
    case 'weekdays':
      return 'Every weekday (Mon–Fri)';
    case 'weekly': {
      if (schedule.recurrenceDays && schedule.recurrenceDays.length > 0) {
        const days = schedule.recurrenceDays.map((d) => DAY_NAMES_SHORT[d]).join(', ');
        return `Every ${days}`;
      }
      const day = parseISODate(schedule.startDate).getDay();
      return `Every ${DAY_NAMES_SHORT[day]}`;
    }
    case 'custom_days': {
      const days = (schedule.recurrenceDays || [])
        .map((d) => DAY_NAMES_SHORT[d])
        .join(', ');
      return days ? `Every ${days}` : 'Custom repeat';
    }
    default:
      return 'Recurring';
  }
}

/**
 * Generates all valid ISO date strings (YYYY-MM-DD) for a recurring schedule
 * within a requested date window [horizonStart, horizonEnd].
 */
export function generateDatesForSchedule(
  schedule: RecurringSchedule,
  horizonStart: string,
  horizonEnd: string
): string[] {
  if (schedule.isPaused) return [];

  const excluded = new Set(schedule.excludedDates || []);
  const matchedDates: string[] = [];

  if (schedule.scheduleMode === 'multi_date') {
    const list = schedule.specificDates || [];
    for (const d of list) {
      if (d >= horizonStart && d <= horizonEnd && !excluded.has(d)) {
        matchedDates.push(d);
      }
    }
    return matchedDates.sort();
  }

  // Schedule mode is 'repeat'
  const effectiveStart = schedule.startDate > horizonStart ? schedule.startDate : horizonStart;
  const effectiveEnd =
    schedule.endDate && schedule.endDate < horizonEnd ? schedule.endDate : horizonEnd;

  if (effectiveStart > effectiveEnd) return [];

  const cur = parseISODate(effectiveStart);
  const end = parseISODate(effectiveEnd);

  const recurrenceDays = new Set(
    schedule.recurrenceDays && schedule.recurrenceDays.length > 0
      ? schedule.recurrenceDays
      : [parseISODate(schedule.startDate).getDay()]
  );

  while (cur <= end) {
    const iso = formatDateToISO(cur);
    const dayOfWeek = cur.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat

    if (!excluded.has(iso)) {
      let isMatch = false;

      if (schedule.frequency === 'daily') {
        isMatch = true;
      } else if (schedule.frequency === 'weekdays') {
        isMatch = dayOfWeek >= 1 && dayOfWeek <= 5;
      } else if (schedule.frequency === 'weekly' || schedule.frequency === 'custom_days') {
        isMatch = recurrenceDays.has(dayOfWeek);
      }

      if (isMatch) {
        matchedDates.push(iso);
      }
    }

    cur.setDate(cur.getDate() + 1);
  }

  return matchedDates;
}

/**
 * Synchronizes task occurrences with the recurring schedules without overwriting
 * existing progress, statuses, or notes.
 */
export function syncOccurrencesForSchedules(
  schedules: RecurringSchedule[],
  existingTasks: Task[],
  horizonStart: string,
  horizonEnd: string
): Task[] {
  // Map of existing tasks keyed by "seriesId:scheduledDate" or "id"
  const existingBySeriesAndDate = new Map<string, Task>();
  const independentTasks: Task[] = [];

  for (const task of existingTasks) {
    if (task.seriesId) {
      existingBySeriesAndDate.set(`${task.seriesId}:${task.scheduledDate}`, task);
    } else {
      independentTasks.push(task);
    }
  }

  const syncedOccurrences: Task[] = [];
  const scheduleMap = new Map(schedules.map((s) => [s.id, s]));

  // For each schedule, find dates in horizon
  for (const schedule of schedules) {
    if (schedule.isPaused) {
      // If paused, keep existing occurrences that the user has already touched or completed
      for (const [key, existing] of existingBySeriesAndDate.entries()) {
        if (
          existing.seriesId === schedule.id &&
          (existing.status !== 'pending' || existing.progress > 0 || existing.isDetached)
        ) {
          syncedOccurrences.push(existing);
        }
      }
      continue;
    }

    const scheduledDates = generateDatesForSchedule(schedule, horizonStart, horizonEnd);
    const summary = formatScheduleSummary(schedule);

    for (const date of scheduledDates) {
      const key = `${schedule.id}:${date}`;
      const existing = existingBySeriesAndDate.get(key);

      if (existing) {
        // Occurrence already exists: PRESERVE independent status, progress, notes!
        // If not detached, sync template title/category/times/priority if updated
        if (!existing.isDetached) {
          syncedOccurrences.push({
            ...existing,
            title: schedule.title,
            description: schedule.description,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            categoryId: schedule.categoryId,
            priority: schedule.priority,
            scheduleSummary: summary,
            updatedAt: new Date().toISOString(),
          });
        } else {
          syncedOccurrences.push(existing);
        }
        existingBySeriesAndDate.delete(key);
      } else {
        // Create new occurrence for this date
        const newOccurrence: Task = {
          id: `occ-${schedule.id}-${date}`,
          seriesId: schedule.id,
          title: schedule.title,
          description: schedule.description,
          scheduledDate: date,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          categoryId: schedule.categoryId,
          priority: schedule.priority,
          status: 'pending',
          progress: 0,
          subtasks: schedule.subtasks.map((st) => ({ ...st, id: `st-${Date.now()}-${Math.random()}` })),
          notes: schedule.notes,
          scheduleSummary: summary,
          isDetached: false,
          createdAt: schedule.createdAt,
          updatedAt: new Date().toISOString(),
        };
        syncedOccurrences.push(newOccurrence);
      }
    }
  }

  // Preserve any occurrences outside horizon or with existing progress/notes that were already created
  for (const existing of existingBySeriesAndDate.values()) {
    const parentSchedule = scheduleMap.get(existing.seriesId || '');
    // If parent still exists and user customized this occurrence, preserve it
    if (parentSchedule) {
      if (existing.status !== 'pending' || existing.progress > 0 || existing.isDetached) {
        syncedOccurrences.push(existing);
      }
    }
  }

  return [...independentTasks, ...syncedOccurrences];
}
