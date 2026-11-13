import { useState, useMemo } from 'react';
import {
  BarChart3,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import { Category, Task } from '../types';
import {
  calculateAverageProgress,
  calculateFullCompletionRate,
} from '../utils/calculations';
import { formatReadableDate, getTodayString } from '../utils/date';

interface AnalyticsViewProps {
  tasks: Task[];
  categories: Category[];
  onNavigateToReview?: () => void;
}

export function AnalyticsView({ tasks, categories, onNavigateToReview }: AnalyticsViewProps) {
  const [range, setRange] = useState<'week' | 'month'>('week');

  const daysCount = range === 'week' ? 7 : 30;
  const targetDates = useMemo(() => {
    return Array.from({ length: daysCount }, (_, i) => getTodayString(-i));
  }, [daysCount]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => targetDates.includes(t.scheduledDate));
  }, [tasks, targetDates]);

  // Dynamic Metrics per formula
  const totalScheduled = filteredTasks.length;
  const completedCount = filteredTasks.filter((t) => t.status === 'completed').length;
  const failedCount = filteredTasks.filter((t) => t.status === 'failed').length;
  const skippedCount = filteredTasks.filter((t) => t.status === 'skipped').length;
  const inProgressCount = filteredTasks.filter((t) => t.status === 'in_progress').length;
  const pendingCount = filteredTasks.filter((t) => t.status === 'pending').length;

  const fullCompletionRate = calculateFullCompletionRate(filteredTasks);
  const avgPartialProgress = calculateAverageProgress(filteredTasks);

  // Daily trend data (ordered chronologically)
  const dailyTrends = useMemo(() => {
    const datesChronological = [...targetDates].reverse();
    return datesChronological.map((dateStr) => {
      const dayTasks = tasks.filter((t) => t.scheduledDate === dateStr);
      const dayCompleted = dayTasks.filter((t) => t.status === 'completed').length;
      const rate = dayTasks.length > 0 ? Math.round((dayCompleted / dayTasks.length) * 100) : 0;
      return {
        date: dateStr,
        label: formatReadableDate(dateStr),
        total: dayTasks.length,
        completed: dayCompleted,
        rate,
      };
    });
  }, [targetDates, tasks]);

  // Category breakdown
  const categoryStats = useMemo(() => {
    return categories.map((cat) => {
      const catTasks = filteredTasks.filter((t) => t.categoryId === cat.id);
      const catCompleted = catTasks.filter((t) => t.status === 'completed').length;
      const rate = catTasks.length > 0 ? Math.round((catCompleted / catTasks.length) * 100) : 0;
      return {
        ...cat,
        total: catTasks.length,
        completed: catCompleted,
        rate,
      };
    });
  }, [categories, filteredTasks]);

  return (
    <div className="space-y-6">
      {/* Header and Range Selector */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-gray-200/90 bg-white p-6 shadow-xs sm:flex-row sm:items-center dark:border-slate-800 dark:bg-[#1E293B]">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
            Performance & Completion Analytics
          </h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Real progress derived from scheduled tasks. Failed and skipped tasks remain in the denominator.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {onNavigateToReview && (
            <button
              type="button"
              onClick={onNavigateToReview}
              className="flex items-center gap-1.5 rounded-xl bg-[#6657E8]/10 px-3.5 py-1.5 text-xs font-semibold text-[#6657E8] hover:bg-[#6657E8]/20 dark:bg-[#6657E8]/20 dark:text-[#A59DF7] transition"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>AI Weekly Review</span>
            </button>
          )}

          <div className="flex overflow-hidden rounded-xl border border-gray-200 bg-gray-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setRange('week')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                range === 'week'
                  ? 'bg-white text-[#6657E8] shadow-xs dark:bg-[#1E293B] dark:text-[#A59DF7]'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Last 7 Days
            </button>
            <button
              type="button"
              onClick={() => setRange('month')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                range === 'month'
                  ? 'bg-white text-[#6657E8] shadow-xs dark:bg-[#1E293B] dark:text-[#A59DF7]'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Last 30 Days
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {/* Full Completion */}
        <div className="rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
          <div className="flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider">
            <span>Full Completion</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-[#6657E8] tabular-nums dark:text-[#A59DF7]">
            {fullCompletionRate}%
          </p>
          <p className="mt-1 text-[11px] text-gray-400">
            {completedCount} of {totalScheduled} completed
          </p>
        </div>

        {/* Average Partial Progress */}
        <div className="rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
          <div className="flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider">
            <span>Avg Partial Progress</span>
            <TrendingUp className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-amber-600 tabular-nums dark:text-amber-400">
            {avgPartialProgress}%
          </p>
          <p className="mt-1 text-[11px] text-gray-400">Average across active tasks</p>
        </div>

        {/* Failed / Skipped */}
        <div className="rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
          <div className="flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider">
            <span>Failed / Skipped</span>
            <XCircle className="h-4 w-4 text-rose-500" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-rose-600 tabular-nums dark:text-rose-400">
            {failedCount + skippedCount}
          </p>
          <p className="mt-1 text-[11px] text-gray-400">
            {failedCount} failed · {skippedCount} skipped
          </p>
        </div>

        {/* Active In Flight */}
        <div className="rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
          <div className="flex items-center justify-between text-xs font-semibold text-gray-400 uppercase tracking-wider">
            <span>In Flight</span>
            <Clock className="h-4 w-4 text-indigo-400" />
          </div>
          <p className="mt-2 text-3xl font-extrabold text-gray-900 tabular-nums dark:text-white">
            {inProgressCount + pendingCount}
          </p>
          <p className="mt-1 text-[11px] text-gray-400">
            {inProgressCount} active · {pendingCount} queue
          </p>
        </div>
      </div>

      {/* Completion Trends Over Time Chart */}
      <div className="rounded-2xl border border-gray-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
              Daily Completion History
            </h3>
            <p className="text-xs text-gray-400">
              Percentage of tasks completed on each scheduled day
            </p>
          </div>
          <span className="text-xs font-bold text-[#6657E8]">{range === 'week' ? '7 Days' : '30 Days'}</span>
        </div>

        <div className="flex h-44 items-end gap-1.5 pt-4">
          {dailyTrends.map((d) => (
            <div key={d.date} className="group relative flex flex-1 flex-col items-center h-full justify-end">
              {/* Tooltip on hover */}
              <div className="pointer-events-none absolute -top-8 z-10 hidden rounded bg-[#172033] px-2 py-1 text-[10px] font-semibold text-white group-hover:block dark:bg-white dark:text-[#172033]">
                {d.label}: {d.completed}/{d.total} ({d.rate}%)
              </div>

              {/* Bar */}
              <div
                className={`w-full max-w-[28px] rounded-t-md transition-all ${
                  d.rate >= 80
                    ? 'bg-emerald-500'
                    : d.rate >= 50
                    ? 'bg-[#6657E8]'
                    : d.total > 0
                    ? 'bg-amber-500'
                    : 'bg-gray-200 dark:bg-slate-800'
                }`}
                style={{ height: `${Math.max(6, d.rate)}%` }}
              />

              {/* Day Label */}
              <span className="mt-2 text-[9px] font-semibold text-gray-400 truncate w-full text-center">
                {d.label.split(',')[0].slice(0, 3)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="rounded-2xl border border-gray-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
        <h3 className="mb-4 text-sm font-bold text-gray-900 dark:text-white">
          Category Completion Rates
        </h3>

        <div className="space-y-4">
          {categoryStats.map((cat) => (
            <div key={cat.id} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                  <span>{cat.name}</span>
                </span>
                <span className="tabular-nums text-gray-500">
                  {cat.completed} of {cat.total} tasks completed ({cat.rate}%)
                </span>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${cat.rate}%`,
                    backgroundColor: cat.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
