import { Category, Habit, Task, WeeklyReview } from '../types';
import { formatDateToISO, parseISODate } from './date';
import { authenticatedFetch } from './api';

export interface WeekInfo {
  weekKey: string;
  weekNumber: number;
  year: number;
  startDate: string;
  endDate: string;
  weekLabel: string;
  days: string[];
}

export interface DayPerformance {
  date: string;
  dayName: string;
  shortName: string;
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  inProgress: number;
  rate: number;
}

export interface WeeklyCategoryStat {
  id: string;
  name: string;
  color: string;
  total: number;
  completed: number;
  rate: number;
}

export interface WeeklyMetrics {
  totalPlanned: number;
  completed: number;
  failed: number;
  skipped: number;
  inProgress: number;
  pending: number;
  completionRate: number;
  dayStats: DayPerformance[];
  strongestDays: string[];
  toughestDays: string[];
  categoryBreakdown: WeeklyCategoryStat[];
  completedTasks: string[];
  missedTasks: string[];
  habitsSummary: string;
}

/**
 * Returns ISO week info for a given date
 */
export function getWeekInfo(referenceDate: Date = new Date(), startOfWeekMonday = true): WeekInfo {
  const d = new Date(referenceDate);
  d.setHours(0, 0, 0, 0);

  // Determine start of the week
  const day = d.getDay(); // 0 is Sunday, 1 is Monday
  const diff = startOfWeekMonday ? (day === 0 ? -6 : 1 - day) : -day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);

  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    days.push(formatDateToISO(cur));
  }

  const startDate = days[0];
  const endDate = days[6];

  // Calculate ISO week number
  const target = new Date(monday);
  target.setDate(target.getDate() + 3); // Thursday
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const weekNumber = Math.ceil(
    ((target.getTime() - firstThursday.getTime()) / 86400000 + firstThursday.getDay() + 1) / 7
  );
  const year = target.getFullYear();
  const weekKey = `${year}-W${String(weekNumber).padStart(2, '0')}`;

  const startParsed = parseISODate(startDate);
  const endParsed = parseISODate(endDate);
  const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  const yearFormatter = new Intl.DateTimeFormat('en-US', { year: 'numeric' });
  const weekLabel = `${monthFormatter.format(startParsed)} – ${monthFormatter.format(endParsed)}, ${yearFormatter.format(endParsed)}`;

  return {
    weekKey,
    weekNumber,
    year,
    startDate,
    endDate,
    weekLabel,
    days,
  };
}

/**
 * Calculates comprehensive metrics for a given week from task records and habits
 */
export function calculateWeeklyMetrics(
  tasks: Task[],
  categories: Category[],
  habits: Habit[],
  weekDays: string[]
): WeeklyMetrics {
  const weekTasks = tasks.filter((t) => weekDays.includes(t.scheduledDate));

  const totalPlanned = weekTasks.length;
  const completed = weekTasks.filter((t) => t.status === 'completed').length;
  const failed = weekTasks.filter((t) => t.status === 'failed').length;
  const skipped = weekTasks.filter((t) => t.status === 'skipped').length;
  const inProgress = weekTasks.filter((t) => t.status === 'in_progress').length;
  const pending = weekTasks.filter((t) => t.status === 'pending').length;

  const completionRate = totalPlanned > 0 ? Math.round((completed / totalPlanned) * 100) : 0;

  // Day of week analysis
  const dayStats: DayPerformance[] = weekDays.map((dateStr) => {
    const dayDate = parseISODate(dateStr);
    const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(dayDate);
    const shortName = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(dayDate);

    const dayTasks = weekTasks.filter((t) => t.scheduledDate === dateStr);
    const dayCompleted = dayTasks.filter((t) => t.status === 'completed').length;
    const dayFailed = dayTasks.filter((t) => t.status === 'failed').length;
    const daySkipped = dayTasks.filter((t) => t.status === 'skipped').length;
    const dayInProgress = dayTasks.filter((t) => t.status === 'in_progress').length;
    const rate = dayTasks.length > 0 ? Math.round((dayCompleted / dayTasks.length) * 100) : 0;

    return {
      date: dateStr,
      dayName,
      shortName,
      total: dayTasks.length,
      completed: dayCompleted,
      failed: dayFailed,
      skipped: daySkipped,
      inProgress: dayInProgress,
      rate,
    };
  });

  // Determine strongest days: days with tasks where rate is highest
  const daysWithTasks = dayStats.filter((d) => d.total > 0);
  let strongestDays: string[] = [];
  if (daysWithTasks.length > 0) {
    const maxRate = Math.max(...daysWithTasks.map((d) => d.rate));
    if (maxRate >= 50) {
      strongestDays = daysWithTasks
        .filter((d) => d.rate === maxRate)
        .map((d) => d.dayName);
    }
  }

  // Determine toughest days: days with failed/skipped tasks or lowest rate
  let toughestDays: string[] = [];
  const daysWithMisses = daysWithTasks.filter((d) => d.failed > 0 || d.skipped > 0);
  if (daysWithMisses.length > 0) {
    toughestDays = daysWithMisses.map((d) => d.dayName);
  } else if (daysWithTasks.length > 0) {
    const minRate = Math.min(...daysWithTasks.map((d) => d.rate));
    if (minRate < 100) {
      toughestDays = daysWithTasks
        .filter((d) => d.rate === minRate)
        .map((d) => d.dayName);
    }
  }

  // Category breakdown
  const categoryBreakdown: WeeklyCategoryStat[] = categories
    .map((cat) => {
      const catTasks = weekTasks.filter((t) => t.categoryId === cat.id);
      const catCompleted = catTasks.filter((t) => t.status === 'completed').length;
      const rate = catTasks.length > 0 ? Math.round((catCompleted / catTasks.length) * 100) : 0;
      return {
        id: cat.id,
        name: cat.name,
        color: cat.color,
        total: catTasks.length,
        completed: catCompleted,
        rate,
      };
    })
    .filter((c) => c.total > 0);

  // Completed & Missed Task Titles
  const completedTasks = weekTasks
    .filter((t) => t.status === 'completed')
    .map((t) => t.title);

  const missedTasks = weekTasks
    .filter((t) => t.status === 'failed' || t.status === 'skipped')
    .map((t) => `${t.title} (${t.status === 'skipped' ? 'skipped' : 'missed'})`);

  // Habit consistency summary for this week
  const habitsSummaryParts: string[] = habits.map((h) => {
    const hitsInWeek = h.completedDates.filter((d) => weekDays.includes(d)).length;
    return `${h.name}: ${hitsInWeek}/${h.targetDaysPerWeek} days completed (streak: ${h.streak}d)`;
  });
  const habitsSummary = habitsSummaryParts.length > 0 ? habitsSummaryParts.join('; ') : 'No habits tracked';

  return {
    totalPlanned,
    completed,
    failed,
    skipped,
    inProgress,
    pending,
    completionRate,
    dayStats,
    strongestDays,
    toughestDays,
    categoryBreakdown,
    completedTasks,
    missedTasks,
    habitsSummary,
  };
}

/**
 * Builds a deterministic, rich weekly review matching the exact prompt format
 */
export function generateDeterministicReview(
  metrics: WeeklyMetrics,
  weekInfo: WeekInfo,
  userReflection?: string
): WeeklyReview {
  const { totalPlanned, completed, skipped, failed, completionRate, strongestDays, toughestDays } = metrics;

  // Format Strongest Days sentence
  let strongestDaysSentence = '';
  if (strongestDays.length === 1) {
    strongestDaysSentence = `Your strongest day was ${strongestDays[0]}.`;
  } else if (strongestDays.length > 1) {
    const listStr =
      strongestDays.length === 2
        ? `${strongestDays[0]} and ${strongestDays[1]}`
        : `${strongestDays.slice(0, -1).join(', ')}, and ${strongestDays[strongestDays.length - 1]}`;
    strongestDaysSentence = `Your strongest days were ${listStr}.`;
  } else {
    strongestDaysSentence = totalPlanned > 0 ? 'Your momentum stayed steady across the week.' : 'No tasks scheduled.';
  }

  // Exact prompt example alignment:
  // “You planned 25 tasks, completed 19, and skipped 3. Your strongest days were Tuesday and Saturday.”
  let headline = '';
  if (totalPlanned === 0) {
    headline = 'No tasks were scheduled for this week. Use OmBhi to plan recurring routines and build steady daily habits.';
  } else {
    const parts: string[] = [`You planned ${totalPlanned} task${totalPlanned === 1 ? '' : 's'}`];
    parts.push(`completed ${completed}`);
    if (skipped > 0) parts.push(`and skipped ${skipped}`);
    if (failed > 0) parts.push(`(${failed} missed)`);
    headline = `${parts.join(', ')}. ${strongestDaysSentence}`;
  }

  // Momentum score
  let momentumScore = 'Steady Consistency 🌱';
  if (completionRate >= 85) {
    momentumScore = 'Exceptional Flow 🚀';
  } else if (completionRate >= 70) {
    momentumScore = 'Strong Momentum 🔥';
  } else if (completionRate >= 50) {
    momentumScore = 'Steady Consistency 🌱';
  } else if (totalPlanned > 0) {
    momentumScore = 'Rebuilding Rhythm ⚡';
  } else {
    momentumScore = 'Fresh Horizon ✨';
  }

  // What Worked Well
  const whatWorked: string[] = [];
  if (completed > 0) {
    whatWorked.push(
      `Successfully delivered ${completed} task${completed === 1 ? '' : 's'} (${completionRate}% completion rate) across the week.`
    );
  }
  if (strongestDays.length > 0) {
    whatWorked.push(`Peak focus achieved on ${strongestDays.join(' and ')}, maintaining unbroken follow-through.`);
  }
  const topCategory = metrics.categoryBreakdown.find((c) => c.rate >= 75);
  if (topCategory) {
    whatWorked.push(
      `High consistency in ${topCategory.name}: finished ${topCategory.completed} of ${topCategory.total} commitments.`
    );
  } else if (whatWorked.length < 2) {
    whatWorked.push('Kept daily visibility in OmBhi and logged task progress consistently.');
  }

  // What Was Missed
  const whatWasMissed: string[] = [];
  if (skipped > 0 || failed > 0) {
    whatWasMissed.push(
      `${skipped + failed} task${skipped + failed === 1 ? '' : 's'} deferred or missed (${skipped} skipped, ${failed} uncompleted).`
    );
  }
  if (toughestDays.length > 0 && toughestDays.some((d) => !strongestDays.includes(d))) {
    const diffDays = toughestDays.filter((d) => !strongestDays.includes(d));
    if (diffDays.length > 0) {
      whatWasMissed.push(`Task friction accumulated predominantly on ${diffDays.join(', ')}, signaling afternoon energy dips or over-scheduling.`);
    }
  }
  if (metrics.inProgress > 0) {
    whatWasMissed.push(`${metrics.inProgress} active task${metrics.inProgress === 1 ? '' : 's'} remained unfinished at week's close.`);
  }
  if (whatWasMissed.length === 0) {
    whatWasMissed.push('Zero tasks dropped or failed this week. Exemplary execution across all scheduled blocks.');
  }

  // What To Change Next Week
  const whatToChange: string[] = [];
  if (skipped > 0 || failed > 0) {
    whatToChange.push(
      'Cap daily high-priority tasks to 3 and introduce 30-minute buffer windows between deep work blocks.'
    );
  }
  if (toughestDays.length > 0) {
    whatToChange.push(
      `Lighten planned load on ${toughestDays[0]} by moving demanding study or workout sessions to your stronger days.`
    );
  }
  whatToChange.push(
    'Audit recurring tasks on Sunday evening to ensure realistic time-blocks for upcoming university and language goals.'
  );

  // Focus next week
  let focusNextWeek = 'Protect your morning deep-work blocks and maintain consistent daily execution.';
  if (topCategory) {
    focusNextWeek = `Sustain momentum in ${topCategory.name} while balancing rest and mid-week pacing.`;
  } else if (completionRate < 60 && totalPlanned > 0) {
    focusNextWeek = 'Simplify the weekly schedule: focus on quality completions over volume.';
  }

  const encouragement =
    completionRate >= 80
      ? 'Outstanding dedication this week. You built serious compounding momentum.'
      : 'Progress is about consistency, not perfection. Take the learnings into next week and keep moving forward.';

  return {
    id: `review-${weekInfo.weekKey}`,
    weekKey: weekInfo.weekKey,
    weekLabel: weekInfo.weekLabel,
    startDate: weekInfo.startDate,
    endDate: weekInfo.endDate,
    createdAt: new Date().toISOString(),
    source: 'local_fallback',
    headline,
    momentumScore,
    completionRate,
    totalPlanned,
    completedCount: completed,
    skippedCount: skipped,
    failedCount: failed,
    inProgressCount: metrics.inProgress,
    strongestDays,
    toughestDays,
    whatWorked,
    whatWasMissed,
    whatToChange,
    focusNextWeek,
    encouragement,
    userReflection,
  };
}

/**
 * Requests an AI Weekly Review from the server API, falling back gracefully to deterministic analysis
 */
export async function requestAIWeeklyReview(
  tasks: Task[],
  categories: Category[],
  habits: Habit[],
  weekInfo: WeekInfo,
  userReflection?: string
): Promise<WeeklyReview> {
  const metrics = calculateWeeklyMetrics(tasks, categories, habits, weekInfo.days);

  try {
    const payload = {
      weekKey: weekInfo.weekKey,
      weekLabel: weekInfo.weekLabel,
      startDate: weekInfo.startDate,
      endDate: weekInfo.endDate,
      metrics: {
        totalPlanned: metrics.totalPlanned,
        completed: metrics.completed,
        failed: metrics.failed,
        skipped: metrics.skipped,
        inProgress: metrics.inProgress,
        completionRate: metrics.completionRate,
        strongestDays: metrics.strongestDays,
        toughestDays: metrics.toughestDays,
        categoryBreakdown: metrics.categoryBreakdown,
      },
      tasksSummary: {
        completedTasks: metrics.completedTasks,
        missedTasks: metrics.missedTasks,
      },
      habitsSummary: metrics.habitsSummary,
      userReflection: userReflection || '',
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000); // 35s timeout to allow resilient model failover

    const res = await authenticatedFetch('/api/ai/weekly-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.review) {
        const r = data.review;
        return {
          id: `review-${weekInfo.weekKey}`,
          weekKey: weekInfo.weekKey,
          weekLabel: weekInfo.weekLabel,
          startDate: weekInfo.startDate,
          endDate: weekInfo.endDate,
          createdAt: new Date().toISOString(),
          source: 'ai',
          headline: r.headline || metrics.completedTasks.length > 0
            ? r.headline
            : `You planned ${metrics.totalPlanned} tasks, completed ${metrics.completed}, and skipped ${metrics.skipped}.`,
          momentumScore: r.momentumScore || 'Strong Momentum 🔥',
          completionRate: metrics.completionRate,
          totalPlanned: metrics.totalPlanned,
          completedCount: metrics.completed,
          skippedCount: metrics.skipped,
          failedCount: metrics.failed,
          inProgressCount: metrics.inProgress,
          strongestDays: metrics.strongestDays,
          toughestDays: metrics.toughestDays,
          whatWorked: Array.isArray(r.whatWorked) && r.whatWorked.length > 0 ? r.whatWorked : ['Delivered key planned tasks.'],
          whatWasMissed: Array.isArray(r.whatWasMissed) && r.whatWasMissed.length > 0 ? r.whatWasMissed : ['Few tasks deferred.'],
          whatToChange: Array.isArray(r.whatToChange) && r.whatToChange.length > 0 ? r.whatToChange : ['Adjust time buffers.'],
          focusNextWeek: r.focusNextWeek || 'Prioritize consistent execution of core goals.',
          encouragement: r.encouragement || 'Keep building consistent daily momentum.',
          userReflection,
        };
      }
    }
  } catch (err) {
    console.warn('AI Weekly Review server call unhandled or timed out; falling back to local engine:', err);
  }

  // Graceful deterministic fallback
  return generateDeterministicReview(metrics, weekInfo, userReflection);
}
