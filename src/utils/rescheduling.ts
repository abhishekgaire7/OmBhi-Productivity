import { Task } from '../types';
import { formatReadableDate, parseISODate } from './date';

export interface RescheduleRecommendation {
  date: string; // YYYY-MM-DD
  dateDisplay: string; // "Tomorrow, Oct 29"
  startTime: string; // "10:00"
  endTime: string; // "10:45"
  dayOfWeek: string; // "Thursday"
  reason: string;
  conflictFree: boolean;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function recommendRescheduleSlots(
  task: Task,
  allTasks: Task[],
  referenceDateStr: string
): RescheduleRecommendation[] {
  // Determine duration
  let duration = 45;
  if (task.startTime && task.endTime) {
    const diff = timeToMinutes(task.endTime) - timeToMinutes(task.startTime);
    if (diff > 0) duration = diff;
  }

  const recommendations: RescheduleRecommendation[] = [];
  const candidateDays: { dateStr: string; label: string; dayOfWeek: string }[] = [];

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  for (let offset = 1; offset <= 5; offset++) {
    const d = parseISODate(referenceDateStr);
    d.setDate(d.getDate() + offset);
    const dateStr = d.toISOString().split('T')[0];
    const dayOfWeek = dayNames[d.getDay()];
    const label = offset === 1 ? 'Tomorrow' : `In ${offset} days`;
    candidateDays.push({ dateStr, label, dayOfWeek });
  }

  // Desired time window preferences depending on task category / title
  const lowerTitle = task.title.toLowerCase();
  const prefersMorning = lowerTitle.includes('german') || lowerTitle.includes('study') || lowerTitle.includes('deep');

  // Candidate anchor hours
  const candidateHours = prefersMorning
    ? ['09:30', '11:00', '14:30', '16:00', '10:00']
    : ['10:00', '14:00', '16:30', '09:00', '15:00'];

  for (const day of candidateDays) {
    const tasksOnDay = allTasks.filter(
      (t) => t.scheduledDate === day.dateStr && t.id !== task.id
    );

    for (const startStr of candidateHours) {
      if (recommendations.length >= 3) break;

      const startMin = timeToMinutes(startStr);
      const endMin = startMin + duration;

      // Check conflict with any scheduled task on that day
      const hasConflict = tasksOnDay.some((t) => {
        if (!t.startTime) return false;
        const tStart = timeToMinutes(t.startTime);
        let tEnd = t.endTime ? timeToMinutes(t.endTime) : tStart + 45;
        return startMin < tEnd && endMin > tStart;
      });

      if (!hasConflict) {
        recommendations.push({
          date: day.dateStr,
          dateDisplay: `${day.label} (${formatReadableDate(day.dateStr)})`,
          startTime: startStr,
          endTime: minutesToTime(endMin),
          dayOfWeek: day.dayOfWeek,
          reason:
            tasksOnDay.length === 0
              ? 'Completely open day with zero scheduled conflicts.'
              : `Conflict-free ${duration}m focus window with ${tasksOnDay.length} other planned tasks.`,
          conflictFree: true,
        });
        break; // One strong candidate per day to keep variety
      }
    }

    if (recommendations.length >= 3) break;
  }

  return recommendations;
}

/**
 * Reschedules ONLY the specific task instance.
 * Preserves the recurring series and does not touch other dates.
 */
export function rescheduleSingleOccurrence(
  task: Task,
  targetDate: string,
  targetStartTime?: string,
  targetEndTime?: string
): Task {
  return {
    ...task,
    scheduledDate: targetDate,
    startTime: targetStartTime || task.startTime,
    endTime: targetEndTime || task.endTime,
    status: 'pending', // reset to pending so user can execute it
    progress: 0,
    isDetached: Boolean(task.seriesId), // If part of recurring series, mark as detached occurrence
    updatedAt: new Date().toISOString(),
  };
}
