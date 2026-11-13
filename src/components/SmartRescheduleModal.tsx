import { useState } from 'react';
import {
  Calendar,
  Clock,
  X,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { Task } from '../types';
import {
  recommendRescheduleSlots,
  RescheduleRecommendation,
} from '../utils/rescheduling';
import { formatReadableDate, formatTimeDisplay, getTodayString } from '../utils/date';

interface SmartRescheduleModalProps {
  task: Task;
  allTasks: Task[];
  timeFormat24h: boolean;
  onClose: () => void;
  onConfirmReschedule: (
    task: Task,
    targetDate: string,
    targetStartTime?: string,
    targetEndTime?: string
  ) => void;
}

export function SmartRescheduleModal({
  task,
  allTasks,
  timeFormat24h,
  onClose,
  onConfirmReschedule,
}: SmartRescheduleModalProps) {
  const recommendations = recommendRescheduleSlots(
    task,
    allTasks,
    task.scheduledDate || getTodayString(0)
  );

  const [selectedSlot, setSelectedSlot] = useState<RescheduleRecommendation | null>(
    recommendations[0] || null
  );

  // Custom picker fallback
  const [customDate, setCustomDate] = useState<string>(
    recommendations[0]?.date || getTodayString(1)
  );
  const [customStartTime, setCustomStartTime] = useState<string>(
    recommendations[0]?.startTime || '10:00'
  );
  const [useCustom, setUseCustom] = useState(false);

  const handleApply = () => {
    if (useCustom) {
      onConfirmReschedule(task, customDate, customStartTime || undefined);
    } else if (selectedSlot) {
      onConfirmReschedule(
        task,
        selectedSlot.date,
        selectedSlot.startTime,
        selectedSlot.endTime
      );
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="smart-reschedule-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#1E293B]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 id="smart-reschedule-title" className="text-base font-bold text-gray-900 dark:text-white">
                Smart Reschedule
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Conflict-free alternative slots based on your remaining calendar
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

        {/* Task Summary */}
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/70 p-3.5 dark:border-slate-700 dark:bg-slate-800/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Task to Reschedule
            </span>
            <span className="text-xs font-medium text-gray-500">
              Was on {formatReadableDate(task.scheduledDate)}
            </span>
          </div>
          <h3 className="mt-1 text-sm font-bold text-gray-900 dark:text-white">
            {task.title}
          </h3>
        </div>

        {/* Single occurrence safety notice */}
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-blue-50/80 p-3 text-xs text-blue-900 dark:bg-blue-950/30 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/50">
          <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
          <p>
            <span className="font-semibold">Independent Occurrence Guarantee:</span> Only this single date will be rescheduled. Your recurring series and other scheduled dates remain completely untouched.
          </p>
        </div>

        {/* Recommendations list */}
        <div className="mt-4 space-y-2.5">
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
            Recommended Conflict-Free Slots
          </label>

          {recommendations.map((rec, i) => {
            const isSelected = !useCustom && selectedSlot?.date === rec.date && selectedSlot?.startTime === rec.startTime;
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setUseCustom(false);
                  setSelectedSlot(rec);
                }}
                className={`w-full text-left rounded-xl border p-3.5 transition flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'border-[#6657E8] bg-[#6657E8]/5 ring-2 ring-[#6657E8]/20 dark:bg-[#6657E8]/10'
                    : 'border-gray-200 hover:border-gray-300 dark:border-slate-700 dark:hover:border-slate-600'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-900 dark:text-white">
                      {rec.dateDisplay}
                    </span>
                    <span className="flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                      <Clock className="h-3 w-3" />
                      {formatTimeDisplay(rec.startTime, timeFormat24h)} – {formatTimeDisplay(rec.endTime, timeFormat24h)}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {rec.reason}
                  </p>
                </div>

                <div
                  className={`h-5 w-5 rounded-full border flex items-center justify-center shrink-0 ${
                    isSelected
                      ? 'border-[#6657E8] bg-[#6657E8] text-white'
                      : 'border-gray-300 dark:border-slate-600'
                  }`}
                >
                  {isSelected && <CheckCircle2 className="h-3.5 w-3.5" />}
                </div>
              </button>
            );
          })}

          {/* Custom Date Option Toggle */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setUseCustom(!useCustom)}
              className="text-xs font-semibold text-[#6657E8] hover:underline dark:text-[#A59DF7]"
            >
              {useCustom ? '← Back to AI recommendations' : 'Or choose custom date & time...'}
            </button>

            {useCustom && (
              <div className="mt-2.5 grid grid-cols-2 gap-3 rounded-xl border border-gray-200 p-3 dark:border-slate-700">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                    Target Date
                  </label>
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                    Start Time (optional)
                  </label>
                  <input
                    type="time"
                    value={customStartTime}
                    onChange={(e) => setCustomStartTime(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 flex items-center justify-end gap-2.5 border-t border-gray-100 pt-4 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="flex items-center gap-1.5 rounded-xl bg-[#6657E8] px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#5544DB] transition"
          >
            <span>Confirm Reschedule</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
