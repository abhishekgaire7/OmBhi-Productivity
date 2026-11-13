import { useState, useMemo } from 'react';
import {
  Flame,
  Plus,
  Trash2,
  Check,
  RotateCcw,
} from 'lucide-react';
import { Category, Habit } from '../types';
import { calculateHabitStreak } from '../utils/calculations';
import { getTodayString, parseISODate } from '../utils/date';

interface HabitsViewProps {
  habits: Habit[];
  categories: Category[];
  onToggleHabitDate: (habitId: string, dateStr: string) => void;
  onAddHabit: (habit: Habit) => void;
  onDeleteHabit: (habitId: string) => void;
}

export function HabitsView({
  habits,
  categories,
  onToggleHabitDate,
  onAddHabit,
  onDeleteHabit,
}: HabitsViewProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [frequency, setFrequency] = useState<'daily' | 'weekdays' | 'custom'>('daily');
  const [targetDays, setTargetDays] = useState(7);
  const [notes, setNotes] = useState('');

  // 7 days window (most recent on right)
  const last7Days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => getTodayString(-6 + i));
  }, []);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newHabit: Habit = {
      id: 'hab-' + Date.now(),
      name: name.trim(),
      categoryId,
      frequency,
      targetDaysPerWeek: targetDays,
      completedDates: [],
      streak: 0,
      notes: notes.trim(),
    };

    onAddHabit(newHabit);
    setName('');
    setNotes('');
    setIsAdding(false);
  };

  return (
    <div className="space-y-6">
      {/* Habits Header */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-gray-200/90 bg-white p-6 shadow-xs sm:flex-row sm:items-center dark:border-slate-800 dark:bg-[#1E293B]">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
            Daily Habits & Consistency
          </h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Build compounding momentum for language acquisition, workouts, and cognitive focus.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAdding(!isAdding)}
          aria-label="Add new habit"
          className="flex items-center gap-1.5 self-start rounded-xl bg-[#6657E8] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#5544DB] active:scale-[0.98] sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>New Habit</span>
        </button>
      </div>

      {/* Add Habit Inline Form */}
      {isAdding && (
        <form
          onSubmit={handleCreate}
          className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Habit name (e.g. Morning Workout, Hydration, Deep Reading)"
              className="flex-1 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-[#6657E8] focus:outline-hidden dark:border-slate-700 dark:bg-[#1E293B] dark:text-white"
            />

            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-label="Category for new habit"
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-[#1E293B]"
            >
              {categories.length === 0 ? (
                <option value="">General</option>
              ) : (
                categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>

            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as any)}
              aria-label="Frequency for new habit"
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium dark:border-slate-700 dark:bg-[#1E293B]"
            >
              <option value="daily">Daily (7 days/week)</option>
              <option value="weekdays">Weekdays (Mon–Fri)</option>
              <option value="custom">4 Days / Week</option>
            </select>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="rounded-xl bg-[#6657E8] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#5544DB]"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="rounded-xl px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Habit Consistency Matrix */}
      {habits.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center dark:border-slate-800 dark:bg-[#1E293B]">
          <Flame className="mx-auto h-8 w-8 text-gray-300 dark:text-slate-700" />
          <p className="mt-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            No habits configured yet.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Create simple daily rituals like morning exercise, hydration, or evening review.
          </p>
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="mt-4 rounded-xl bg-[#6657E8] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#5544DB]"
          >
            Add Your First Habit
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
          {/* Header Row */}
          <div className="grid grid-cols-12 border-b border-gray-100 p-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider dark:border-slate-800">
            <div className="col-span-5">Habit</div>
            <div className="col-span-2 text-center">Streak</div>
            <div className="col-span-5 flex justify-end gap-2 pr-3">
              {last7Days.map((d) => {
                const dayDate = parseISODate(d);
                const dayLetter = new Intl.DateTimeFormat('en-US', { weekday: 'narrow' }).format(dayDate);
                const dayNum = dayDate.getDate();
                const isToday = d === getTodayString(0);
                return (
                  <div
                    key={d}
                    className={`w-7 text-center ${isToday ? 'font-bold text-[#6657E8]' : ''}`}
                    title={d}
                  >
                    <div>{dayLetter}</div>
                    <div className="text-[9px] tabular-nums">{dayNum}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Habit Entries */}
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {habits.map((habit) => {
              const cat = categories.find((c) => c.id === habit.categoryId);
              return (
                <div
                  key={habit.id}
                  className="grid grid-cols-12 items-center p-4 transition hover:bg-gray-50/50 dark:hover:bg-slate-800/40"
                >
                  <div className="col-span-5 flex items-center gap-3">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: cat?.color || '#6657E8' }}
                    />
                    <div>
                      <p className="text-xs font-bold text-gray-900 dark:text-white">{habit.name}</p>
                      <p className="text-[11px] text-gray-400">
                        {cat?.name || 'Habit'} · {habit.frequency}
                      </p>
                    </div>
                  </div>

                  <div className="col-span-2 text-center">
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold tabular-nums text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                      <Flame className="h-3.5 w-3.5 fill-current" />
                      <span>{habit.streak}d</span>
                    </span>
                  </div>

                  <div className="col-span-5 flex items-center justify-end gap-2 pr-3">
                    {last7Days.map((dateStr) => {
                      const isDone = habit.completedDates.includes(dateStr);
                      return (
                        <button
                          key={dateStr}
                          type="button"
                          onClick={() => onToggleHabitDate(habit.id, dateStr)}
                          aria-label={`Toggle habit ${habit.name} for ${dateStr}`}
                          className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all ${
                            isDone
                              ? 'bg-[#6657E8] text-white shadow-xs hover:bg-[#5544DB]'
                              : 'bg-gray-100 text-gray-300 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-600 dark:hover:bg-slate-700'
                          }`}
                          title={dateStr}
                        >
                          {isDone && <Check className="h-4 w-4 stroke-[3]" />}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => onDeleteHabit(habit.id)}
                      aria-label={`Delete habit ${habit.name}`}
                      className="ml-2 rounded p-1 text-gray-300 hover:text-rose-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
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
