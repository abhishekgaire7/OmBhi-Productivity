import { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  CalendarCheck,
  Sparkles,
  CalendarRange,
} from 'lucide-react';
import { Category, Task, UserSettings } from '../types';
import {
  formatFullDateHeader,
  formatTimeDisplay,
  getTodayString,
  parseISODate,
} from '../utils/date';
import { TaskCard } from '../components/TaskCard';

interface MyDayViewProps {
  tasks: Task[];
  categories: Category[];
  settings: UserSettings;
  onOpenNewTask: (date?: string, time?: string) => void;
  onEditTask: (task: Task) => void;
  onCompleteTask: (task: Task) => void;
  onFailSkipClick: (task: Task) => void;
  onUpdateProgress: (task: Task, progress: number) => void;
  onDeleteTask: (task: Task) => void;
  onDuplicateTask: (task: Task) => void;
  onOpenDayPlanner?: (date: string) => void;
  onOpenTimetable?: () => void;
  onRescheduleTask?: (task: Task) => void;
}

export function MyDayView({
  tasks,
  categories,
  settings,
  onOpenNewTask,
  onEditTask,
  onCompleteTask,
  onFailSkipClick,
  onUpdateProgress,
  onDeleteTask,
  onDuplicateTask,
  onOpenDayPlanner,
  onOpenTimetable,
  onRescheduleTask,
}: MyDayViewProps) {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString(0));

  const handlePrevDay = () => {
    const d = parseISODate(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = parseISODate(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const dayTasks = useMemo(() => {
    return tasks.filter((t) => t.scheduledDate === selectedDate);
  }, [tasks, selectedDate]);

  const timedTasks = dayTasks.filter((t) => Boolean(t.startTime));
  const untimedTasks = dayTasks.filter((t) => !t.startTime);

  const completedCount = dayTasks.filter((t) => t.status === 'completed').length;
  const progressPercent = dayTasks.length > 0 ? Math.round((completedCount / dayTasks.length) * 100) : 0;

  // Hourly slots from 06:00 to 22:00
  const hours = Array.from({ length: 17 }, (_, i) => i + 6);

  return (
    <div className="space-y-6">
      {/* Date Navigation & Summary Card */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xs sm:flex-row sm:items-center dark:border-slate-800 dark:bg-[#1E293B]">
        <div className="flex items-center gap-3">
          <div className="flex items-center overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700">
            <button
              type="button"
              onClick={handlePrevDay}
              aria-label="Previous day"
              className="p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition dark:text-gray-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(getTodayString(0))}
              aria-label="Go to today"
              className="border-x border-gray-200 px-3 py-1.5 text-xs font-semibold hover:bg-gray-100 transition dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Today
            </button>
            <button
              type="button"
              onClick={handleNextDay}
              aria-label="Next day"
              className="p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition dark:text-gray-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div>
            <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
              {formatFullDateHeader(selectedDate)}
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {completedCount} of {dayTasks.length} tasks completed ({progressPercent}%)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {onOpenTimetable && (
            <button
              type="button"
              onClick={onOpenTimetable}
              aria-label="Open Timetable Generator"
              className="flex items-center gap-1.5 rounded-xl border border-[#6657E8]/30 bg-white px-3.5 py-2 text-xs font-semibold text-[#6657E8] transition hover:bg-[#6657E8]/5 dark:border-[#6657E8]/40 dark:bg-slate-800 dark:text-[#A59DF7]"
            >
              <CalendarRange className="h-3.5 w-3.5" />
              <span>Timetable</span>
            </button>
          )}

          {onOpenDayPlanner && (
            <button
              type="button"
              onClick={() => onOpenDayPlanner(selectedDate)}
              aria-label={`AI Day Planner for ${selectedDate}`}
              className="flex items-center gap-1.5 rounded-xl border border-[#6657E8]/30 bg-[#6657E8]/10 px-3.5 py-2 text-xs font-semibold text-[#6657E8] transition hover:bg-[#6657E8]/20 dark:border-[#6657E8]/40 dark:bg-[#6657E8]/20 dark:text-[#A59DF7]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>AI Day Planner</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenNewTask(selectedDate)}
            aria-label={`Add task for ${selectedDate}`}
            className="flex items-center gap-2 rounded-xl bg-[#6657E8] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#5544DB] active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            <span>Add Task to Day</span>
          </button>
        </div>
      </div>

      {/* Grid: 2 Columns on Desktop (Hourly Timeline & Unscheduled Tasks) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Hourly Timeline */}
        <section
          aria-labelledby="hourly-timeline-heading"
          className="rounded-2xl border border-gray-200/90 bg-white p-6 shadow-xs lg:col-span-2 dark:border-slate-800 dark:bg-[#1E293B]"
        >
          <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3 dark:border-slate-800">
            <h3 id="hourly-timeline-heading" className="text-xs font-bold tracking-wider text-gray-400 uppercase">
              Time-Blocked Schedule
            </h3>
            <span className="text-xs text-gray-400">06:00 – 22:00</span>
          </div>

          <div className="relative ml-14 space-y-3.5 border-l border-gray-200 dark:border-slate-800">
            {hours.map((hour) => {
              const hourStr = `${String(hour).padStart(2, '0')}:00`;
              const matchedTasks = timedTasks.filter((t) => {
                if (!t.startTime) return false;
                const taskHour = parseInt(t.startTime.split(':')[0], 10);
                return taskHour === hour;
              });

              return (
                <div key={hour} className="group relative min-h-[52px] pl-6">
                  {/* Hour timestamp indicator */}
                  <span className="absolute -left-14 top-0 text-xs font-medium text-gray-400 tabular-nums group-hover:text-gray-800 dark:group-hover:text-gray-200">
                    {formatTimeDisplay(hourStr, settings.timeFormat24h)}
                  </span>

                  {/* Bullet node on timeline */}
                  <div className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-gray-300 transition-colors group-hover:bg-[#6657E8] dark:border-[#1E293B] dark:bg-slate-700" />

                  {matchedTasks.length > 0 ? (
                    <div className="space-y-2">
                      {matchedTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          category={categories.find((c) => c.id === task.categoryId)}
                          timeFormat24h={settings.timeFormat24h}
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
                  ) : (
                    /* Plan slot button on hover/focus */
                    <button
                      type="button"
                      onClick={() => onOpenNewTask(selectedDate, hourStr)}
                      aria-label={`Plan task at ${hourStr}`}
                      className="flex items-center gap-1.5 py-1 text-xs text-gray-400 opacity-0 transition-opacity hover:text-[#6657E8] group-hover:opacity-100 dark:hover:text-[#A59DF7]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Plan at {formatTimeDisplay(hourStr, settings.timeFormat24h)}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Unscheduled / Anytime Tasks Column */}
        <section
          aria-labelledby="unscheduled-tasks-heading"
          className="h-fit rounded-2xl border border-gray-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]"
        >
          <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3 dark:border-slate-800">
            <h3 id="unscheduled-tasks-heading" className="text-xs font-bold tracking-wider text-gray-400 uppercase">
              Anytime Today ({untimedTasks.length})
            </h3>
            <button
              type="button"
              onClick={() => onOpenNewTask(selectedDate)}
              aria-label="Add unscheduled task"
              className="text-xs font-semibold text-[#6657E8] hover:underline dark:text-[#A59DF7]"
            >
              + Add
            </button>
          </div>

          {untimedTasks.length === 0 ? (
            <div className="py-8 text-center">
              <CalendarCheck className="mx-auto h-8 w-8 text-gray-300 dark:text-slate-700" />
              <p className="mt-2 text-xs text-gray-400">No unscheduled tasks for this day.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {untimedTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  category={categories.find((c) => c.id === task.categoryId)}
                  timeFormat24h={settings.timeFormat24h}
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
    </div>
  );
}
