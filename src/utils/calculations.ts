import { Task } from '../types';

/**
 * Calculates full completion rate:
 * Number of completed scheduled tasks divided by total scheduled tasks * 100.
 * Failed and skipped tasks remain in the denominator.
 */
export function calculateFullCompletionRate(tasks: Task[]): number {
  if (tasks.length === 0) return 0;
  const completed = tasks.filter(t => t.status === 'completed').length;
  return Math.round((completed / tasks.length) * 100);
}

/**
 * Calculates average partial progress percentage (0 - 100)
 */
export function calculateAverageProgress(tasks: Task[]): number {
  if (tasks.length === 0) return 0;
  const sum = tasks.reduce((acc, t) => acc + (t.progress || 0), 0);
  return Math.round(sum / tasks.length);
}

/**
 * Calculates habit streak accurately based on consecutive days.
 * Streak counts backwards from today or yesterday.
 */
export function calculateHabitStreak(
  completedDates: string[],
  todayStr: string,
  yesterdayStr: string
): number {
  if (!completedDates || completedDates.length === 0) return 0;
  const uniqueSorted = Array.from(new Set(completedDates)).sort().reverse();

  // If neither today nor yesterday was completed, the streak has lapsed
  if (uniqueSorted[0] !== todayStr && uniqueSorted[0] !== yesterdayStr) {
    return 0;
  }

  let streak = 1;
  for (let i = 0; i < uniqueSorted.length - 1; i++) {
    const curr = new Date(uniqueSorted[i]);
    const next = new Date(uniqueSorted[i + 1]);
    const diffDays = Math.round((curr.getTime() - next.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Determines if a task is overdue.
 * True if scheduled date is prior to today and status is pending or in_progress.
 */
export function isTaskOverdue(task: Task, todayStr: string): boolean {
  if (task.status === 'completed' || task.status === 'skipped' || task.status === 'failed') {
    return false;
  }
  return task.scheduledDate < todayStr;
}

/**
 * Determines whether a task matches search, category, priority, and status filters.
 */
export function matchesTaskFilters(
  task: Task,
  query: string,
  categoryFilter: string,
  priorityFilter: string,
  statusFilter: string
): boolean {
  if (categoryFilter !== 'all' && task.categoryId !== categoryFilter) {
    return false;
  }
  if (priorityFilter !== 'all' && task.priority !== priorityFilter) {
    return false;
  }
  if (statusFilter !== 'all' && task.status !== statusFilter) {
    return false;
  }
  if (query.trim()) {
    const q = query.toLowerCase();
    const titleMatch = task.title.toLowerCase().includes(q);
    const descMatch = task.description ? task.description.toLowerCase().includes(q) : false;
    const notesMatch = task.notes ? task.notes.toLowerCase().includes(q) : false;
    if (!titleMatch && !descMatch && !notesMatch) {
      return false;
    }
  }
  return true;
}

export const MOTIVATIONAL_MESSAGES = [
  "Focus on what moves you forward.",
  "Small steps, consistent daily progress.",
  "Discipline creates effortless momentum.",
  "Make today count with clear intention.",
  "One focused block at a time.",
  "Consistency beats intensity every single time.",
  "Build the standard you respect.",
  "Show up for your future self today."
];

export function getMotivationalMessage(dayOfYear: number): string {
  return MOTIVATIONAL_MESSAGES[Math.abs(dayOfYear) % MOTIVATIONAL_MESSAGES.length];
}
