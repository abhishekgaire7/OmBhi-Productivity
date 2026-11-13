import { Priority, ScheduleMode } from '../types';
import { getTodayString, parseISODate } from './date';

export interface ParsedTaskResult {
  title: string;
  durationMinutes: number | null;
  dates: string[];
  scheduleMode: ScheduleMode;
  recurrenceFrequency?: 'daily' | 'weekdays' | 'weekly' | 'custom_days';
  recurrenceDays?: number[]; // [0=Sun, 1=Mon, ..., 6=Sat]
  preferredTime: string | null; // "HH:mm"
  endTime?: string | null;     // "HH:mm"
  priority: Priority;
  suggestedCategoryId: string | null;
  categoryNameSuggestion?: string;
  notes?: string;
  ambiguitiesOrWarnings: string[];
}

/**
 * Parses natural language task prompts into a structured preview.
 * Deterministic, robust, and conservative: never silently invents missing details.
 */
export function parseNaturalLanguageTask(
  prompt: string,
  referenceDateStr: string = getTodayString(0),
  categories: { id: string; name: string }[] = []
): ParsedTaskResult {
  const text = prompt.trim();
  const lower = text.toLowerCase();
  const ambiguitiesOrWarnings: string[] = [];

  // 1. Detect Priority
  let priority: Priority = 'medium';
  if (/\b(urgent|asap|critical|highest priority|p1)\b/i.test(lower)) {
    priority = 'urgent';
  } else if (/\b(high priority|important|p2)\b/i.test(lower)) {
    priority = 'high';
  } else if (/\b(low priority|casual|whenever|p4)\b/i.test(lower)) {
    priority = 'low';
  }

  // 2. Detect Duration
  let durationMinutes: number | null = null;
  const hourMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i);
  const minMatch = lower.match(/(\d+)\s*(?:minutes?|mins?|m)\b/i);

  if (hourMatch) {
    const hours = parseFloat(hourMatch[1]);
    durationMinutes = Math.round(hours * 60);
  } else if (minMatch) {
    durationMinutes = parseInt(minMatch[1], 10);
  } else if (/\bone hour\b/i.test(lower)) {
    durationMinutes = 60;
  } else if (/\bhalf an hour|30 min\b/i.test(lower)) {
    durationMinutes = 30;
  } else if (/\btwo hours\b/i.test(lower)) {
    durationMinutes = 120;
  }

  // 3. Detect Time (Preferred Start Time)
  let preferredTime: string | null = null;
  // Patterns like "at 7 pm", "at 7:30 pm", "at 19:00", "7pm", "08:30"
  const timeRegex = /(?:at\s+)?(\b\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/gi;
  let match: RegExpExecArray | null;

  while ((match = timeRegex.exec(lower)) !== null) {
    const rawHour = parseInt(match[1], 10);
    const rawMin = match[2] ? parseInt(match[2], 10) : 0;
    const modifier = match[3];

    // Check if this looks like a genuine time (e.g. not a duration or date number)
    if (modifier || lower.includes(`at ${match[1]}`)) {
      let hour = rawHour;
      if (modifier === 'pm' && hour < 12) hour += 12;
      if (modifier === 'am' && hour === 12) hour = 0;
      if (hour >= 0 && hour <= 23 && rawMin >= 0 && rawMin <= 59) {
        preferredTime = `${String(hour).padStart(2, '0')}:${String(rawMin).padStart(2, '0')}`;
        break;
      }
    } else if (match[2] && rawHour >= 0 && rawHour <= 23 && rawMin >= 0 && rawMin <= 59) {
      // e.g. "19:00"
      preferredTime = `${String(rawHour).padStart(2, '0')}:${String(rawMin).padStart(2, '0')}`;
      break;
    }
  }

  // Calculate End Time if both start time and duration are known
  let endTime: string | null = null;
  if (preferredTime && durationMinutes) {
    const [h, m] = preferredTime.split(':').map(Number);
    const totalMinutes = h * 60 + m + durationMinutes;
    const endH = Math.min(23, Math.floor(totalMinutes / 60));
    const endM = totalMinutes % 60;
    endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  }

  // 4. Detect Recurrence & Schedule Mode
  let scheduleMode: ScheduleMode = 'single';
  let recurrenceFrequency: 'daily' | 'weekdays' | 'weekly' | 'custom_days' | undefined;
  let recurrenceDays: number[] | undefined;
  const dates: string[] = [];

  const dayMap: Record<string, number> = {
    sunday: 0,
    sun: 0,
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
  };

  if (/\bevery\s+weekday\b|\bon\s+weekdays\b/i.test(lower)) {
    scheduleMode = 'repeat';
    recurrenceFrequency = 'weekdays';
    recurrenceDays = [1, 2, 3, 4, 5];
  } else if (/\bevery\s+day\b|\bdaily\b/i.test(lower)) {
    scheduleMode = 'repeat';
    recurrenceFrequency = 'daily';
    recurrenceDays = [0, 1, 2, 3, 4, 5, 6];
  } else {
    // Check for named days of week: "Monday, Wednesday, and Friday" or "every Tuesday"
    const detectedDays = new Set<number>();
    for (const [dayName, dayIndex] of Object.entries(dayMap)) {
      const reg = new RegExp(`\\b${dayName}\\b`, 'i');
      if (reg.test(lower)) {
        detectedDays.add(dayIndex);
      }
    }

    if (detectedDays.size > 0) {
      if (detectedDays.size === 1 && !/\bevery\b/i.test(lower)) {
        // Single named day, e.g. "on Friday" -> find upcoming Friday date
        const targetDay = Array.from(detectedDays)[0];
        const refDate = parseISODate(referenceDateStr);
        let diff = targetDay - refDate.getDay();
        if (diff <= 0) diff += 7; // next occurrence
        refDate.setDate(refDate.getDate() + diff);
        dates.push(refDate.toISOString().split('T')[0]);
        scheduleMode = 'single';
      } else {
        // Multiple days e.g. "Monday, Wednesday, Friday" -> Recurring custom weekly schedule
        scheduleMode = 'repeat';
        recurrenceFrequency = 'custom_days';
        recurrenceDays = Array.from(detectedDays).sort((a, b) => a - b);
      }
    }
  }

  // Handle single date cues: "today", "tomorrow"
  if (dates.length === 0 && scheduleMode === 'single') {
    if (/\btomorrow\b/i.test(lower)) {
      const d = parseISODate(referenceDateStr);
      d.setDate(d.getDate() + 1);
      dates.push(d.toISOString().split('T')[0]);
    } else {
      dates.push(referenceDateStr);
    }
  }

  // 5. Clean Title Extraction
  // Remove matched scheduling keywords to isolate the core task title
  let cleanedTitle = text
    .replace(/\b(?:every\s+weekday|on\s+weekdays|every\s+day|daily)\b/gi, '')
    .replace(/\b(?:every\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:s)?\b/gi, '')
    .replace(/\b(?:and\s+|,)+/g, ' ')
    .replace(/\b(?:for\s+)?(?:\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m)|one hour|half an hour|30 min|two hours)\b/gi, '')
    .replace(/\b(?:at\s+)?(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/gi, '')
    .replace(/\b(?:from\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s+to\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/gi, '')
    .replace(/\b(?:tomorrow|today|tonight)\b/gi, '')
    .replace(/\b(?:schedule|add task|create task|plan|remind me to|i need to|urgent|high priority|low priority|priority)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Capitalize first letter
  if (cleanedTitle.length > 0) {
    cleanedTitle = cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1);
  } else {
    cleanedTitle = text;
  }

  // 6. Category Matching Suggestion
  let suggestedCategoryId: string | null = null;
  let categoryNameSuggestion: string | undefined;

  for (const cat of categories) {
    const catNameLower = cat.name.toLowerCase();
    if (
      lower.includes(catNameLower) ||
      (catNameLower === 'studies' && (lower.includes('study') || lower.includes('german') || lower.includes('exam') || lower.includes('university'))) ||
      (catNameLower === 'fitness' && (lower.includes('gym') || lower.includes('workout') || lower.includes('run') || lower.includes('exercise'))) ||
      (catNameLower === 'work' && (lower.includes('meeting') || lower.includes('client') || lower.includes('code') || lower.includes('project'))) ||
      (catNameLower === 'personal' && (lower.includes('clean') || lower.includes('dentist') || lower.includes('groceries') || lower.includes('call')))
    ) {
      suggestedCategoryId = cat.id;
      categoryNameSuggestion = cat.name;
      break;
    }
  }

  // 7. Ambiguity & Validation Checks
  if (!preferredTime) {
    ambiguitiesOrWarnings.push('No time specified: will be placed in "Anytime Today" unless set.');
  }
  if (!durationMinutes) {
    ambiguitiesOrWarnings.push('Duration not specified: will use standard default task duration.');
  }
  if (scheduleMode === 'repeat' && recurrenceDays && recurrenceDays.length > 0) {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    ambiguitiesOrWarnings.push(`Recurring weekly schedule on: ${recurrenceDays.map((d) => dayNames[d]).join(', ')}.`);
  }

  return {
    title: cleanedTitle || 'New Task',
    durationMinutes,
    dates: dates.length > 0 ? dates : [referenceDateStr],
    scheduleMode,
    recurrenceFrequency,
    recurrenceDays,
    preferredTime,
    endTime,
    priority,
    suggestedCategoryId,
    categoryNameSuggestion,
    ambiguitiesOrWarnings,
  };
}
