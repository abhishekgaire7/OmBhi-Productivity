import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Task } from '../types';

interface FailSkipModalProps {
  task: Task;
  onClose: () => void;
  onConfirm: (task: Task, status: 'failed' | 'skipped') => void;
  onSmartReschedule?: (task: Task) => void;
}

export function FailSkipModal({ task, onClose, onConfirm, onSmartReschedule }: FailSkipModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<'failed' | 'skipped'>('failed');
  const hasExistingProgress = task.progress > 0;
  const [confirmedLoss, setConfirmedLoss] = useState(!hasExistingProgress);

  const handleProceed = () => {
    if (hasExistingProgress && !confirmedLoss) {
      setConfirmedLoss(true);
      return;
    }
    onConfirm(task, selectedStatus);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="fail-skip-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-[#1E293B]">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
          <h3 id="fail-skip-title" className="text-base font-bold text-gray-900 dark:text-white">
            Record Status
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close status dialog"
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Choose whether <strong className="text-gray-700 dark:text-gray-200">"{task.title}"</strong> was attempted
          unsuccessfully or intentionally skipped.
        </p>

        {/* Existing progress confirmation notice */}
        {hasExistingProgress && !confirmedLoss && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-semibold">Current progress is {task.progress}%</p>
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                Marking this task as failed or skipped will reset its progress to 0%.
              </p>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-2">
          {/* Failed option */}
          <button
            type="button"
            onClick={() => setSelectedStatus('failed')}
            className={`w-full rounded-xl border p-3 text-left transition ${
              selectedStatus === 'failed'
                ? 'border-rose-400 bg-rose-50/70 ring-1 ring-rose-400 dark:border-rose-800 dark:bg-rose-950/30'
                : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800'
            }`}
          >
            <p className="text-sm font-semibold text-rose-700 dark:text-rose-400">Mark as Failed</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              The task was attempted or scheduled, but was not successfully completed.
            </p>
          </button>

          {/* Skipped option */}
          <button
            type="button"
            onClick={() => setSelectedStatus('skipped')}
            className={`w-full rounded-xl border p-3 text-left transition ${
              selectedStatus === 'skipped'
                ? 'border-indigo-400 bg-indigo-50/70 ring-1 ring-indigo-400 dark:border-indigo-800 dark:bg-indigo-950/30'
                : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800'
            }`}
          >
            <p className="text-sm font-semibold text-indigo-700 dark:text-[#A59DF7]">Mark as Skipped</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              The task was intentionally not done or deprioritized. Never treated as completed.
            </p>
          </button>
        </div>

        {onSmartReschedule && (
          <div className="mt-3 border-t border-gray-100 pt-3 dark:border-slate-800">
            <button
              type="button"
              onClick={() => {
                onClose();
                onSmartReschedule(task);
              }}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50/70 p-2.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300 transition"
            >
              <span>⚡ Rather reschedule this task? Try Smart Reschedule</span>
            </button>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleProceed}
            className="rounded-xl bg-[#6657E8] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#5544DB] transition"
          >
            {hasExistingProgress && !confirmedLoss ? 'Confirm & Reset to 0%' : 'Apply Status'}
          </button>
        </div>
      </div>
    </div>
  );
}
