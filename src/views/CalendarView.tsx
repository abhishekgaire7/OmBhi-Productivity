import { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { Category, Task, UserSettings } from '../types';
import {
  getMonthDays,
  getTodayString,
  getWeekDays,
  parseISODate,
} from '../utils/date';

interface CalendarViewProps {
  tasks: Task[];
  categories: Category[];
  settings: UserSettings;
  onOpenNewTask: (date?: string) => void;
  onEditTask: (task: Task) => void;
  onCompleteTask: (task: Task) => void;
  onFailSkipClick: (task: Task) => void;
  onUpdateProgress: (task: Task, progress: number) => void;
}

export function CalendarView({
  tasks,
  categories,
  settings,
  onOpenNewTask,
  onEditTask,
}: CalendarViewProps) {
  const [calendarMode, setCalendarMode] = useState<'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const filteredTasks = useMemo(() => {
    if (categoryFilter === 'all') return tasks;
    return tasks.filter((t) => t.categoryId === categoryFilter);
  }, [tasks, categoryFilter]);

  const handlePrev = () => {
    const next = new Date(currentDate);
    if (calendarMode === 'week') {
      next.setDate(next.getDate() - 7);
    } else {
      next.setMonth(next.getMonth() - 1);
    }
    setCurrentDate(next);
  };

  const handleNext = () => {
    const next = new Date(currentDate);
    if (calendarMode === 'week') {
      next.setDate(next.getDate() + 7);
    } else {
      next.setMonth(next.getMonth() + 1);
    }
    setCurrentDate(next);
  };

  const weekDays = useMemo(() => {
    return getWeekDays(currentDate, settings.startOfWeekMonday);
  }, [currentDate, settings.startOfWeekMonday]);

  const monthDays = useMemo(() => {
    return getMonthDays(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      settings.startOfWeekMonday
    );
  }, [currentDate, settings.startOfWeekMonday]);

  const formattedMonthHeader = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(currentDate);

  const todayStr = getTodayString(0);

  return (
    <div className="space-y-6">
      {/* Calendar Top Controls */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xs sm:flex-row sm:items-center dark:border-slate-800 dark:bg-[#1E293B]">
        <div className="flex items-center gap-3">
          <div className="flex items-center overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700">
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Previous period"
              className="p-2 text-gray-500 hover:bg-gray-100 transition dark:text-gray-400 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentDate(new Date())}
              aria-label="Current period"
              className="border-x border-gray-200 px-3 py-1.5 text-xs font-semibold hover:bg-gray-100 transition dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Today
            </button>
            <button
              type="button"
              onClick={handleNext}
              aria-label="Next period"
              className="p-2 text-gray-500 hover:bg-gray-100 transition dark:text-gray-400 dark:hover:bg-slate-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
            {formattedMonthHeader}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter tasks by category"
            className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 dark:border-slate-700 dark:bg-[#1E293B] dark:text-gray-200"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Week / Month Toggle */}
          <div className="flex overflow-hidden rounded-xl border border-gray-200 bg-gray-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setCalendarMode('week')}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                calendarMode === 'week'
                  ? 'bg-white text-[#6657E8] shadow-xs dark:bg-[#1E293B] dark:text-[#A59DF7]'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => setCalendarMode('month')}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                calendarMode === 'month'
                  ? 'bg-white text-[#6657E8] shadow-xs dark:bg-[#1E293B] dark:text-[#A59DF7]'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Month
            </button>
          </div>

          {/* Quick Task Creation */}
          <button
            type="button"
            onClick={() => onOpenNewTask()}
            className="flex items-center gap-1.5 rounded-xl bg-[#6657E8] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#5544DB] transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Task</span>
          </button>
        </div>
      </div>

      {/* WEEKLY VIEW */}
      {calendarMode === 'week' && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
          {weekDays.map((dateStr) => {
            const dayDate = parseISODate(dateStr);
            const isToday = dateStr === todayStr;
            const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(dayDate);
            const dayNumber = dayDate.getDate();
            const dayTasks = filteredTasks.filter((t) => t.scheduledDate === dateStr);

            return (
              <div
                key={dateStr}
                className={`flex min-h-[380px] flex-col rounded-2xl border p-3 ${
                  isToday
                    ? 'border-[#6657E8] bg-white ring-1 ring-[#6657E8]/20 dark:bg-[#1E293B]'
                    : 'border-gray-200/90 bg-white dark:border-slate-800 dark:bg-[#1E293B]'
                }`}
              >
                {/* Column Day Header */}
                <div className="mb-2 flex items-center justify-between border-b border-gray-100 pb-2 dark:border-slate-800">
                  <div>
                    <p className={`text-[11px] font-semibold ${isToday ? 'text-[#6657E8]' : 'text-gray-400'}`}>
                      {dayName}
                    </p>
                    <p className={`text-lg font-bold tabular-nums leading-tight ${isToday ? 'text-[#6657E8]' : 'text-gray-900 dark:text-white'}`}>
                      {dayNumber}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenNewTask(dateStr)}
                    aria-label={`Add task for ${dayName} ${dayNumber}`}
                    className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-[#6657E8] dark:hover:bg-slate-800"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Day Tasks List */}
                <div className="flex-1 space-y-2 overflow-y-auto">
                  {dayTasks.map((t) => {
                    const cat = categories.find((c) => c.id === t.categoryId);
                    return (
                      <div
                        key={t.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onEditTask(t)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onEditTask(t);
                        }}
                        className={`cursor-pointer rounded-xl border p-2 text-left transition hover:shadow-xs ${
                          t.status === 'completed'
                            ? 'border-emerald-200 bg-emerald-50/40 text-gray-500 dark:border-emerald-900/40 dark:bg-emerald-950/20'
                            : 'border-gray-200 bg-gray-50/70 dark:border-slate-700 dark:bg-slate-800/60'
                        }`}
                      >
                        <div className="mb-1 flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: cat?.color || '#94A3B8' }}
                          />
                          <span className="truncate text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                            {t.startTime || 'Anytime'}
                          </span>
                        </div>
                        <p
                          className={`line-clamp-2 text-xs font-semibold ${
                            t.status === 'completed'
                              ? 'text-gray-400 line-through dark:text-gray-500'
                              : 'text-gray-900 dark:text-white'
                          }`}
                        >
                          {t.title}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MONTHLY VIEW */}
      {calendarMode === 'month' && (
        <div className="rounded-2xl border border-gray-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
          {/* Weekday headers */}
          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-bold text-gray-400 uppercase">
            {(settings.startOfWeekMonday
              ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
              : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
            ).map((day) => (
              <div key={day} className="py-1">
                {day}
              </div>
            ))}
          </div>

          {/* Month calendar cells */}
          <div className="grid grid-cols-7 gap-1.5">
            {monthDays.map(({ date, dayNumber, isCurrentMonth }) => {
              const dayTasks = filteredTasks.filter((t) => t.scheduledDate === date);
              const isToday = date === todayStr;

              return (
                <div
                  key={date}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenNewTask(date)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onOpenNewTask(date);
                  }}
                  className={`flex min-h-[96px] cursor-pointer flex-col justify-between rounded-xl border p-2 transition hover:bg-gray-50 dark:hover:bg-slate-800/40 ${
                    isToday
                      ? 'border-[#6657E8] bg-indigo-50/20 dark:bg-indigo-950/20'
                      : 'border-gray-100 dark:border-slate-800'
                  } ${!isCurrentMonth ? 'opacity-40' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold tabular-nums ${
                        isToday ? 'text-[#6657E8]' : 'text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {dayNumber}
                    </span>
                    {dayTasks.length > 0 && (
                      <span className="rounded-full bg-gray-100 px-1.5 py-0.2 text-[10px] font-bold text-gray-600 dark:bg-slate-700 dark:text-gray-300">
                        {dayTasks.length}
                      </span>
                    )}
                  </div>

                  {/* Task chips preview */}
                  <div className="mt-1 space-y-1 overflow-hidden">
                    {dayTasks.slice(0, 2).map((task) => {
                      const cat = categories.find((c) => c.id === task.categoryId);
                      return (
                        <div
                          key={task.id}
                          className="flex items-center gap-1 truncate rounded bg-gray-100 px-1.5 py-0.5 text-[10px] dark:bg-slate-800"
                        >
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: cat?.color || '#94A3B8' }}
                          />
                          <span
                            className={`truncate ${
                              task.status === 'completed'
                                ? 'text-gray-400 line-through dark:text-gray-500'
                                : 'text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {task.title}
                          </span>
                        </div>
                      );
                    })}
                    {dayTasks.length > 2 && (
                      <p className="text-[10px] font-semibold text-gray-400">
                        +{dayTasks.length - 2} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
