import { Category, Habit, Priority, RecurringSchedule, Reminder, Task, TaskStatus, UserSettings } from '../types';

export const MAX_BACKUP_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_ITEMS_PER_COLLECTION = 5000;
const SAFE_ID_REGEX = /^[a-zA-Z0-9_\-]{1,128}$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_24H_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const VALID_PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent'];
const VALID_STATUSES: TaskStatus[] = ['pending', 'in_progress', 'completed', 'failed', 'skipped'];

export interface ValidatedBackupPayload {
  tasks: Task[];
  schedules: RecurringSchedule[];
  categories: Category[];
  habits: Habit[];
  settings: UserSettings;
  reminders: Reminder[];
}

export function stripPrototypeKeys<T>(input: T, depth = 0): T {
  if (depth > 15 || input === null || typeof input !== 'object') {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => stripPrototypeKeys(item, depth + 1)) as unknown as T;
  }
  const clean: Record<string, unknown> = Object.create(null);
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.has(k)) continue;
    clean[k] = stripPrototypeKeys(v, depth + 1);
  }
  return Object.assign({}, clean) as T;
}

export function validateBackupFileMeta(file: { name: string; size: number; type?: string }): {
  valid: boolean;
  error?: string;
} {
  const lowerName = (file.name || '').toLowerCase();
  if (!lowerName.endsWith('.json')) {
    return { valid: false, error: 'Only .json backup files are allowed.' };
  }

  const mime = (file.type || '').toLowerCase();
  if (mime && mime !== 'application/json' && mime !== 'text/json' && mime !== 'text/plain') {
    return { valid: false, error: 'Invalid file MIME type. Expected application/json.' };
  }

  if (file.size <= 0) {
    return { valid: false, error: 'The selected backup file is empty.' };
  }

  if (file.size > MAX_BACKUP_FILE_BYTES) {
    return { valid: false, error: 'Backup file exceeds the 5 MB safety limit.' };
  }

  return { valid: true };
}

function safeId(raw: unknown, prefix: string): string {
  if (typeof raw === 'string' && SAFE_ID_REGEX.test(raw.trim())) {
    return raw.trim();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function safeString(raw: unknown, maxLen: number, fallback = ''): string {
  if (typeof raw !== 'string') return fallback;
  return raw.slice(0, maxLen);
}

export function parseAndValidateBackupJson(
  rawText: string,
  fallbackCategories: Category[],
  fallbackSettings: UserSettings
): { valid: true; data: ValidatedBackupPayload } | { valid: false; error: string } {
  if (!rawText || typeof rawText !== 'string') {
    return { valid: false, error: 'Empty backup payload.' };
  }
  if (rawText.length > MAX_BACKUP_FILE_BYTES) {
    return { valid: false, error: 'Backup content exceeds 5 MB limit.' };
  }

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(rawText);
  } catch {
    return { valid: false, error: 'Could not parse backup file as valid JSON.' };
  }

  const parsed = stripPrototypeKeys(parsedRaw) as Record<string, unknown>;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.tasks)) {
    return { valid: false, error: 'Invalid OmBhi backup JSON format (missing tasks array).' };
  }

  const nowIso = new Date().toISOString();
  const todayStr = nowIso.split('T')[0];

  const categories: Category[] = Array.isArray(parsed.categories)
    ? parsed.categories
        .slice(0, MAX_ITEMS_PER_COLLECTION)
        .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
        .map((c) => ({
          id: safeId(c.id, 'cat'),
          name: safeString(c.name, 80, 'Category').trim() || 'Category',
          color: typeof c.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c.color) ? c.color : '#6657E8',
          ...(typeof c.isDefault === 'boolean' ? { isDefault: c.isDefault } : {}),
        }))
    : fallbackCategories;

  const tasks: Task[] = parsed.tasks
    .slice(0, MAX_ITEMS_PER_COLLECTION)
    .filter((t): t is Record<string, unknown> => Boolean(t && typeof t === 'object'))
    .map((t) => ({
      id: safeId(t.id, 'task'),
      seriesId: typeof t.seriesId === 'string' && SAFE_ID_REGEX.test(t.seriesId) ? t.seriesId : undefined,
      title: safeString(t.title, 200, 'Untitled Task').trim() || 'Untitled Task',
      description: safeString(t.description, 2000) || undefined,
      scheduledDate:
        typeof t.scheduledDate === 'string' && ISO_DATE_REGEX.test(t.scheduledDate)
          ? t.scheduledDate
          : todayStr,
      startTime:
        typeof t.startTime === 'string' && TIME_24H_REGEX.test(t.startTime) ? t.startTime : undefined,
      endTime:
        typeof t.endTime === 'string' && TIME_24H_REGEX.test(t.endTime) ? t.endTime : undefined,
      categoryId: safeId(t.categoryId, 'cat'),
      priority: VALID_PRIORITIES.includes(t.priority as Priority) ? (t.priority as Priority) : 'medium',
      status: VALID_STATUSES.includes(t.status as TaskStatus) ? (t.status as TaskStatus) : 'pending',
      progress:
        typeof t.progress === 'number' && Number.isFinite(t.progress)
          ? Math.max(0, Math.min(100, Math.round(t.progress)))
          : 0,
      subtasks: Array.isArray(t.subtasks)
        ? t.subtasks
            .slice(0, 100)
            .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
            .map((s) => ({
              id: safeId(s.id, 'st'),
              title: safeString(s.title, 200, 'Subtask').trim() || 'Subtask',
              completed: Boolean(s.completed),
            }))
        : [],
      notes: safeString(t.notes, 2000) || undefined,
      createdAt: safeString(t.createdAt, 64, nowIso),
      updatedAt: safeString(t.updatedAt, 64, nowIso),
    }));

  const schedules: RecurringSchedule[] = Array.isArray(parsed.schedules)
    ? parsed.schedules
        .slice(0, MAX_ITEMS_PER_COLLECTION)
        .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
        .map((s) => ({
          id: safeId(s.id, 'series'),
          title: safeString(s.title, 200, 'Routine').trim() || 'Routine',
          description: safeString(s.description, 2000) || undefined,
          startTime:
            typeof s.startTime === 'string' && TIME_24H_REGEX.test(s.startTime) ? s.startTime : undefined,
          endTime:
            typeof s.endTime === 'string' && TIME_24H_REGEX.test(s.endTime) ? s.endTime : undefined,
          categoryId: safeId(s.categoryId, 'cat'),
          priority: VALID_PRIORITIES.includes(s.priority as Priority) ? (s.priority as Priority) : 'medium',
          subtasks: [],
          notes: safeString(s.notes, 2000) || undefined,
          scheduleMode: s.scheduleMode === 'multi_date' ? 'multi_date' : 'repeat',
          frequency:
            s.frequency === 'daily' ||
            s.frequency === 'weekdays' ||
            s.frequency === 'weekly' ||
            s.frequency === 'custom_days'
              ? s.frequency
              : undefined,
          recurrenceDays: Array.isArray(s.recurrenceDays)
            ? s.recurrenceDays.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6)
            : undefined,
          specificDates: Array.isArray(s.specificDates)
            ? s.specificDates.filter((d): d is string => typeof d === 'string' && ISO_DATE_REGEX.test(d))
            : undefined,
          startDate:
            typeof s.startDate === 'string' && ISO_DATE_REGEX.test(s.startDate) ? s.startDate : todayStr,
          endDate:
            typeof s.endDate === 'string' && ISO_DATE_REGEX.test(s.endDate) ? s.endDate : undefined,
          isPaused: Boolean(s.isPaused),
          excludedDates: Array.isArray(s.excludedDates)
            ? s.excludedDates.filter((d): d is string => typeof d === 'string' && ISO_DATE_REGEX.test(d))
            : [],
          createdAt: safeString(s.createdAt, 64, nowIso),
          updatedAt: safeString(s.updatedAt, 64, nowIso),
        }))
    : [];

  const habits: Habit[] = Array.isArray(parsed.habits)
    ? parsed.habits
        .slice(0, MAX_ITEMS_PER_COLLECTION)
        .filter((h): h is Record<string, unknown> => Boolean(h && typeof h === 'object'))
        .map((h) => ({
          id: safeId(h.id, 'hab'),
          name: safeString(h.name, 160, 'Habit').trim() || 'Habit',
          categoryId: safeId(h.categoryId, 'cat'),
          frequency:
            h.frequency === 'weekdays' || h.frequency === 'custom' ? h.frequency : 'daily',
          targetDaysPerWeek:
            typeof h.targetDaysPerWeek === 'number' && Number.isFinite(h.targetDaysPerWeek)
              ? Math.max(1, Math.min(7, Math.round(h.targetDaysPerWeek)))
              : 7,
          completedDates: Array.isArray(h.completedDates)
            ? h.completedDates.filter((d): d is string => typeof d === 'string' && ISO_DATE_REGEX.test(d))
            : [],
          streak: typeof h.streak === 'number' && Number.isFinite(h.streak) ? Math.max(0, h.streak) : 0,
          notes: safeString(h.notes, 1000) || undefined,
        }))
    : [];

  const reminders: Reminder[] = Array.isArray(parsed.reminders)
    ? parsed.reminders
        .slice(0, MAX_ITEMS_PER_COLLECTION)
        .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
        .map((r) => ({
          id: safeId(r.id, 'rem'),
          userId: '',
          title: safeString(r.title, 200, 'Reminder').trim() || 'Reminder',
          description: safeString(r.description, 2000) || undefined,
          date: typeof r.date === 'string' && ISO_DATE_REGEX.test(r.date) ? r.date : todayStr,
          time: typeof r.time === 'string' && TIME_24H_REGEX.test(r.time) ? r.time : '09:00',
          categoryId: safeId(r.categoryId, 'rem-cat'),
          priority: VALID_PRIORITIES.includes(r.priority as Priority) ? (r.priority as Priority) : 'medium',
          repeat:
            r.repeat === 'daily' ||
            r.repeat === 'weekly' ||
            r.repeat === 'monthly' ||
            r.repeat === 'yearly' ||
            r.repeat === 'custom'
              ? r.repeat
              : 'never',
          notificationMethod: 'in_app',
          completed: Boolean(r.completed),
          createdAt: safeString(r.createdAt, 64, nowIso),
          updatedAt: safeString(r.updatedAt, 64, nowIso),
        }))
    : [];

  const rawSettings =
    parsed.settings && typeof parsed.settings === 'object' && !Array.isArray(parsed.settings)
      ? (parsed.settings as Record<string, unknown>)
      : {};

  const settings: UserSettings = {
    ...fallbackSettings,
    theme:
      rawSettings.theme === 'dark' || rawSettings.theme === 'light' || rawSettings.theme === 'system'
        ? rawSettings.theme
        : fallbackSettings.theme,
    timeFormat24h:
      typeof rawSettings.timeFormat24h === 'boolean'
        ? rawSettings.timeFormat24h
        : fallbackSettings.timeFormat24h,
    startOfWeekMonday:
      typeof rawSettings.startOfWeekMonday === 'boolean'
        ? rawSettings.startOfWeekMonday
        : fallbackSettings.startOfWeekMonday,
    defaultTaskDuration:
      typeof rawSettings.defaultTaskDuration === 'number' && Number.isFinite(rawSettings.defaultTaskDuration)
        ? Math.max(5, Math.min(480, Math.round(rawSettings.defaultTaskDuration)))
        : fallbackSettings.defaultTaskDuration,
    dailyFocusGoal:
      typeof rawSettings.dailyFocusGoal === 'number' && Number.isFinite(rawSettings.dailyFocusGoal)
        ? Math.max(1, Math.min(25, Math.round(rawSettings.dailyFocusGoal)))
        : fallbackSettings.dailyFocusGoal,
    celebratoryAnimations:
      typeof rawSettings.celebratoryAnimations === 'boolean'
        ? rawSettings.celebratoryAnimations
        : fallbackSettings.celebratoryAnimations,
    celebrationScope:
      rawSettings.celebrationScope === 'both' ||
      rawSettings.celebrationScope === 'tasks' ||
      rawSettings.celebrationScope === 'habits'
        ? rawSettings.celebrationScope
        : fallbackSettings.celebrationScope,
    timezone:
      typeof rawSettings.timezone === 'string' && rawSettings.timezone.length <= 80
        ? rawSettings.timezone
        : fallbackSettings.timezone,
    notificationSound:
      typeof rawSettings.notificationSound === 'boolean'
        ? rawSettings.notificationSound
        : fallbackSettings.notificationSound,
  };

  return {
    valid: true,
    data: {
      tasks,
      schedules,
      categories,
      habits,
      settings,
      reminders,
    },
  };
}
