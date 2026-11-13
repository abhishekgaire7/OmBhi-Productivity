export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

export type RecurrenceType = 'none' | 'daily' | 'weekdays' | 'weekly' | 'custom';

export type ScheduleMode = 'single' | 'repeat' | 'multi_date';

export type RecurrenceFrequency = 'daily' | 'weekdays' | 'weekly' | 'custom_days';

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface RecurringSchedule {
  id: string; // stable seriesId
  title: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  categoryId: string;
  priority: Priority;
  subtasks: Subtask[];
  notes?: string;
  scheduleMode: 'repeat' | 'multi_date';
  frequency?: RecurrenceFrequency;
  recurrenceDays?: number[]; // [0=Sun, 1=Mon, ..., 6=Sat]
  specificDates?: string[]; // array of YYYY-MM-DD
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  isPaused: boolean;
  excludedDates: string[]; // dates where individual occurrences were deleted/skipped
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  seriesId?: string; // links to RecurringSchedule
  title: string;
  description?: string;
  scheduledDate: string; // YYYY-MM-DD in local time
  startTime?: string;    // HH:mm (24h)
  endTime?: string;      // HH:mm (24h)
  categoryId: string;
  priority: Priority;
  status: TaskStatus;
  progress: number;      // 0 - 100
  subtasks: Subtask[];
  notes?: string;
  recurrence?: RecurrenceType;
  recurrenceDays?: number[];
  scheduleSummary?: string; // e.g. "Every Mon, Wed, Fri"
  isDetached?: boolean;     // true if edited as single occurrence
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  isDefault?: boolean;
}

export interface Habit {
  id: string;
  name: string;
  categoryId: string;
  frequency: 'daily' | 'weekdays' | 'custom';
  targetDaysPerWeek: number;
  completedDates: string[]; // array of YYYY-MM-DD
  streak: number;
  notes?: string;
}

export type CelebrationScope = 'both' | 'tasks' | 'habits';

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  timeFormat24h: boolean;
  startOfWeekMonday: boolean;
  defaultTaskDuration: number;
  dailyFocusGoal: number;
  celebratoryAnimations: boolean;
  celebrationScope?: CelebrationScope;
  timezone?: string;
  defaultNotificationMethod?: NotificationMethod;
  notificationSound?: boolean;
}

export type ReminderPriority = 'low' | 'medium' | 'high' | 'urgent';

export type ReminderRepeat = 'never' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export type NotificationMethod = 'in_app' | 'email' | 'both';

export interface Reminder {
  id: string;
  userId: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm (24-hour)
  categoryId: string;
  priority: ReminderPriority;
  repeat: ReminderRepeat;
  customRepeatDays?: number[]; // [0=Sun, 1=Mon, ..., 6=Sat]
  notificationMethod?: NotificationMethod;
  completed: boolean;
  completedAt?: string;
  snoozedUntil?: string; // ISO string
  lastNotifiedAt?: string; // ISO string for duplicate prevention
  emailSentAt?: string; // ISO string for legacy compatibility
  timezone?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InAppNotification {
  id: string;
  userId: string;
  reminderId?: string;
  taskId?: string;
  habitId?: string;
  itemType?: 'task' | 'habit' | 'reminder' | 'system';
  targetId?: string;
  title: string;
  message: string;
  priority: ReminderPriority;
  read: boolean;
  scheduledFor?: string; // ISO string
  createdAt: string;
}

export interface WeeklyReview {
  id: string; // "review-YYYY-Wxx"
  weekKey: string; // "2026-W44"
  weekLabel: string; // "Week 44 (Oct 26 – Nov 1, 2026)"
  startDate: string; // "2026-10-26"
  endDate: string; // "2026-11-01"
  createdAt: string;
  source: 'ai' | 'local_fallback';
  headline: string;
  momentumScore: string;
  completionRate: number;
  totalPlanned: number;
  completedCount: number;
  skippedCount: number;
  failedCount: number;
  inProgressCount: number;
  strongestDays: string[];
  toughestDays: string[];
  whatWorked: string[];
  whatWasMissed: string[];
  whatToChange: string[];
  focusNextWeek: string;
  encouragement: string;
  userReflection?: string;
}

export interface TimetableSlot {
  id: string;
  title: string;
  startTime: string; // HH:mm (24-hour)
  endTime: string;   // HH:mm (24-hour)
  categoryId?: string;
  priority: Priority;
  notes?: string;
  locationOrLink?: string;
  color?: string;
  dayOfWeek?: number; // 0=Sun..6=Sat for multi-day templates
}

export interface TimetableTemplate {
  id: string;
  userId?: string;
  name: string; // e.g. "University Semester 1", "Workday Focus Schedule"
  description?: string;
  mode: 'auto_chunks' | 'manual';
  startTime?: string;
  endTime?: string;
  chunkDuration?: number; // minutes
  breakDuration?: number; // minutes
  daysOfWeek?: number[]; // [1, 2, 3, 4, 5]
  slots: TimetableSlot[];
  createdAt: string;
  updatedAt: string;
}

export type AppView =
  | 'dashboard'
  | 'myday'
  | 'calendar'
  | 'timetable'
  | 'alltasks'
  | 'reminders'
  | 'habits'
  | 'analytics'
  | 'review'
  | 'coach'
  | 'categories'
  | 'settings';

