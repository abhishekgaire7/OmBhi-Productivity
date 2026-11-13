import { useMemo } from 'react';
import {
  Plus,
  CheckCircle2,
  Clock,
  BarChart3,
  Flame,
  AlertCircle,
  Calendar,
  Sparkles,
  Compass,
  CalendarRange,
} from 'lucide-react';
import { Category, Habit, Task, UserSettings, WeeklyReview } from '../types';
import {
  calculateFullCompletionRate,
  getMotivationalMessage,
  isTaskOverdue,
} from '../utils/calculations';
import { calculateConsistencyScore } from '../utils/consistencyCoach';
import { getTodayString, parseISODate } from '../utils/date';
import { getWeekInfo } from '../utils/weeklyReview';
import { TaskCard } from '../components/TaskCard';
import { ArrowRight } from 'lucide-react';

interface DashboardViewProps {
  tasks: Task[];
  categories: Category[];
  habits: Habit[];
  settings: UserSettings;
  savedReviews?: Record<string, WeeklyReview>;
  onNavigateToReview?: () => void;
  onNavigateToCategories?: () => void;
  onNavigateToTimetable?: () => void;
  onOpenNewTask: (date?: string, time?: string) => void;
  onEditTask: (task: Task) => void;
  onCompleteTask: (task: Task) => void;
  onFailSkipClick: (task: Task) => void;
  onUpdateProgress: (task: Task, progress: number) => void;
  onDeleteTask: (task: Task) => void;
  onDuplicateTask: (task: Task) => void;
  onRescheduleTask?: (task: Task) => void;
}

export function DashboardView({
  tasks,
  categories,
  habits,
  settings,
  savedReviews = {},
  onNavigateToReview,
  onNavigateToCategories,
  onNavigateToTimetable,
  onOpenNewTask,
  onEditTask,
  onCompleteTask,
  onFailSkipClick,
  onUpdateProgress,
  onDeleteTask,
  onDuplicateTask,
  onRescheduleTask,
}: DashboardViewProps) {
  const todayStr = getTodayString(0);
  const todayTasks = tasks.filter((t) => t.scheduledDate === todayStr);

  const completedToday = todayTasks.filter((t) => t.status === 'completed').length;
  const totalToday = todayTasks.length;
  const remainingToday = totalToday - completedToday;
  const completionPercentage = totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0;

  // Overdue Tasks: scheduled before today and not completed/failed/skipped
  const overdueTasks = tasks.filter((t) => isTaskOverdue(t, todayStr));

  // 7-day weekly completion rate
  const last7Days = Array.from({ length: 7 }, (_, i) => getTodayString(-i));
  const weekTasks = tasks.filter((t) => last7Days.includes(t.scheduledDate));
  const weeklyRate = calculateFullCompletionRate(weekTasks);

  // Ground truth Consistency Index based strictly on actual task completion history
  const consistency = useMemo(() => calculateConsistencyScore(tasks, habits), [tasks, habits]);

  // Active habits completed today
  const habitsDoneToday = habits.filter((h) => h.completedDates.includes(todayStr)).length;

  // Greeting based on current hour
  const currentHour = new Date().getHours();
  const greeting =
    currentHour < 12 ? 'Good morning' : currentHour < 18 ? 'Good afternoon' : 'Good evening';

  // Day of year for deterministic message
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000);
  const motivationalMessage = getMotivationalMessage(dayOfYear);

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(now);

  // Identify next upcoming task today
  const sortedTodayTasks = useMemo(() => {
    return [...todayTasks].sort((a, b) =>
      (a.startTime || '99:99').localeCompare(b.startTime || '99:99')
    );
  }, [todayTasks]);

  const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const nextUpcomingTask = sortedTodayTasks.find(
    (t) => t.status !== 'completed' && t.status !== 'skipped' && t.status !== 'failed' && (t.startTime || '') >= currentTimeStr
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-purple-100/80 bg-white p-6 shadow-xs sm:flex-row sm:items-center dark:border-slate-800 dark:bg-[#1E293B]">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wider text-purple-600 uppercase dark:text-purple-400">
            {formattedDate}
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {greeting}. <span className="font-normal text-gray-600 dark:text-gray-300">{motivationalMessage}</span>
          </h2>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {onNavigateToTimetable && (
            <button
              type="button"
              onClick={onNavigateToTimetable}
              aria-label="Open Timetable Generator"
              className="flex items-center gap-1.5 rounded-xl border border-[#6657E8]/30 bg-white px-3.5 py-2.5 text-xs font-semibold text-[#6657E8] shadow-xs transition hover:bg-[#6657E8]/5 dark:border-[#6657E8]/40 dark:bg-slate-800 dark:text-[#A59DF7]"
            >
              <CalendarRange className="h-3.5 w-3.5" />
              <span>Timetable</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenNewTask(todayStr)}
            aria-label="Add new task for today"
            className="flex items-center gap-2 rounded-xl bg-[#6657E8] px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#5544DB] active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            <span>Add Task</span>
          </button>
        </div>
      </div>

      {/* Clean Workspace Onboarding Card for New Users */}
      {tasks.length === 0 && categories.length === 0 && (
        <div className="rounded-2xl border border-[#6657E8]/20 bg-gradient-to-r from-[#6657E8]/10 via-white to-violet-50/50 p-6 shadow-xs dark:border-slate-800 dark:from-[#1E293B] dark:via-[#1E293B] dark:to-slate-900">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#6657E8]/15 px-2.5 py-0.5 text-[11px] font-bold text-[#6657E8] dark:text-[#A59DF7]">
                <Sparkles className="h-3.5 w-3.5" /> Your Space to Grow
              </span>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Your journey starts here.
              </h3>
              <p className="max-w-xl text-xs text-gray-600 dark:text-gray-300">
                Turn your goals into action. Organize your tasks, plan your day, and build habits that move you forward.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {onNavigateToCategories && (
                <button
                  type="button"
                  onClick={onNavigateToCategories}
                  className="rounded-xl border border-[#6657E8]/40 bg-white px-3.5 py-2 text-xs font-semibold text-[#6657E8] shadow-xs hover:bg-[#6657E8]/5 transition dark:bg-slate-800 dark:text-[#A59DF7]"
                >
                  Create Categories
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenNewTask(todayStr)}
                className="flex items-center gap-1.5 rounded-xl bg-[#6657E8] px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#5544DB] transition"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create First Task</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Today's Progress Section */}
      <div className="flex flex-col items-center gap-6 rounded-2xl border border-purple-100/80 bg-white p-6 shadow-xs sm:flex-row dark:border-slate-800 dark:bg-[#1E293B]">
        {/* Circular Progress Ring */}
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
          <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="transparent"
              stroke="currentColor"
              strokeWidth="8"
              className="text-gray-100 dark:text-slate-800"
            />
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="transparent"
              stroke="#6657E8"
              strokeWidth="8"
              strokeDasharray={251.32}
              strokeDashoffset={251.32 - (251.32 * completionPercentage) / 100}
              strokeLinecap="round"
              className="transition-all duration-500 ease-out"
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="text-xl font-bold tracking-tight text-gray-900 tabular-nums dark:text-white">
              {completionPercentage}%
            </span>
            <span className="text-[9px] font-semibold tracking-wider text-gray-400 uppercase">
              Done
            </span>
          </div>
        </div>

        {/* Progress Text & Horizontal Bar */}
        <div className="w-full flex-1 text-center sm:text-left">
          <h3 className="text-base font-bold text-gray-900 dark:text-white">
            Today's Progress — {completedToday} of {totalToday} tasks completed
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {totalToday === 0
              ? 'No tasks scheduled yet today. Plan your day to build focused momentum.'
              : remainingToday === 0
              ? 'All scheduled tasks completed for today. Excellent discipline!'
              : `${remainingToday} task${remainingToday === 1 ? '' : 's'} remaining today.`}
          </p>

          <div className="mt-3.5 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-[#6657E8] transition-all duration-500 ease-out"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Quick Metrics Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {[
          {
            label: 'Completed Today',
            value: completedToday,
            sub: `of ${totalToday} scheduled`,
            icon: CheckCircle2,
            color: 'text-emerald-600 dark:text-emerald-400',
          },
          {
            label: 'Remaining Today',
            value: remainingToday,
            sub: 'active in queue',
            icon: Clock,
            color: 'text-amber-600 dark:text-amber-400',
          },
          {
            label: 'Consistency Index',
            value: `${consistency.score}/100`,
            sub: consistency.hasCompletedTasks ? consistency.statusLabel : 'No completed tasks yet',
            icon: Compass,
            color: 'text-[#6657E8] dark:text-[#A59DF7]',
          },
          {
            label: 'Habits Logged',
            value: `${habitsDoneToday}/${habits.length}`,
            sub: 'daily consistency',
            icon: Flame,
            color: 'text-rose-600 dark:text-rose-400',
          },
        ].map((m, idx) => {
          const Icon = m.icon;
          return (
            <div
              key={idx}
              className="flex items-center justify-between rounded-xl border border-purple-100/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]"
            >
              <div>
                <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{m.label}</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900 tabular-nums dark:text-white">
                  {m.value}
                </p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">{m.sub}</p>
              </div>
              <div className={`rounded-xl bg-gray-50 p-2.5 dark:bg-slate-800/80 ${m.color}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          );
        })}
      </div>

      {/* AI WEEKLY REVIEW SPOTLIGHT CARD */}
      {(() => {
        const thisWeek = getWeekInfo(new Date());
        const review = savedReviews[thisWeek.weekKey];
        return (
          <div className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/50 via-white to-violet-50/50 p-5 shadow-xs dark:border-slate-800 dark:from-[#1E293B] dark:via-[#1E293B] dark:to-slate-900">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#6657E8] text-white shadow-xs">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#6657E8] dark:text-[#A59DF7]">
                      AI Weekly Review
                    </span>
                    {review && (
                      <span className="rounded-full bg-[#6657E8]/10 px-2 py-0.5 text-[10px] font-bold text-[#6657E8] dark:bg-[#6657E8]/20 dark:text-[#A59DF7]">
                        {review.momentumScore}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                    {review ? `“${review.headline}”` : `Weekly Summary Ready (${thisWeek.weekLabel})`}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {review
                      ? `Actionable insights: ${review.whatWorked.length} wins, ${review.whatToChange.length} improvements planned.`
                      : 'Get a useful summary of what worked, what you missed, and what to change next week.'}
                  </p>
                </div>
              </div>

              {onNavigateToReview && (
                <button
                  type="button"
                  onClick={onNavigateToReview}
                  className="flex items-center gap-1.5 self-start sm:self-center shrink-0 rounded-xl bg-[#6657E8] px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#5544DB] active:scale-[0.98]"
                >
                  <span>{review ? 'View Full Review' : 'Generate Review'}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* OVERDUE SECTION (Rendered ONLY when overdue tasks exist) */}
      {overdueTasks.length > 0 && (
        <section aria-labelledby="overdue-tasks-heading" className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-rose-600 uppercase dark:text-rose-400">
            <AlertCircle className="h-4 w-4" />
            <h3 id="overdue-tasks-heading">Overdue Tasks ({overdueTasks.length})</h3>
          </div>

          <div className="space-y-2">
            {overdueTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                category={categories.find((c) => c.id === task.categoryId)}
                timeFormat24h={settings.timeFormat24h}
                isOverdue
                onEdit={onEditTask}
                onComplete={onCompleteTask}
                onFailSkipClick={onFailSkipClick}
                onUpdateProgress={onUpdateProgress}
                onDelete={onDeleteTask}
                onDuplicate={onDuplicateTask}
                onReschedule={onRescheduleTask}
              />
            ))}
          </div>
        </section>
      )}

      {/* TODAY'S SCHEDULE */}
      <section aria-labelledby="todays-schedule-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 id="todays-schedule-heading" className="text-base font-bold text-gray-900 dark:text-white">
            Today's Schedule
          </h3>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {todayTasks.length} {todayTasks.length === 1 ? 'task' : 'tasks'}
          </span>
        </div>

        {sortedTodayTasks.length === 0 ? (
          /* Empty State */
          <div className="rounded-2xl border border-dashed border-purple-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-[#1E293B]">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-[#6657E8] dark:bg-slate-800">
              <Calendar className="h-6 w-6" />
            </div>
            <h4 className="text-base font-bold text-gray-900 dark:text-white">No tasks scheduled for today</h4>
            <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500 dark:text-gray-400">
              Plan your deep work, study blocks, workouts, or daily priorities to establish momentum.
            </p>
            <button
              type="button"
              onClick={() => onOpenNewTask(todayStr)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#6657E8] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#5544DB] transition"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Your First Task</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {sortedTodayTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                category={categories.find((c) => c.id === task.categoryId)}
                timeFormat24h={settings.timeFormat24h}
                isUpcoming={task.id === nextUpcomingTask?.id}
                onEdit={onEditTask}
                onComplete={onCompleteTask}
                onFailSkipClick={onFailSkipClick}
                onUpdateProgress={onUpdateProgress}
                onDelete={onDeleteTask}
                onDuplicate={onDuplicateTask}
                onReschedule={onRescheduleTask}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
