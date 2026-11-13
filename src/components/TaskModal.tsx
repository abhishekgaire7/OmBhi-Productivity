import { useState } from 'react';
import {
  Calendar,
  CalendarDays,
  Check,
  ChevronDown,
  Plus,
  Repeat,
  Trash2,
  X,
} from 'lucide-react';
import {
  Category,
  Priority,
  RecurrenceFrequency,
  ScheduleMode,
  Subtask,
  Task,
} from '../types';
import { getTodayString } from '../utils/date';

interface TaskSavePayload extends Omit<Task, 'id' | 'createdAt' | 'updatedAt'> {
  id?: string;
  scheduleMode: ScheduleMode;
  recurrenceFrequency?: RecurrenceFrequency;
  recurrenceDays?: number[];
  specificDates?: string[];
  seriesStartDate?: string;
  seriesEndDate?: string;
  editScope?: 'single' | 'future' | 'all';
}

interface TaskModalProps {
  task?: Task | null;
  initialDate: string;
  initialTime?: string;
  categories: Category[];
  initialScheduleMode?: ScheduleMode;
  onClose: () => void;
  onSave: (payload: TaskSavePayload) => void;
}

const WEEKDAYS = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
];

export function TaskModal({
  task,
  initialDate,
  initialTime = '',
  categories,
  initialScheduleMode = 'single',
  onClose,
  onSave,
}: TaskModalProps) {
  const isEditing = Boolean(task?.id);
  const isRecurring = Boolean(task?.seriesId);

  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [scheduledDate, setScheduledDate] = useState(task?.scheduledDate || initialDate);
  const [startTime, setStartTime] = useState(task?.startTime || initialTime);
  const [endTime, setEndTime] = useState(task?.endTime || '');
  const [categoryId, setCategoryId] = useState(task?.categoryId || categories[0]?.id || '');
  const [priority, setPriority] = useState<Priority>(task?.priority || 'medium');
  const [notes, setNotes] = useState(task?.notes || '');
  const [subtasks, setSubtasks] = useState<Subtask[]>(task?.subtasks || []);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  // 1. Schedule Mode: 'single' | 'repeat' | 'multi_date'
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(
    isRecurring ? 'repeat' : initialScheduleMode
  );

  // 2. Repeat Frequency & Days
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(
    task?.recurrence === 'daily'
      ? 'daily'
      : task?.recurrence === 'weekdays'
      ? 'weekdays'
      : task?.recurrenceDays && task.recurrenceDays.length > 0
      ? 'custom_days'
      : 'daily'
  );

  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>(
    task?.recurrenceDays && task.recurrenceDays.length > 0
      ? task.recurrenceDays
      : [1, 2, 4, 5, 6] // default gym/habit preset
  );

  const [seriesStartDate, setSeriesStartDate] = useState(task?.scheduledDate || initialDate);
  const [hasEndDate, setHasEndDate] = useState(false);
  const [seriesEndDate, setSeriesEndDate] = useState(getTodayString(30));

  // 3. Multi-Date list
  const [specificDates, setSpecificDates] = useState<string[]>([
    task?.scheduledDate || initialDate,
    getTodayString(2),
    getTodayString(4),
  ]);
  const [newDateToAdd, setNewDateToAdd] = useState(getTodayString(1));

  // Edit scope if editing a recurring task
  const [editScope, setEditScope] = useState<'single' | 'future' | 'all'>('single');
  const [showAdvanced, setShowAdvanced] = useState(Boolean(task?.notes));

  const toggleWeekday = (day: number) => {
    setSelectedWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const addSpecificDate = () => {
    if (!newDateToAdd || specificDates.includes(newDateToAdd)) return;
    setSpecificDates((prev) => [...prev, newDateToAdd].sort());
  };

  const removeSpecificDate = (dateToRemove: string) => {
    if (specificDates.length <= 1) {
      alert('A multi-date task must have at least one scheduled date.');
      return;
    }
    setSpecificDates((prev) => prev.filter((d) => d !== dateToRemove));
  };

  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    setSubtasks((prev) => [
      ...prev,
      { id: 'st-' + Date.now(), title: newSubtaskTitle.trim(), completed: false },
    ]);
    setNewSubtaskTitle('');
  };

  const handleToggleSubtask = (id: string) => {
    setSubtasks((prev) =>
      prev.map((s) => (s.id === id ? { ...s, completed: !s.completed } : s))
    );
  };

  const handleDeleteSubtask = (id: string) => {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onSave({
      id: task?.id,
      seriesId: task?.seriesId,
      title: title.trim(),
      description: description.trim(),
      scheduledDate: scheduleMode === 'multi_date' ? specificDates[0] : scheduledDate,
      startTime: startTime || '',
      endTime: endTime || '',
      categoryId,
      priority,
      status: task?.status || 'pending',
      progress: task?.progress || 0,
      subtasks,
      notes: notes.trim(),
      scheduleMode,
      recurrenceFrequency: scheduleMode === 'repeat' ? frequency : undefined,
      recurrenceDays:
        scheduleMode === 'repeat' && (frequency === 'custom_days' || frequency === 'weekly')
          ? selectedWeekdays
          : undefined,
      specificDates: scheduleMode === 'multi_date' ? specificDates : undefined,
      seriesStartDate: scheduleMode === 'repeat' ? seriesStartDate : undefined,
      seriesEndDate: scheduleMode === 'repeat' && hasEndDate ? seriesEndDate : undefined,
      editScope: isRecurring ? editScope : undefined,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#1E293B]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 p-5 dark:border-slate-800">
          <div>
            <h2 id="task-modal-title" className="text-base font-bold text-gray-900 dark:text-white">
              {isEditing ? 'Edit Task' : 'Create Task'}
            </h2>
            {isRecurring && (
              <p className="text-[11px] font-medium text-[#6657E8] dark:text-[#A59DF7]">
                Recurring series: {task?.scheduleSummary || 'Multiple occurrences'}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close task modal"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto p-5 text-sm">
          {/* Title */}
          <div>
            <label htmlFor="task-title" className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
              Task Title <span className="text-rose-500">*</span>
            </label>
            <input
              id="task-title"
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Strategic Planning, Team Sync, Deep Work Block"
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#6657E8] focus:outline-hidden dark:border-slate-700 dark:bg-[#1E293B] dark:text-white"
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="task-description" className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
              Description & Context
            </label>
            <textarea
              id="task-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Key notes, exercises, chapter pages, or links..."
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#6657E8] focus:outline-hidden dark:border-slate-700 dark:bg-[#1E293B] dark:text-white"
            />
          </div>

          {/* SECTION: Schedule Mode Chooser */}
          <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Schedule & Recurrence Type
            </label>
            <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-gray-200/70 p-1 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setScheduleMode('single')}
                className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition ${
                  scheduleMode === 'single'
                    ? 'bg-white text-gray-900 shadow-xs dark:bg-[#1E293B] dark:text-white'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                <Calendar className="h-3.5 w-3.5" />
                <span>One-Time</span>
              </button>

              <button
                type="button"
                onClick={() => setScheduleMode('repeat')}
                className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition ${
                  scheduleMode === 'repeat'
                    ? 'bg-white text-[#6657E8] shadow-xs dark:bg-[#1E293B] dark:text-[#A59DF7]'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                <Repeat className="h-3.5 w-3.5" />
                <span>Repeat</span>
              </button>

              <button
                type="button"
                onClick={() => setScheduleMode('multi_date')}
                className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition ${
                  scheduleMode === 'multi_date'
                    ? 'bg-white text-[#6657E8] shadow-xs dark:bg-[#1E293B] dark:text-[#A59DF7]'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                }`}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                <span>Multi-Date</span>
              </button>
            </div>

            {/* Mode A: One-time date picker */}
            {scheduleMode === 'single' && (
              <div className="mt-3">
                <label htmlFor="task-date" className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
                  Scheduled Date
                </label>
                <input
                  id="task-date"
                  type="date"
                  required
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-800 dark:border-slate-700 dark:bg-[#1E293B] dark:text-gray-200"
                />
              </div>
            )}

            {/* Mode B: Repeat Schedule Configuration */}
            {scheduleMode === 'repeat' && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
                      Frequency
                    </label>
                    <select
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
                      className="w-full rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium dark:border-slate-700 dark:bg-[#1E293B]"
                    >
                      <option value="daily">Every day</option>
                      <option value="weekdays">Every weekday (Mon–Fri)</option>
                      <option value="custom_days">Selected weekdays / Custom</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
                      Start Date
                    </label>
                    <input
                      type="date"
                      required
                      value={seriesStartDate}
                      onChange={(e) => setSeriesStartDate(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium dark:border-slate-700 dark:bg-[#1E293B]"
                    />
                  </div>
                </div>

                {/* Weekday Selector for Custom Days or Weekly */}
                {(frequency === 'custom_days' || frequency === 'weekly') && (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                        Select Days of the Week:
                      </span>
                      {/* Presets */}
                      <div className="flex gap-1 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setSelectedWeekdays([1, 2, 4, 5, 6])}
                          className="text-[#6657E8] hover:underline"
                        >
                          Gym (M,T,Th,F,Sa)
                        </button>
                        <span>·</span>
                        <button
                          type="button"
                          onClick={() => setSelectedWeekdays([1, 3, 5])}
                          className="text-[#6657E8] hover:underline"
                        >
                          Study (M,W,F)
                        </button>
                        <span>·</span>
                        <button
                          type="button"
                          onClick={() => setSelectedWeekdays([0])}
                          className="text-[#6657E8] hover:underline"
                        >
                          Sunday
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-between gap-1">
                      {WEEKDAYS.map(({ day, label }) => {
                        const isSelected = selectedWeekdays.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => toggleWeekday(day)}
                            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
                              isSelected
                                ? 'bg-[#6657E8] text-white shadow-xs'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Optional End Date */}
                <div className="flex items-center gap-3 pt-1">
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={hasEndDate}
                      onChange={(e) => setHasEndDate(e.target.checked)}
                      className="rounded accent-[#6657E8]"
                    />
                    <span>Set end date</span>
                  </label>

                  {hasEndDate && (
                    <input
                      type="date"
                      value={seriesEndDate}
                      onChange={(e) => setSeriesEndDate(e.target.value)}
                      className="rounded-xl border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium dark:border-slate-700 dark:bg-[#1E293B]"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Mode C: Multi-Date Selection */}
            {scheduleMode === 'multi_date' && (
              <div className="mt-3 space-y-2.5">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Schedule this exact task on multiple specific dates with independent progress on each day.
                </p>

                {/* Selected Dates Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {specificDates.map((dateStr) => (
                    <span
                      key={dateStr}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 shadow-xs dark:border-slate-700 dark:bg-[#1E293B] dark:text-gray-200"
                    >
                      <Calendar className="h-3 w-3 text-[#6657E8]" />
                      <span>{dateStr}</span>
                      <button
                        type="button"
                        onClick={() => removeSpecificDate(dateStr)}
                        className="text-gray-400 hover:text-rose-500"
                        aria-label={`Remove date ${dateStr}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>

                {/* Add Date control */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="date"
                    value={newDateToAdd}
                    onChange={(e) => setNewDateToAdd(e.target.value)}
                    className="rounded-xl border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium dark:border-slate-700 dark:bg-[#1E293B]"
                  />
                  <button
                    type="button"
                    onClick={addSpecificDate}
                    className="flex items-center gap-1 rounded-xl bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-300 dark:bg-slate-700 dark:text-gray-200"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Date</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Category, Times & Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="task-category" className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
                Category
              </label>
              <select
                id="task-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-800 dark:border-slate-700 dark:bg-[#1E293B] dark:text-gray-200"
              >
                {categories.length === 0 ? (
                  <option value="">General (No Category)</option>
                ) : (
                  categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label htmlFor="task-priority" className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
                Priority
              </label>
              <select
                id="task-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-800 dark:border-slate-700 dark:bg-[#1E293B] dark:text-gray-200"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="task-start-time" className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
                Start Time
              </label>
              <input
                id="task-start-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-2 py-2 text-xs font-medium text-gray-800 dark:border-slate-700 dark:bg-[#1E293B] dark:text-gray-200"
              />
            </div>

            <div>
              <label htmlFor="task-end-time" className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
                End Time
              </label>
              <input
                id="task-end-time"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-2 py-2 text-xs font-medium text-gray-800 dark:border-slate-700 dark:bg-[#1E293B] dark:text-gray-200"
              />
            </div>
          </div>

          {/* Subtasks Section */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500 dark:text-gray-400">
              Subtasks Checklist
            </label>
            <div className="space-y-1.5">
              {subtasks.map((st) => (
                <div
                  key={st.id}
                  className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/60 p-2 dark:border-slate-800 dark:bg-slate-800/60"
                >
                  <input
                    type="checkbox"
                    checked={st.completed}
                    onChange={() => handleToggleSubtask(st.id)}
                    aria-label={`Toggle subtask ${st.title}`}
                    className="h-4 w-4 rounded accent-[#6657E8]"
                  />
                  <span
                    className={`flex-1 text-xs ${
                      st.completed ? 'text-gray-400 line-through dark:text-gray-500' : 'text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    {st.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteSubtask(st.id)}
                    aria-label={`Delete subtask ${st.title}`}
                    className="p-1 text-gray-400 hover:text-rose-500"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add subtask input */}
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSubtask();
                  }
                }}
                placeholder="Add subtask..."
                className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-[#6657E8] focus:outline-hidden dark:border-slate-700 dark:bg-[#1E293B] dark:text-gray-200"
              />
              <button
                type="button"
                onClick={handleAddSubtask}
                className="flex items-center gap-1 rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-gray-200"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add</span>
              </button>
            </div>
          </div>

          {/* EDIT SCOPE CHOOSER: Displayed when modifying an existing recurring series */}
          {isRecurring && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs dark:border-amber-900/50 dark:bg-amber-950/20">
              <label className="mb-1.5 block font-bold text-amber-900 dark:text-amber-300">
                Apply changes to:
              </label>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <input
                    type="radio"
                    name="editScope"
                    value="single"
                    checked={editScope === 'single'}
                    onChange={() => setEditScope('single')}
                    className="accent-[#6657E8]"
                  />
                  <span>This occurrence only ({scheduledDate})</span>
                </label>
                <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <input
                    type="radio"
                    name="editScope"
                    value="future"
                    checked={editScope === 'future'}
                    onChange={() => setEditScope('future')}
                    className="accent-[#6657E8]"
                  />
                  <span>This and following occurrences</span>
                </label>
                <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <input
                    type="radio"
                    name="editScope"
                    value="all"
                    checked={editScope === 'all'}
                    onChange={() => setEditScope('all')}
                    className="accent-[#6657E8]"
                  />
                  <span>All occurrences across entire schedule</span>
                </label>
              </div>
            </div>
          )}

          {/* Collapsible Notes */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#6657E8] hover:underline dark:text-[#A59DF7]"
            >
              <span>{showAdvanced ? 'Hide Additional Notes' : '+ Add Additional Notes / Syllabus Links'}</span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            </button>

            {showAdvanced && (
              <div className="mt-2.5">
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Reference links, paper titles, syllabus sections..."
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 placeholder:text-gray-400 focus:border-[#6657E8] focus:outline-hidden dark:border-slate-700 dark:bg-[#1E293B] dark:text-gray-200"
                />
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-[#6657E8] px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#5544DB] transition"
            >
              {isEditing ? 'Save Changes' : scheduleMode === 'single' ? 'Create Task' : 'Create Recurring Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
