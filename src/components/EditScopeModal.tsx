import { Calendar, RefreshCw, Layers, X } from 'lucide-react';
import { Task } from '../types';
import { formatReadableDate } from '../utils/date';

export type EditScope = 'single' | 'future' | 'all';

interface EditScopeModalProps {
  task: Task;
  onSelectScope: (scope: EditScope) => void;
  onClose: () => void;
}

export function EditScopeModal({ task, onSelectScope, onClose }: EditScopeModalProps) {
  const formattedDate = formatReadableDate(task.scheduledDate);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-scope-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#1E293B]">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-[#6657E8]" />
            <h3 id="edit-scope-title" className="text-base font-bold text-gray-900 dark:text-white">
              Edit Recurring Task
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close edit scope dialog"
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          <strong className="text-gray-900 dark:text-white">"{task.title}"</strong> repeats across multiple days. How would you like to apply your changes?
        </p>

        <div className="mt-4 space-y-2.5">
          {/* Option 1: Single occurrence */}
          <button
            type="button"
            onClick={() => onSelectScope('single')}
            className="w-full rounded-xl border border-gray-200 bg-white p-3.5 text-left transition hover:border-[#6657E8] hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-[#6657E8] dark:hover:bg-slate-800/80"
          >
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#6657E8]" />
              <p className="text-xs font-bold text-gray-900 dark:text-white">
                This occurrence only ({formattedDate})
              </p>
            </div>
            <p className="mt-1 pl-6 text-[11px] text-gray-400">
              Only change details for {formattedDate}. All other scheduled days retain their settings.
            </p>
          </button>

          {/* Option 2: Future occurrences */}
          <button
            type="button"
            onClick={() => onSelectScope('future')}
            className="w-full rounded-xl border border-gray-200 bg-white p-3.5 text-left transition hover:border-[#6657E8] hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-[#6657E8] dark:hover:bg-slate-800/80"
          >
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-indigo-500" />
              <p className="text-xs font-bold text-gray-900 dark:text-white">
                This and following occurrences
              </p>
            </div>
            <p className="mt-1 pl-6 text-[11px] text-gray-400">
              Update from {formattedDate} onward. Past completed records will not be altered.
            </p>
          </button>

          {/* Option 3: Entire series */}
          <button
            type="button"
            onClick={() => onSelectScope('all')}
            className="w-full rounded-xl border border-gray-200 bg-white p-3.5 text-left transition hover:border-[#6657E8] hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-[#6657E8] dark:hover:bg-slate-800/80"
          >
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-emerald-500" />
              <p className="text-xs font-bold text-gray-900 dark:text-white">
                All occurrences in series
              </p>
            </div>
            <p className="mt-1 pl-6 text-[11px] text-gray-400">
              Update the repeating schedule template across all scheduled days.
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
