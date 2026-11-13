import { Trash2, Calendar, RefreshCw, X } from 'lucide-react';
import { Task } from '../types';
import { formatReadableDate } from '../utils/date';

export type DeleteScope = 'single' | 'all';

interface DeleteScopeModalProps {
  task: Task;
  onSelectScope: (scope: DeleteScope) => void;
  onClose: () => void;
}

export function DeleteScopeModal({ task, onSelectScope, onClose }: DeleteScopeModalProps) {
  const formattedDate = formatReadableDate(task.scheduledDate);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-scope-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#1E293B]">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-rose-500" />
            <h3 id="delete-scope-title" className="text-base font-bold text-gray-900 dark:text-white">
              Delete Recurring Task
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close delete scope dialog"
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          <strong className="text-gray-900 dark:text-white">"{task.title}"</strong> repeats across multiple days. Would you like to delete only this occurrence or the entire schedule?
        </p>

        <div className="mt-4 space-y-2.5">
          {/* Option 1: Single occurrence */}
          <button
            type="button"
            onClick={() => onSelectScope('single')}
            className="w-full rounded-xl border border-gray-200 bg-white p-3.5 text-left transition hover:border-rose-300 hover:bg-rose-50/20 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-rose-800"
          >
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-600 dark:text-gray-300" />
              <p className="text-xs font-bold text-gray-900 dark:text-white">
                Delete this occurrence only ({formattedDate})
              </p>
            </div>
            <p className="mt-1 pl-6 text-[11px] text-gray-400">
              Only remove the task on {formattedDate}. Other days in this recurring schedule remain active.
            </p>
          </button>

          {/* Option 2: Entire recurring series */}
          <button
            type="button"
            onClick={() => onSelectScope('all')}
            className="w-full rounded-xl border border-rose-200 bg-rose-50/30 p-3.5 text-left transition hover:border-rose-400 hover:bg-rose-50/60 dark:border-rose-900/40 dark:bg-rose-950/20"
          >
            <div className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              <p className="text-xs font-bold text-rose-700 dark:text-rose-400">
                Delete entire recurring series
              </p>
            </div>
            <p className="mt-1 pl-6 text-[11px] text-rose-600/80 dark:text-rose-400/80">
              Removes the recurring schedule and all future and pending occurrences across all days.
            </p>
          </button>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
