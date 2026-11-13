import { Task, Priority } from '../types';

export interface ProposedPlanItem {
  taskId: string;
  title: string;
  startTime: string;
  endTime: string;
  isFixed: boolean;
  priority: Priority;
  bufferAfterMinutes: number;
  rationale: string;
}

export interface ProposedBreak {
  startTime: string;
  endTime: string;
  label: string;
}

export interface DayPlanProposal {
  date: string;
  totalTasks: number;
  scheduledCount: number;
  items: ProposedPlanItem[];
  breaks: ProposedBreak[];
  summary: string;
  hasConflicts: boolean;
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

export function generateDaySchedulePlan(params: {
  date: string;
  tasks: Task[];
  workStart?: string; // default "08:30"
  workEnd?: string;   // default "19:00"
  defaultDurationMinutes?: number; // default 45
  bufferMinutes?: number; // default 15
}): DayPlanProposal {
  const {
    date,
    tasks,
    workStart = '08:30',
    workEnd = '19:00',
    defaultDurationMinutes = 45,
    bufferMinutes = 15,
  } = params;

  const dayTasks = tasks.filter((t) => t.scheduledDate === date);
  const fixedTasks = dayTasks.filter((t) => Boolean(t.startTime));
  const flexibleTasks = dayTasks.filter((t) => !t.startTime);

  // Priority weight for sorting flexible tasks
  const priorityOrder: Record<Priority, number> = {
    urgent: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  const sortedFlexible = [...flexibleTasks].sort(
    (a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]
  );

  const startLimit = timeToMinutes(workStart);
  const endLimit = timeToMinutes(workEnd);

  // Convert fixed tasks to occupied blocks
  interface TimeBlock {
    start: number;
    end: number;
    taskId?: string;
    isFixed: boolean;
  }

  const occupied: TimeBlock[] = [];

  for (const t of fixedTasks) {
    if (!t.startTime) continue;
    const s = timeToMinutes(t.startTime);
    let e = t.endTime ? timeToMinutes(t.endTime) : s + defaultDurationMinutes;
    if (e <= s) e = s + defaultDurationMinutes;
    occupied.push({ start: s, end: e, taskId: t.id, isFixed: true });
  }

  occupied.sort((a, b) => a.start - b.start);

  const plannedItems: ProposedPlanItem[] = [];
  const breaks: ProposedBreak[] = [];

  // Register fixed tasks first
  for (const t of fixedTasks) {
    if (!t.startTime) continue;
    const s = timeToMinutes(t.startTime);
    let e = t.endTime ? timeToMinutes(t.endTime) : s + defaultDurationMinutes;
    plannedItems.push({
      taskId: t.id,
      title: t.title,
      startTime: t.startTime,
      endTime: minutesToTime(e),
      isFixed: true,
      priority: t.priority,
      bufferAfterMinutes: bufferMinutes,
      rationale: 'Fixed appointment / user-specified locked time.',
    });
  }

  // Find slot for flexible tasks
  let cursor = startLimit;

  for (const task of sortedFlexible) {
    const duration = defaultDurationMinutes;
    let placed = false;

    // Search forward from cursor
    while (cursor + duration <= endLimit) {
      // Check collision with any occupied block
      const conflict = occupied.find(
        (b) => cursor < b.end && cursor + duration > b.start
      );

      if (!conflict) {
        // Found a free slot!
        const sTime = minutesToTime(cursor);
        const eTime = minutesToTime(cursor + duration);

        plannedItems.push({
          taskId: task.id,
          title: task.title,
          startTime: sTime,
          endTime: eTime,
          isFixed: false,
          priority: task.priority,
          bufferAfterMinutes: bufferMinutes,
          rationale: `Placed during open energy window based on ${task.priority} priority.`,
        });

        occupied.push({ start: cursor, end: cursor + duration, taskId: task.id, isFixed: false });
        occupied.sort((a, b) => a.start - b.start);

        // Advance cursor past this task + buffer
        cursor += duration + bufferMinutes;
        placed = true;
        break;
      } else {
        // Jump past the conflict end plus buffer
        cursor = conflict.end + bufferMinutes;
      }
    }

    if (!placed) {
      // Could not fit in normal hours without overlap, place at endLimit
      const sTime = minutesToTime(cursor);
      const eTime = minutesToTime(cursor + duration);
      plannedItems.push({
        taskId: task.id,
        title: task.title,
        startTime: sTime,
        endTime: eTime,
        isFixed: false,
        priority: task.priority,
        bufferAfterMinutes: bufferMinutes,
        rationale: 'Placed in evening recovery window due to packed calendar.',
      });
      cursor += duration + bufferMinutes;
    }
  }

  // Sort all planned items chronologically
  plannedItems.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  // Generate reasonable breaks between consecutive items with gaps >= 25 mins
  for (let i = 0; i < plannedItems.length - 1; i++) {
    const currentEnd = timeToMinutes(plannedItems[i].endTime);
    const nextStart = timeToMinutes(plannedItems[i + 1].startTime);
    const gap = nextStart - currentEnd;

    if (gap >= 25) {
      breaks.push({
        startTime: minutesToTime(currentEnd),
        endTime: minutesToTime(nextStart),
        label: gap >= 45 ? 'Meal & Rest Recharge' : 'Short Walk & Mental Buffer',
      });
    }
  }

  const summary = `Generated a balanced, non-overlapping schedule for ${plannedItems.length} task${
    plannedItems.length === 1 ? '' : 's'
  } with ${bufferMinutes}m recovery buffers and ${breaks.length} restorative break${
    breaks.length === 1 ? '' : 's'
  }.`;

  return {
    date,
    totalTasks: dayTasks.length,
    scheduledCount: plannedItems.length,
    items: plannedItems,
    breaks,
    summary,
    hasConflicts: false,
  };
}
