import { Priority, TimetableSlot } from '../types';

/**
 * Converts "HH:mm" 24h string to total minutes from midnight
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

/**
 * Converts total minutes from midnight to "HH:mm" 24h string
 */
export function minutesToTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export interface AutoChunkOptions {
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  chunkMinutes: number; // e.g. 15, 30, 45, 60, 90
  breakMinutes?: number; // e.g. 0, 5, 10
  defaultTitle?: string;
  defaultPriority?: Priority;
  defaultCategoryId?: string;
}

/**
 * Automatically divides a start and end time window into discrete chunked blocks
 * Example: 10:00 to 12:00 with 30m chunk -> 4 blocks: 10:00-10:30, 10:30-11:00, 11:00-11:30, 11:30-12:00
 * Example: 08:00 to 12:00 with 60m chunk -> 4 blocks: 08:00-09:00, 09:00-10:00, 10:00-11:00, 11:00-12:00
 */
export function generateAutoChunks(options: AutoChunkOptions): TimetableSlot[] {
  const {
    startTime,
    endTime,
    chunkMinutes,
    breakMinutes = 0,
    defaultTitle = 'Focus Block',
    defaultPriority = 'medium',
    defaultCategoryId,
  } = options;

  const startMins = timeToMinutes(startTime);
  const endMins = timeToMinutes(endTime);

  if (chunkMinutes <= 0 || endMins <= startMins) {
    return [];
  }

  const slots: TimetableSlot[] = [];
  let currentStart = startMins;
  let index = 1;

  while (currentStart + chunkMinutes <= endMins) {
    const currentEnd = currentStart + chunkMinutes;
    slots.push({
      id: `slot-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
      title: `${defaultTitle} ${index}`,
      startTime: minutesToTime(currentStart),
      endTime: minutesToTime(currentEnd),
      priority: defaultPriority,
      categoryId: defaultCategoryId,
    });

    currentStart = currentEnd + Math.max(0, breakMinutes);
    index++;
  }

  return slots;
}

/**
 * Calculates total productive minutes across an array of slots
 */
export function calculateTotalDurationMinutes(slots: TimetableSlot[]): number {
  return slots.reduce((total, s) => {
    const start = timeToMinutes(s.startTime);
    const end = timeToMinutes(s.endTime);
    if (end > start) {
      return total + (end - start);
    }
    return total;
  }, 0);
}

/**
 * Formats duration in minutes to human-readable format e.g. "2h 30m"
 */
export function formatDurationHuman(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export const PRESET_CHUNKS = [
  { label: '15 Min (Micro Sprints)', value: 15 },
  { label: '30 Min (Quick Blocks)', value: 30 },
  { label: '45 Min (Standard Pomodoro)', value: 45 },
  { label: '60 Min (Hourly Blocks)', value: 60 },
  { label: '90 Min (Ultradian Deep Work)', value: 90 },
];

export const PRESET_BREAKS = [
  { label: 'No Break (0m)', value: 0 },
  { label: '5 Min Short Rest', value: 5 },
  { label: '10 Min Buffer', value: 10 },
  { label: '15 Min Break', value: 15 },
];

export const QUICK_TAG_SUGGESTIONS = [
  'Deep Work',
  'Lecture / Class',
  'Study Block',
  'Code & Build',
  'Review & Prep',
  'Gym / Workout',
  'Reading',
  'Team Sync',
  'Open Slot',
  'Lunch / Rest',
];
