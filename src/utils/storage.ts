import { Category, Habit, InAppNotification, RecurringSchedule, Reminder, Task, TimetableTemplate, UserSettings, WeeklyReview } from '../types';
import { DEFAULT_SETTINGS } from './sampleData';

/* ========================================================================
   AUTHENTICATED PER-USER STORAGE HELPERS (STRICT UID ISOLATION)
   ======================================================================== */

export function getUserTasksKey(userId: string): string {
  return `ombhi_user_${userId}_tasks_v2`;
}

export function getUserCategoriesKey(userId: string): string {
  return `ombhi_user_${userId}_categories_v2`;
}

export function getUserSchedulesKey(userId: string): string {
  return `ombhi_user_${userId}_schedules_v2`;
}

export function getUserHabitsKey(userId: string): string {
  return `ombhi_user_${userId}_habits_v2`;
}

export function getUserSettingsKey(userId: string): string {
  return `ombhi_user_${userId}_settings_v2`;
}

export function getUserWeeklyReviewsKey(userId: string): string {
  return `ombhi_user_${userId}_weekly_reviews_v2`;
}

export function getUserRemindersKey(userId: string): string {
  return `ombhi_user_${userId}_reminders_v2`;
}

export function getUserNotificationsKey(userId: string): string {
  return `ombhi_user_${userId}_notifications_v2`;
}

export function getUserTimetableTemplatesKey(userId: string): string {
  return `ombhi_user_${userId}_timetable_templates_v1`;
}

export function loadUserStoredTimetableTemplates(userId: string): TimetableTemplate[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(getUserTimetableTemplatesKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error('Failed to load timetable templates');
    return [];
  }
}

export function saveUserStoredTimetableTemplates(userId: string, templates: TimetableTemplate[]): void {
  if (!userId) return;
  try {
    localStorage.setItem(getUserTimetableTemplatesKey(userId), JSON.stringify(templates));
  } catch {
    console.error('Failed to save timetable templates');
  }
}

export function loadUserStoredReminders(userId: string): Reminder[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(getUserRemindersKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error('Failed to load reminders');
    return [];
  }
}

export function saveUserStoredReminders(userId: string, reminders: Reminder[]): void {
  if (!userId) return;
  try {
    localStorage.setItem(getUserRemindersKey(userId), JSON.stringify(reminders));
  } catch {
    console.error('Failed to save reminders');
  }
}

export function loadUserStoredNotifications(userId: string): InAppNotification[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(getUserNotificationsKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error('Failed to load notifications');
    return [];
  }
}

export function saveUserStoredNotifications(userId: string, notifications: InAppNotification[]): void {
  if (!userId) return;
  try {
    localStorage.setItem(getUserNotificationsKey(userId), JSON.stringify(notifications));
  } catch {
    console.error('Failed to save notifications');
  }
}

export function loadUserStoredTasks(userId: string): Task[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(getUserTasksKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error('Failed to load tasks');
    return [];
  }
}

export function saveUserStoredTasks(userId: string, tasks: Task[]): void {
  if (!userId) return;
  try {
    localStorage.setItem(getUserTasksKey(userId), JSON.stringify(tasks));
  } catch {
    console.error('Failed to save tasks');
  }
}

export function loadUserStoredCategories(userId: string): Category[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(getUserCategoriesKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error('Failed to load categories');
    return [];
  }
}

export function saveUserStoredCategories(userId: string, categories: Category[]): void {
  if (!userId) return;
  try {
    localStorage.setItem(getUserCategoriesKey(userId), JSON.stringify(categories));
  } catch {
    console.error('Failed to save categories');
  }
}

export function loadUserStoredSchedules(userId: string): RecurringSchedule[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(getUserSchedulesKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error('Failed to load schedules');
    return [];
  }
}

export function saveUserStoredSchedules(userId: string, schedules: RecurringSchedule[]): void {
  if (!userId) return;
  try {
    localStorage.setItem(getUserSchedulesKey(userId), JSON.stringify(schedules));
  } catch {
    console.error('Failed to save schedules');
  }
}

export function loadUserStoredHabits(userId: string): Habit[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(getUserHabitsKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error('Failed to load habits');
    return [];
  }
}

export function saveUserStoredHabits(userId: string, habits: Habit[]): void {
  if (!userId) return;
  try {
    localStorage.setItem(getUserHabitsKey(userId), JSON.stringify(habits));
  } catch {
    console.error('Failed to save habits');
  }
}

export function loadUserStoredSettings(userId: string): UserSettings {
  if (!userId) return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(getUserSettingsKey(userId));
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    console.error('Failed to load settings');
    return DEFAULT_SETTINGS;
  }
}

export function saveUserStoredSettings(userId: string, settings: UserSettings): void {
  if (!userId) return;
  try {
    localStorage.setItem(getUserSettingsKey(userId), JSON.stringify(settings));
  } catch {
    console.error('Failed to save settings');
  }
}

export function loadUserStoredWeeklyReviews(userId: string): Record<string, WeeklyReview> {
  if (!userId) return {};
  try {
    const raw = localStorage.getItem(getUserWeeklyReviewsKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    console.error('Failed to load weekly reviews');
    return {};
  }
}

export function saveUserStoredWeeklyReviews(userId: string, reviews: Record<string, WeeklyReview>): void {
  if (!userId) return;
  try {
    localStorage.setItem(getUserWeeklyReviewsKey(userId), JSON.stringify(reviews));
  } catch {
    console.error('Failed to save weekly reviews');
  }
}

export function clearUserStoredData(userId: string): void {
  if (!userId) return;
  try {
    localStorage.removeItem(getUserTasksKey(userId));
    localStorage.removeItem(getUserCategoriesKey(userId));
    localStorage.removeItem(getUserSchedulesKey(userId));
    localStorage.removeItem(getUserHabitsKey(userId));
    localStorage.removeItem(getUserSettingsKey(userId));
    localStorage.removeItem(getUserWeeklyReviewsKey(userId));
    localStorage.removeItem(getUserRemindersKey(userId));
    localStorage.removeItem(getUserNotificationsKey(userId));
    localStorage.removeItem(getUserTimetableTemplatesKey(userId));
  } catch {
    console.error('Failed to clear stored data');
  }
}

export function purgeLegacySharedStorage(): void {
  try {
    const legacyKeys = [
      'dayforge_test_user_session_v1',
      'dayforge_tasks_v3',
      'dayforge_categories_v1',
      'dayforge_schedules_v2',
      'dayforge_habits_v1',
      'dayforge_settings_v1',
      'dayforge_weekly_reviews_v1',
      'ombhi_user_undefined_tasks_v1',
      'ombhi_user_undefined_categories_v1',
      'ombhi_user_undefined_schedules_v1',
      'ombhi_user_undefined_habits_v1',
      'ombhi_user_undefined_tasks_v2',
      'ombhi_user_undefined_categories_v2',
    ];
    for (const key of legacyKeys) {
      localStorage.removeItem(key);
    }
  } catch {
    console.error('Failed to purge legacy shared storage');
  }
}

export function exportBackupJSON(
  tasks: Task[],
  schedules: RecurringSchedule[],
  categories: Category[],
  habits: Habit[],
  settings: UserSettings,
  reminders: Reminder[] = []
): void {
  const payload = {
    app: 'OmBhi',
    exportedAt: new Date().toISOString(),
    version: '2.0',
    tasks,
    schedules,
    categories,
    habits,
    settings,
    reminders,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ombhi_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Fallback legacy functions returning empty defaults (never demo data)
export function loadStoredTasks(): Task[] { return []; }
export function saveStoredTasks(_tasks: Task[]): void {}
export function loadStoredSchedules(): RecurringSchedule[] { return []; }
export function saveStoredSchedules(_schedules: RecurringSchedule[]): void {}
export function loadStoredCategories(): Category[] { return []; }
export function saveStoredCategories(_categories: Category[]): void {}
export function loadStoredHabits(): Habit[] { return []; }
export function saveStoredHabits(_habits: Habit[]): void {}
export function loadStoredSettings(): UserSettings { return DEFAULT_SETTINGS; }
export function saveStoredSettings(_settings: UserSettings): void {}
export function loadStoredWeeklyReviews(): Record<string, WeeklyReview> { return {}; }
export function saveStoredWeeklyReviews(_reviews: Record<string, WeeklyReview>): void {}
