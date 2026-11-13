import { useMemo } from 'react';
import {
  Compass,
  Sparkles,
  TrendingUp,
  Clock,
  Calendar,
  CheckCircle2,
  ShieldAlert,
  ArrowUpRight,
  Flame,
  Target,
} from 'lucide-react';
import { Category, Habit, Task } from '../types';
import { generateConsistencyCoachAnalysis } from '../utils/consistencyCoach';

interface ConsistencyCoachViewProps {
  tasks: Task[];
  habits: Habit[];
  categories: Category[];
  onOpenNewTask: () => void;
}

export function ConsistencyCoachView({
  tasks,
  habits,
  categories,
  onOpenNewTask,
}: ConsistencyCoachViewProps) {
  const analysis = useMemo(() => {
    return generateConsistencyCoachAnalysis(tasks, habits, categories);
  }, [tasks, habits, categories]);

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-gray-200/90 bg-white p-6 shadow-xs sm:flex-row sm:items-center dark:border-slate-800 dark:bg-[#1E293B]">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#6657E8]/10 text-[#6657E8] dark:bg-[#6657E8]/20 dark:text-[#A59DF7]">
            <Compass className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
                AI Consistency Coach
              </h2>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                Ground Truth Analysis
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Concise, practical recommendations grounded exclusively in your real task and habit data
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenNewTask}
          className="flex items-center gap-1.5 self-start rounded-xl bg-[#6657E8] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#5544DB] transition sm:self-auto"
        >
          <Sparkles className="h-4 w-4" />
          <span>Quick Plan Task</span>
        </button>
      </div>

      {/* Limited data notice if applicable */}
      {!analysis.hasSufficientData && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p>
            <span className="font-semibold">Building Historical Baseline:</span> You have logged {analysis.totalAnalyzedTasks} task{analysis.totalAnalyzedTasks === 1 ? '' : 's'}. Recommendations are grounded strictly in your current entries to avoid unmeasured speculation.
          </p>
        </div>
      )}

      {/* Top 3 Score Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Consistency Index */}
        <div className="rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Consistency Index
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-gray-900 dark:text-white">
              {analysis.consistencyScore}
            </span>
            <span className="text-xs text-gray-400">/ 100</span>
          </div>
          <div className={`mt-2 flex items-center gap-1.5 text-xs font-medium ${analysis.hasCompletedTasks ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}>
            <TrendingUp className="h-3.5 w-3.5" />
            <span>
              {analysis.hasCompletedTasks
                ? analysis.statusLabel
                : 'No completed tasks yet'}
            </span>
          </div>
        </div>

        {/* Strongest Focus Window */}
        <div className="rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Peak Energy Window
          </span>
          <div className="mt-2 flex items-center gap-2">
            <Clock className="h-6 w-6 text-[#6657E8] dark:text-[#A59DF7]" />
            <span className="text-lg font-bold text-gray-900 dark:text-white">
              {analysis.strongestTimeWindow}
            </span>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Highest completion rate achieved during this window
          </p>
        </div>

        {/* Best Day of Week */}
        <div className="rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Most Consistent Day
          </span>
          <div className="mt-2 flex items-center gap-2">
            <Calendar className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            <span className="text-lg font-bold text-gray-900 dark:text-white">
              {analysis.bestDay}s
            </span>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Lowest cancellation and skip rate across your calendar
          </p>
        </div>
      </div>

      {/* Actionable Recommendations (Non-shaming, constructive) */}
      <section
        aria-labelledby="coach-recommendations-heading"
        className="rounded-2xl border border-gray-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]"
      >
        <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-[#6657E8] dark:text-[#A59DF7]" />
            <h3 id="coach-recommendations-heading" className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Concise Actionable Adjustments
            </h3>
          </div>
          <span className="text-xs text-gray-400">Zero shaming • Pure execution clarity</span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {analysis.recommendations.map((rec, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4 transition hover:border-[#6657E8]/40 dark:border-slate-700/80 dark:bg-slate-800/50"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#6657E8]/10 text-xs font-bold text-[#6657E8] dark:bg-[#6657E8]/20 dark:text-[#A59DF7]">
                {idx + 1}
              </div>
              <p className="text-xs leading-relaxed font-medium text-gray-700 dark:text-gray-300">
                {rec}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Grid: Time of Day & Day of Week Execution Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Time of Day Breakdown */}
        <section
          aria-labelledby="time-of-day-heading"
          className="rounded-2xl border border-gray-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]"
        >
          <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3 dark:border-slate-800">
            <h3 id="time-of-day-heading" className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Completion Rate by Time of Day
            </h3>
            <span className="text-xs text-gray-400">Measured data</span>
          </div>

          <div className="space-y-4">
            {analysis.timeOfDayRates.map((period, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                    {period.period}
                  </span>
                  <span className="font-bold text-gray-900 dark:text-white">
                    {period.completed} / {period.total} ({period.rate}%)
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700">
                  <div
                    className="h-full rounded-full bg-[#6657E8] transition-all duration-500"
                    style={{ width: `${period.rate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Day of Week Breakdown */}
        <section
          aria-labelledby="day-of-week-heading"
          className="rounded-2xl border border-gray-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]"
        >
          <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3 dark:border-slate-800">
            <h3 id="day-of-week-heading" className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Reliability by Day of Week
            </h3>
            <span className="text-xs text-gray-400">Mon – Sun</span>
          </div>

          <div className="grid grid-cols-7 gap-2 pt-2 text-center">
            {analysis.dayOfWeekRates.map((d, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div className="relative flex h-24 w-full items-end justify-center rounded-xl bg-gray-100 p-1 dark:bg-slate-800">
                  <div
                    className="w-full rounded-lg bg-emerald-500 transition-all duration-500"
                    style={{ height: `${Math.max(8, d.rate)}%` }}
                  />
                </div>
                <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300">
                  {d.dayName.slice(0, 3)}
                </span>
                <span className="text-[10px] text-gray-400 tabular-nums">
                  {d.rate}%
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl bg-gray-50 p-3 text-xs text-gray-600 dark:bg-slate-800/80 dark:text-gray-400">
            <span className="font-semibold text-gray-800 dark:text-gray-200">Workload Pattern: </span>
            {analysis.workloadInsight}
          </div>
        </section>
      </div>

      {/* Category Execution Rates */}
      {analysis.categoryRates.length > 0 && (
        <section
          aria-labelledby="category-rates-heading"
          className="rounded-2xl border border-gray-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]"
        >
          <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3 dark:border-slate-800">
            <h3 id="category-rates-heading" className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Execution by Category
            </h3>
            <span className="text-xs text-gray-400">Studies • Gym • Work • Life</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {analysis.categoryRates.map((cat) => (
              <div
                key={cat.categoryId}
                className="rounded-xl border border-gray-200 p-4 dark:border-slate-700 dark:bg-slate-800/40"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="text-xs font-bold text-gray-900 dark:text-white">
                    {cat.categoryName}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-xl font-extrabold text-gray-900 dark:text-white">
                    {cat.rate}%
                  </span>
                  <span className="text-xs text-gray-400">
                    {cat.completed} / {cat.total}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
