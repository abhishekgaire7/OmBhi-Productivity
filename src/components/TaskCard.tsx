import { useState, useEffect } from 'react';
import {
  Check,
  XCircle,
  Clock,
  Edit2,
  Trash2,
  Copy,
  ChevronDown,
  ListChecks,
  Repeat,
  CalendarClock,
} from 'lucide-react';
import { Category, Task } from '../types';
import { formatTimeDisplay } from '../utils/date';

interface TaskCardProps {
  task: Task;
  category?: Category;
  timeFormat24h?: boolean;
  isUpcoming?: boolean;
  isOverdue?: boolean;
  onEdit: (task: Task) => void;
  onComplete: (task: Task) => void;
  onFailSkipClick: (task: Task) => void;
  onUpdateProgress: (task: Task, progress: number) => void;
  onDelete: (task: Task) => void;
  onDuplicate: (task: Task) => void;
  onReschedule?: (task: Task) => void;
}

export function TaskCard({
  task,
  category,
  timeFormat24h = true,
  isUpcoming = false,
  isOverdue = false,
  onEdit,
  onComplete,
  onFailSkipClick,
  onUpdateProgress,
  onDelete,
  onDuplicate,
  onReschedule,
}: TaskCardProps) {
  const [showProgressSlider, setShowProgressSlider] = useState(false);
  const [customProgressInput, setCustomProgressInput] = useState(String(task.progress));

  useEffect(() => {
    setCustomProgressInput(String(task.progress));
  }, [task.progress]);

  const isCompleted = task.status === 'completed' || task.progress === 100;
  const isFailed = task.status === 'failed' && task.progress < 100;
  const isSkipped = task.status === 'skipped' && task.progress < 100;
  const completedSubtasks = task.subtasks.filter((s) => s.completed).length;

  const handleCustomInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(customProgressInput, 10);
    if (!isNaN(val)) {
      onUpdateProgress(task, Math.max(0, Math.min(100, val)));
    }
  };

  return (
    <div
      data-testid={`task-card-${task.id}`}
      className={`group relative rounded-xl border p-3.5 transition-all duration-150 ${
        isCompleted
          ? 'border-emerald-200/80 bg-emerald-50/20 dark:border-emerald-950/50 dark:bg-emerald-950/10'
          : isFailed
          ? 'border-rose-200/80 bg-rose-50/20 dark:border-rose-950/50 dark:bg-rose-950/10'
          : isSkipped
          ? 'border-gray-200 bg-gray-50/60 opacity-75 dark:border-slate-800 dark:bg-slate-800/40'
          : isOverdue
          ? 'border-rose-300 bg-white shadow-xs dark:border-rose-800/80 dark:bg-[#1E293B]'
          : isUpcoming
          ? 'border-[#6657E8]/50 bg-white shadow-xs ring-1 ring-[#6657E8]/20 dark:border-[#6657E8]/60 dark:bg-[#1E293B]'
          : 'border-purple-100/80 bg-white shadow-xs hover:border-purple-200 dark:border-slate-800 dark:bg-[#1E293B] dark:hover:border-slate-700'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* CONTROL A: Checkmark completion */}
        <button
          type="button"
          onClick={() => onComplete(task)}
          aria-label={`Mark "${task.title}" as ${isCompleted ? 'incomplete' : 'completed'}`}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border transition-all ${
            isCompleted
              ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs dark:border-emerald-500 dark:bg-emerald-500'
              : 'border-gray-300 text-transparent hover:border-emerald-500 hover:text-emerald-500 dark:border-slate-600 dark:hover:border-emerald-400'
          }`}
          title={isCompleted ? 'Completed (Click to toggle)' : 'Complete task (sets to 100%)'}
        >
          <Check className="h-3.5 w-3.5 stroke-[3]" />
        </button>

        {/* Task Title & Metadata */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onEdit(task)}
              className={`text-left text-sm font-semibold tracking-tight transition hover:text-[#6657E8] dark:hover:text-[#A59DF7] ${
                isCompleted
                  ? 'text-gray-400 line-through dark:text-gray-500'
                  : 'text-gray-900 dark:text-white'
              }`}
            >
              {task.title}
            </button>

            {/* Category tag */}
            {category && (
              <span
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                style={{
                  backgroundColor: `${category.color}15`,
                  color: category.color,
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: category.color }} />
                {category.name}
              </span>
            )}

            {/* Repeat / Multi-day indicator */}
            {task.seriesId && (
              <span
                title={task.scheduleSummary || 'Recurring schedule'}
                className="inline-flex items-center gap-1 rounded bg-[#6657E8]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#6657E8] dark:bg-[#6657E8]/20 dark:text-[#A59DF7]"
              >
                <Repeat className="h-2.5 w-2.5" />
                <span>{task.scheduleSummary || 'Repeat'}</span>
              </span>
            )}

            {/* Priority marker */}
            {task.priority !== 'medium' && (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  task.priority === 'urgent'
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                    : task.priority === 'high'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-400'
                }`}
              >
                {task.priority}
              </span>
            )}

            {/* Overdue badge */}
            {isOverdue && !isCompleted && !isFailed && !isSkipped && (
              <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                Overdue
              </span>
            )}

            {/* Failed / Skipped state badge */}
            {isFailed && (
              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-400">
                Failed
              </span>
            )}
            {isSkipped && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600 dark:bg-slate-800 dark:text-gray-400">
                Skipped
              </span>
            )}
          </div>

          {task.description && (
            <p className="mt-1 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
              {task.description}
            </p>
          )}

          {/* Time, subtasks, and progress trigger */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
            {task.startTime && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-gray-600 dark:text-gray-400">
                <Clock className="h-3 w-3" />
                <span>{formatTimeDisplay(task.startTime, timeFormat24h)}</span>
                {task.endTime && <span>– {formatTimeDisplay(task.endTime, timeFormat24h)}</span>}
              </span>
            )}

            {task.subtasks.length > 0 && (
              <span className="flex items-center gap-1 text-[11px]">
                <ListChecks className="h-3 w-3" />
                <span>
                  {completedSubtasks}/{task.subtasks.length} subtasks
                </span>
              </span>
            )}

            {/* CONTROL C Trigger: Progress button */}
            <button
              type="button"
              onClick={() => setShowProgressSlider(!showProgressSlider)}
              aria-label={`Adjust progress for "${task.title}". Current progress is ${task.progress}%`}
              className="flex items-center gap-1 text-[11px] font-semibold text-[#6657E8] hover:underline dark:text-[#A59DF7]"
            >
              <span>{task.progress}% progress</span>
              <ChevronDown className={`h-3 w-3 transition-transform ${showProgressSlider ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* CONTROL C Panel: Expandable slider, numeric entry, and quick chips */}
          {showProgressSlider && (
            <div className="mt-2.5 space-y-2 rounded-xl border border-gray-100 bg-gray-50/80 p-2.5 dark:border-slate-800 dark:bg-slate-800/80">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={task.progress}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setCustomProgressInput(String(val));
                    onUpdateProgress(task, val);
                  }}
                  aria-label={`Progress percentage slider for "${task.title}"`}
                  className="h-1.5 flex-1 accent-[#6657E8]"
                />

                <form onSubmit={handleCustomInputSubmit} className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={customProgressInput}
                    onChange={(e) => setCustomProgressInput(e.target.value)}
                    onBlur={() => {
                      const val = parseInt(customProgressInput, 10);
                      if (!isNaN(val)) onUpdateProgress(task, Math.max(0, Math.min(100, val)));
                    }}
                    className="w-12 rounded border border-gray-300 bg-white px-1 py-0.5 text-center text-xs font-semibold dark:border-slate-700 dark:bg-[#1E293B]"
                  />
                  <span className="text-xs font-bold">%</span>
                </form>
              </div>

              {/* Quick Percentage Chips */}
              <div className="flex items-center gap-1">
                {[0, 25, 50, 75, 100].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      setCustomProgressInput(String(val));
                      onUpdateProgress(task, val);
                    }}
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold transition ${
                      task.progress === val
                        ? 'bg-[#6657E8] text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600'
                    }`}
                  >
                    {val}%
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Controls Cluster */}
        <div className="flex items-center gap-0.5 opacity-90 transition-opacity group-hover:opacity-100">
          {/* CONTROL B: Cross button for Fail / Skip modal */}
          <button
            type="button"
            onClick={() => onFailSkipClick(task)}
            aria-label={`Mark "${task.title}" as failed or skipped`}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
            title="Mark Failed or Skipped"
          >
            <XCircle className="h-4 w-4" />
          </button>

          {/* Smart Reschedule Button */}
          {onReschedule && (
            <button
              type="button"
              onClick={() => onReschedule(task)}
              aria-label={`Smart reschedule "${task.title}"`}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/30 dark:hover:text-amber-400"
              title="Smart Reschedule"
            >
              <CalendarClock className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => onEdit(task)}
            aria-label={`Edit task "${task.title}"`}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-gray-200"
            title="Edit task"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onDuplicate(task)}
            aria-label={`Duplicate task "${task.title}"`}
            className="hidden rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 sm:inline-flex dark:hover:bg-slate-800 dark:hover:text-gray-200"
            title="Duplicate task"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onDelete(task)}
            aria-label={`Delete task "${task.title}"`}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
            title="Delete task"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Embedded progress bar when active and slider closed */}
      {task.progress > 0 && task.progress < 100 && !showProgressSlider && (
        <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-[#6657E8] transition-all duration-300"
            style={{ width: `${task.progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
