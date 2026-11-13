import { CelebrationScope, UserSettings } from '../types';

/**
 * Pure helper determining whether celebration animation (poppers/confetti)
 * should trigger for an event based on user preferences and current active animation state.
 * Prevents repeated celebrations from triggering unnecessarily.
 */
export function shouldTriggerCelebration(
  eventType: 'task' | 'habit' | 'reminder',
  settings: Partial<UserSettings> | undefined,
  isAlreadyCelebrating: boolean
): boolean {
  // If celebrations are disabled by user, never trigger
  if (!settings || settings.celebratoryAnimations === false) {
    return false;
  }

  // Prevent repeated celebrations while one is actively playing (prevents performance lag)
  if (isAlreadyCelebrating) {
    return false;
  }

  const scope: CelebrationScope = settings.celebrationScope || 'both';

  if (scope === 'both') {
    return true;
  }

  if (scope === 'tasks') {
    return eventType === 'task' || eventType === 'reminder';
  }

  if (scope === 'habits') {
    return eventType === 'habit';
  }

  return false;
}

/**
 * Pure guard ensuring celebration triggers ONLY when a task transitions
 * from incomplete to completed, and prevents repeated triggers for the same task.
 */
export function canCelebrateTaskTransition(
  taskId: string,
  wasCompleted: boolean,
  isNowCompleted: boolean,
  celebratedTaskIds: Set<string>
): boolean {
  // Only trigger celebration when changing from incomplete to completed
  if (wasCompleted || !isNowCompleted) {
    return false;
  }

  // Prevent confetti from repeatedly triggering for the same completed task
  if (celebratedTaskIds.has(taskId)) {
    return false;
  }

  return true;
}

export const CELEBRATION_DURATION_MS = 3000;
