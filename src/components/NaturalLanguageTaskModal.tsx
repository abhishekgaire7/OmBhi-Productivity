import { useState } from 'react';
import {
  Sparkles,
  X,
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle2,
  Repeat,
  Loader2,
  Tag,
  ArrowRight,
} from 'lucide-react';
import { Category, Priority, ScheduleMode, Subtask } from '../types';
import { ParsedTaskResult } from '../utils/naturalLanguageTask';
import { getTodayString } from '../utils/date';
import { authenticatedFetch } from '../utils/api';

interface NaturalLanguageTaskModalProps {
  categories: Category[];
  initialReferenceDate?: string;
  onClose: () => void;
  onSaveTask: (payload: {
    title: string;
    description?: string;
    scheduledDate: string;
    startTime?: string;
    endTime?: string;
    categoryId: string;
    priority: Priority;
    status: 'pending';
    progress: number;
    subtasks: Subtask[];
    notes?: string;
    scheduleMode: ScheduleMode;
    recurrenceFrequency?: any;
    recurrenceDays?: number[];
    specificDates?: string[];
    seriesStartDate?: string;
    seriesEndDate?: string;
  }) => void;
}

export function NaturalLanguageTaskModal({
  categories,
  initialReferenceDate = getTodayString(0),
  onClose,
  onSaveTask,
}: NaturalLanguageTaskModalProps) {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [parsed, setParsed] = useState<ParsedTaskResult | null>(null);

  // Editable preview overrides
  const [title, setTitle] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(
    categories[0]?.id || ''
  );
  const [priority, setPriority] = useState<Priority>('medium');
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [scheduledDate, setScheduledDate] = useState<string>(initialReferenceDate);

  const samplePrompts = [
    'Deep work block every weekday at 9 am',
    'Workout session on Monday, Wednesday, and Friday',
    'Sprint planning tomorrow at 2 pm (High priority)',
    'Dentist checkup on Friday at 10:00 for 45 minutes',
  ];

  const handleParse = async (textToParse: string) => {
    if (!textToParse.trim()) return;
    setIsLoading(true);

    try {
      const res = await authenticatedFetch('/api/ai/parse-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: textToParse,
          referenceDate: initialReferenceDate,
          categories: categories.map((c) => ({ id: c.id, name: c.name })),
        }),
      });

      const data = await res.json();
      if (data.success && data.result) {
        const r: ParsedTaskResult = data.result;
        setParsed(r);
        setTitle(r.title);
        setPriority(r.priority);
        setStartTime(r.preferredTime || '');
        setEndTime(r.endTime || '');
        setScheduledDate(r.dates[0] || initialReferenceDate);

        if (r.suggestedCategoryId) {
          setSelectedCategory(r.suggestedCategoryId);
        } else if (categories.length > 0) {
          setSelectedCategory(categories[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to parse natural language task:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!title.trim() || !parsed) return;

    onSaveTask({
      title: title.trim(),
      description: `Created via AI Quick Add from: "${prompt}"`,
      scheduledDate: scheduledDate,
      startTime: startTime || '',
      endTime: endTime || '',
      categoryId: selectedCategory,
      priority: priority,
      status: 'pending',
      progress: 0,
      subtasks: [],
      scheduleMode: parsed.scheduleMode,
      recurrenceFrequency: parsed.recurrenceFrequency,
      recurrenceDays: parsed.recurrenceDays,
      specificDates: parsed.scheduleMode === 'multi_date' ? parsed.dates : undefined,
      seriesStartDate: scheduledDate,
    });

    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-task-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#1E293B]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#6657E8]/10 text-[#6657E8] dark:bg-[#6657E8]/20 dark:text-[#A59DF7]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 id="ai-task-modal-title" className="text-base font-bold text-gray-900 dark:text-white">
                AI Natural Language Task Creation
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Type what you need to do in plain English. We extract time, recurrence, and details.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Input Bar */}
        <div className="mt-4 space-y-3">
          <div className="relative">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleParse(prompt);
                }
              }}
              placeholder='e.g. "Study German for one hour every weekday at 7 pm"'
              className="w-full rounded-xl border border-gray-300 bg-gray-50/60 py-3 pl-4 pr-24 text-sm font-medium text-gray-900 shadow-xs transition placeholder:text-gray-400 focus:border-[#6657E8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#6657E8]/20 dark:border-slate-700 dark:bg-slate-800/80 dark:text-white dark:focus:bg-slate-800"
              autoFocus
            />
            <button
              type="button"
              disabled={!prompt.trim() || isLoading}
              onClick={() => handleParse(prompt)}
              className="absolute right-2 top-2 flex items-center gap-1.5 rounded-lg bg-[#6657E8] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#5544DB] disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Parsing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Extract</span>
                </>
              )}
            </button>
          </div>

          {/* Prompt chips */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-gray-400 font-medium mr-1">Examples:</span>
            {samplePrompts.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setPrompt(p);
                  handleParse(p);
                }}
                className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-600 transition hover:border-[#6657E8] hover:text-[#6657E8] dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300 dark:hover:text-[#A59DF7]"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Parsed Preview Card (Requires Confirmation) */}
        {parsed && (
          <div className="mt-5 rounded-xl border border-[#6657E8]/30 bg-[#6657E8]/5 p-4.5 dark:border-[#6657E8]/40 dark:bg-[#6657E8]/10 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#6657E8] dark:text-[#A59DF7] flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                Parsed Task Preview (Review & Confirm)
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-gray-700 border border-gray-200 dark:bg-slate-800 dark:border-slate-700 dark:text-gray-200">
                {parsed.scheduleMode === 'repeat' ? (
                  <>
                    <Repeat className="h-3 w-3 text-[#6657E8]" />
                    <span>Recurring Series</span>
                  </>
                ) : (
                  <>
                    <Calendar className="h-3 w-3 text-[#16A34A]" />
                    <span>One-time Task</span>
                  </>
                )}
              </span>
            </div>

            {/* Editable Title */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Task Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            {/* Grid of details */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 text-xs">
              {/* Category */}
              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                  <Tag className="h-3 w-3" /> Category
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
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

              {/* Priority */}
              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white capitalize"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              {/* Time */}
              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Start Time
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            {/* Validation / Ambiguities Note */}
            {parsed.ambiguitiesOrWarnings.length > 0 && (
              <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/80 dark:border-amber-900/60 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-semibold">Explicit Details Confirmed:</span>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                    {parsed.ambiguitiesOrWarnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-200/70 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex items-center gap-1.5 rounded-xl bg-[#6657E8] px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#5544DB] transition"
              >
                <span>Confirm & Create Task</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
