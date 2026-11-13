import { useState, useEffect } from 'react';
import {
  X,
  Bell,
  Calendar,
  Clock,
  Repeat,
  AlertCircle,
  Tag,
  Plus,
} from 'lucide-react';
import {
  Category,
  NotificationMethod,
  Reminder,
  ReminderPriority,
  ReminderRepeat,
  UserSettings,
} from '../types';
import {
  DEFAULT_REMINDER_CATEGORIES,
  getAvailableReminderCategories,
} from '../utils/reminderCategories';
import { getTodayDateString, getTomorrowDateString } from '../utils/reminders';

interface ReminderModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onSave: (reminder: Reminder) => void;
  categories: Category[];
  onAddCategory?: (category: Category) => void;
  editingReminder?: Reminder | null;
  reminder?: Reminder | null;
  settings: UserSettings;
  userId?: string;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ReminderModal({
  isOpen = true,
  onClose,
  onSave,
  categories,
  onAddCategory,
  editingReminder,
  reminder,
  settings,
  userId = '',
}: ReminderModalProps) {
  const activeReminder = editingReminder !== undefined ? editingReminder : reminder;
  const availableCategories = getAvailableReminderCategories(categories);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [categoryId, setCategoryId] = useState(DEFAULT_REMINDER_CATEGORIES[0].id);
  const [priority, setPriority] = useState<ReminderPriority>('medium');
  const [repeat, setRepeat] = useState<ReminderRepeat>('never');
  const [customRepeatDays, setCustomRepeatDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [notificationMethod, setNotificationMethod] = useState<NotificationMethod>('in_app');
  const [timezone, setTimezone] = useState(
    settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  );
  const [error, setError] = useState<string | null>(null);

  // Quick inline category creator
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#6657E8');

  // Populate or reset form when modal opens
  useEffect(() => {
    if (activeReminder) {
      setTitle(activeReminder.title);
      setDescription(activeReminder.description || '');
      setDate(activeReminder.date);
      setTime(activeReminder.time);
      setCategoryId(activeReminder.categoryId || DEFAULT_REMINDER_CATEGORIES[0].id);
      setPriority(activeReminder.priority);
      setRepeat(activeReminder.repeat);
      setCustomRepeatDays(activeReminder.customRepeatDays || [1, 2, 3, 4, 5]);
      setNotificationMethod(activeReminder.notificationMethod || 'in_app');
      setTimezone(activeReminder.timezone || settings.timezone || 'UTC');
    } else {
      const today = getTodayDateString(settings.timezone);
      // Sensible defaults without saving to database automatically
      setTitle('');
      setDescription('');
      setDate(today);
      // Default to next rounded hour
      const now = new Date();
      const nextHour = String(Math.min(now.getHours() + 1, 23)).padStart(2, '0');
      setTime(`${nextHour}:00`);
      setCategoryId(availableCategories[0]?.id || 'rem-cat-personal');
      setPriority('medium');
      setRepeat('never');
      setCustomRepeatDays([1, 2, 3, 4, 5]);
      setNotificationMethod('in_app');
      setTimezone(settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    }
    setError(null);
    setIsCreatingCategory(false);
    setNewCategoryName('');
  }, [isOpen, activeReminder, settings]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Reminder title is required.');
      return;
    }
    if (!date) {
      setError('Date is required.');
      return;
    }
    if (!time) {
      setError('Exact time is required.');
      return;
    }

    const reminderPayload: Reminder = {
      id: activeReminder?.id || `rem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId: activeReminder?.userId || userId,
      title: title.trim(),
      description: description.trim() || undefined,
      date,
      time,
      categoryId,
      priority,
      repeat,
      customRepeatDays: repeat === 'custom' ? customRepeatDays : undefined,
      notificationMethod,
      completed: activeReminder ? activeReminder.completed : false,
      completedAt: activeReminder?.completedAt,
      snoozedUntil: activeReminder?.snoozedUntil,
      timezone,
      createdAt: activeReminder?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(reminderPayload);
    onClose();
  };

  const handleCreateNewCategory = () => {
    if (!newCategoryName.trim()) return;
    const newCat: Category = {
      id: `cat-${Date.now()}`,
      name: newCategoryName.trim(),
      color: newCategoryColor,
    };
    onAddCategory?.(newCat);
    setCategoryId(newCat.id);
    setIsCreatingCategory(false);
    setNewCategoryName('');
  };

  const toggleCustomDay = (dayIndex: number) => {
    setCustomRepeatDays((prev) =>
      prev.includes(dayIndex)
        ? prev.filter((d) => d !== dayIndex)
        : [...prev, dayIndex].sort((a, b) => a - b)
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reminder-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-purple-100 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#1E293B] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#6657E8]/10 text-[#6657E8] dark:bg-[#6657E8]/20 dark:text-[#A59DF7]">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <h2
                id="reminder-modal-title"
                className="text-base font-bold text-gray-900 dark:text-white"
              >
                {editingReminder ? 'Edit Reminder' : 'New Reminder'}
              </h2>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Scheduled notifications and prompt alerts
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800 dark:hover:text-gray-200 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Title (Required) */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
              Reminder Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Doctor's appointment, Pay electricity bill, Review study notes"
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-xs text-gray-900 focus:border-[#6657E8] focus:ring-1 focus:ring-[#6657E8] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {/* Description (Optional) */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
              Description & Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add extra context, links, or instructions..."
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs text-gray-900 focus:border-[#6657E8] focus:ring-1 focus:ring-[#6657E8] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {/* Date & Time Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Date <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setDate(getTodayDateString(timezone))}
                    className="text-[10px] text-[#6657E8] hover:underline dark:text-[#A59DF7]"
                  >
                    Today
                  </button>
                  <span className="text-gray-300">·</span>
                  <button
                    type="button"
                    onClick={() => setDate(getTomorrowDateString(timezone))}
                    className="text-[10px] text-[#6657E8] hover:underline dark:text-[#A59DF7]"
                  >
                    Tomorrow
                  </button>
                </div>
              </div>
              <div className="relative mt-1">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 focus:border-[#6657E8] focus:ring-1 focus:ring-[#6657E8] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                Exact Time <span className="text-rose-500">*</span>
              </label>
              <div className="relative mt-1">
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 focus:border-[#6657E8] focus:ring-1 focus:ring-[#6657E8] dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Category Picker with 7 Defaults & Custom Option */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Category
              </label>
              {!isCreatingCategory && (
                <button
                  type="button"
                  onClick={() => setIsCreatingCategory(true)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-[#6657E8] hover:underline dark:text-[#A59DF7]"
                >
                  <Plus className="h-3 w-3" />
                  <span>Custom Category</span>
                </button>
              )}
            </div>

            {isCreatingCategory ? (
              <div className="mt-1 flex items-center gap-2 rounded-xl border border-[#6657E8]/30 bg-[#6657E8]/5 p-2 dark:bg-slate-800/80">
                <input
                  type="text"
                  autoFocus
                  placeholder="Category Name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <input
                  type="color"
                  value={newCategoryColor}
                  onChange={(e) => setNewCategoryColor(e.target.value)}
                  className="h-7 w-7 rounded border-0 cursor-pointer"
                  title="Pick Color"
                />
                <button
                  type="button"
                  onClick={handleCreateNewCategory}
                  className="rounded-lg bg-[#6657E8] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#5748d6]"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingCategory(false)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs text-gray-900 focus:border-[#6657E8] focus:ring-1 focus:ring-[#6657E8] dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
              >
                {availableCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Priority Selection */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
              Priority
            </label>
            <div className="mt-1.5 grid grid-cols-4 gap-2">
              {(['low', 'medium', 'high', 'urgent'] as ReminderPriority[]).map((p) => {
                const isSelected = priority === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`rounded-xl border py-1.5 text-xs font-semibold capitalize transition cursor-pointer ${
                      isSelected
                        ? p === 'urgent'
                          ? 'border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                          : p === 'high'
                          ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                          : 'border-[#6657E8] bg-[#6657E8]/10 text-[#6657E8] dark:border-[#A59DF7] dark:bg-[#6657E8]/25 dark:text-[#A59DF7]'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Repeat Schedule */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
              Repeat Schedule
            </label>
            <select
              value={repeat}
              onChange={(e) => setRepeat(e.target.value as ReminderRepeat)}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs text-gray-900 focus:border-[#6657E8] focus:ring-1 focus:ring-[#6657E8] dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
            >
              <option value="never">Never (One-time)</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="custom">Custom Days</option>
            </select>

            {repeat === 'custom' && (
              <div className="mt-2 flex items-center justify-between gap-1 rounded-xl border border-gray-200 p-2 dark:border-slate-700">
                {DAYS_OF_WEEK.map((dayName, idx) => {
                  const isDaySelected = customRepeatDays.includes(idx);
                  return (
                    <button
                      key={dayName}
                      type="button"
                      onClick={() => toggleCustomDay(idx)}
                      className={`h-7 w-8 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                        isDaySelected
                          ? 'bg-[#6657E8] text-white shadow-xs'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-gray-400'
                      }`}
                    >
                      {dayName}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notification Delivery */}
          <div className="flex items-center gap-2.5 rounded-xl border border-purple-100/90 bg-purple-50/40 p-3 dark:border-purple-900/30 dark:bg-purple-950/20">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#6657E8]/15 text-[#6657E8] dark:bg-[#6657E8]/30 dark:text-[#A59DF7]">
              <Bell className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900 dark:text-white">
                In-App Notification Bell
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                You will be alerted directly in OmBhi at <span className="font-semibold text-gray-700 dark:text-gray-300">{time || 'scheduled time'}</span> ({timezone}).
              </p>
            </div>
          </div>

          {/* Footer Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-xl bg-[#6657E8] px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#5748d6] transition cursor-pointer"
            >
              <Bell className="h-3.5 w-3.5" />
              <span>{editingReminder ? 'Update Reminder' : 'Set Reminder'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
