import { Category, Habit, RecurringSchedule, Task, UserSettings } from '../types';

// Clean workspace defaults: Zero seeded demo categories, tasks, or habits
export const DEFAULT_CATEGORIES: Category[] = [];

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'light',
  timeFormat24h: true,
  startOfWeekMonday: true,
  defaultTaskDuration: 60,
  dailyFocusGoal: 5,
  celebratoryAnimations: true,
  celebrationScope: 'both',
  notificationSound: true,
};

export function getInitialSchedules(): RecurringSchedule[] {
  return [];
}

export function getInitialTasks(): Task[] {
  return [];
}

export function getInitialHabits(): Habit[] {
  return [];
}
