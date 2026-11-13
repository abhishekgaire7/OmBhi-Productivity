import { useState, useEffect } from 'react';
import {
  Sparkles,
  X,
  Clock,
  ShieldCheck,
  Coffee,
  CheckCircle2,
  Calendar,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { Task } from '../types';
import { DayPlanProposal, generateDaySchedulePlan } from '../utils/dayPlanner';
import { formatFullDateHeader, formatTimeDisplay } from '../utils/date';
import { authenticatedFetch } from '../utils/api';

interface AIDayPlannerModalProps {
  date: string;
  tasks: Task[];
  timeFormat24h: boolean;
  onClose: () => void;
  onApplyPlan: (updates: { taskId: string; startTime: string; endTime: string }[]) => void;
}

export function AIDayPlannerModal({
  date,
  tasks,
  timeFormat24h,
  onClose,
  onApplyPlan,
}: AIDayPlannerModalProps) {
  const [proposal, setProposal] = useState<DayPlanProposal | null>(null);
  const [editedItems, setEditedItems] = useState<
    { taskId: string; title: string; startTime: string; endTime: string; isFixed: boolean; included: boolean }[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchPlan() {
      setIsLoading(true);
      try {
        const res = await authenticatedFetch('/api/ai/plan-day', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date,
            tasks,
            workStart: '08:30',
            workEnd: '19:00',
            defaultDurationMinutes: 45,
            bufferMinutes: 15,
          }),
        });
        const data = await res.json();
        if (data.success && data.proposal) {
          setProposal(data.proposal);
          setEditedItems(
            data.proposal.items.map((it: any) => ({
              taskId: it.taskId,
              title: it.title,
              startTime: it.startTime,
              endTime: it.endTime,
              isFixed: it.isFixed,
              included: true,
            }))
          );
        } else {
          // Local fallback
          const localProp = generateDaySchedulePlan({ date, tasks });
          setProposal(localProp);
          setEditedItems(
            localProp.items.map((it) => ({
              taskId: it.taskId,
              title: it.title,
              startTime: it.startTime,
              endTime: it.endTime,
              isFixed: it.isFixed,
              included: true,
            }))
          );
        }
      } catch {
        const localProp = generateDaySchedulePlan({ date, tasks });
        setProposal(localProp);
        setEditedItems(
          localProp.items.map((it) => ({
            taskId: it.taskId,
            title: it.title,
            startTime: it.startTime,
            endTime: it.endTime,
            isFixed: it.isFixed,
            included: true,
          }))
        );
      } finally {
        setIsLoading(false);
      }
    }

    fetchPlan();
  }, [date, tasks]);

  const handleTimeChange = (index: number, field: 'startTime' | 'endTime', value: string) => {
    setEditedItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleToggleInclude = (index: number) => {
    setEditedItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], included: !copy[index].included };
      return copy;
    });
  };

  const handleApply = () => {
    const toApply = editedItems
      .filter((i) => i.included)
      .map((i) => ({
        taskId: i.taskId,
        startTime: i.startTime,
        endTime: i.endTime,
      }));

    onApplyPlan(toApply);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="day-planner-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#1E293B]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 p-5 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#6657E8]/10 text-[#6657E8] dark:bg-[#6657E8]/20 dark:text-[#A59DF7]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 id="day-planner-title" className="text-base font-bold text-gray-900 dark:text-white">
                AI Daily Schedule Proposal
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {formatFullDateHeader(date)} • Non-overlapping time blocks & restorative breaks
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#6657E8]" />
              <p className="mt-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                Analyzing commitments and optimizing time blocks...
              </p>
            </div>
          ) : !proposal || proposal.items.length === 0 ? (
            <div className="py-10 text-center">
              <Calendar className="mx-auto h-10 w-10 text-gray-300 dark:text-slate-700" />
              <p className="mt-3 text-sm font-medium text-gray-600 dark:text-gray-400">
                No tasks found for {formatFullDateHeader(date)}. Add some tasks to generate a smart daily schedule!
              </p>
            </div>
          ) : (
            <>
              {/* Proposal rationale summary banner */}
              <div className="rounded-xl border border-[#6657E8]/20 bg-[#6657E8]/5 p-3.5 text-xs text-gray-700 dark:border-[#6657E8]/30 dark:bg-[#6657E8]/10 dark:text-gray-200">
                <span className="font-semibold text-[#6657E8] dark:text-[#A59DF7]">Schedule Strategy: </span>
                {proposal.summary}
              </div>

              {/* Editable Timeline Items */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-gray-400 px-1">
                  <span>Proposed Schedule ({editedItems.filter((i) => i.included).length} tasks)</span>
                  <span>Edit times before applying</span>
                </div>

                {editedItems.map((item, index) => (
                  <div
                    key={item.taskId}
                    className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition ${
                      item.included
                        ? 'border-gray-200 bg-gray-50/70 dark:border-slate-700 dark:bg-slate-800/60'
                        : 'border-dashed border-gray-200 opacity-50 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={item.included}
                        onChange={() => handleToggleInclude(index)}
                        className="h-4 w-4 rounded border-gray-300 text-[#6657E8] focus:ring-[#6657E8]"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-900 dark:text-white">
                            {item.title}
                          </span>
                          {item.isFixed && (
                            <span className="flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
                              <ShieldCheck className="h-3 w-3" /> Fixed
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-gray-500 dark:text-gray-400">
                          {formatTimeDisplay(item.startTime, timeFormat24h)} – {formatTimeDisplay(item.endTime, timeFormat24h)}
                        </span>
                      </div>
                    </div>

                    {/* Editable Time Pickers */}
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={item.startTime}
                        disabled={!item.included}
                        onChange={(e) => handleTimeChange(index, 'startTime', e.target.value)}
                        className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                      <span className="text-xs text-gray-400">to</span>
                      <input
                        type="time"
                        value={item.endTime}
                        disabled={!item.included}
                        onChange={(e) => handleTimeChange(index, 'endTime', e.target.value)}
                        className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Breaks Info */}
              {proposal.breaks.length > 0 && (
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Recommended Rest Buffers
                  </span>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {proposal.breaks.map((b, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2.5 rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-2.5 text-xs text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300"
                      >
                        <Coffee className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <div>
                          <p className="font-semibold">{b.label}</p>
                          <p className="text-[11px] opacity-80">
                            {formatTimeDisplay(b.startTime, timeFormat24h)} – {formatTimeDisplay(b.endTime, timeFormat24h)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-gray-100 p-4 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isLoading || editedItems.filter((i) => i.included).length === 0}
            onClick={handleApply}
            className="flex items-center gap-1.5 rounded-xl bg-[#6657E8] px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#5544DB] transition disabled:opacity-50"
          >
            <span>Apply Schedule to My Day</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
