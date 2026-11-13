import { useState, useMemo } from 'react';
import {
  CalendarRange,
  Clock,
  Plus,
  Trash2,
  Save,
  CalendarCheck,
  Sparkles,
  Layers,
  ArrowUpDown,
  Check,
  Copy,
  FolderHeart,
  ChevronRight,
  Info,
  Calendar,
  Tag,
} from 'lucide-react';
import { Category, Priority, TimetableSlot, TimetableTemplate, UserSettings } from '../types';
import {
  generateAutoChunks,
  PRESET_CHUNKS,
  PRESET_BREAKS,
  QUICK_TAG_SUGGESTIONS,
  formatDurationHuman,
  calculateTotalDurationMinutes,
  timeToMinutes,
} from '../utils/timetable';
import { getTodayString, parseISODate } from '../utils/date';

interface TimetableViewProps {
  categories: Category[];
  settings: UserSettings;
  templates: TimetableTemplate[];
  onSaveTemplate: (template: TimetableTemplate) => Promise<void> | void;
  onDeleteTemplate: (templateId: string) => Promise<void> | void;
  onApplySlotsToSchedule: (slots: TimetableSlot[], targetDates: string[]) => Promise<void> | void;
  onNavigateToTasks?: () => void;
}

type TimetableTab = 'auto' | 'manual' | 'templates';
type TargetDateScope = 'today' | 'tomorrow' | 'weekdays' | 'fullweek' | 'custom';

export function TimetableView({
  categories,
  settings,
  templates,
  onSaveTemplate,
  onDeleteTemplate,
  onApplySlotsToSchedule,
  onNavigateToTasks,
}: TimetableViewProps) {
  const [activeTab, setActiveTab] = useState<TimetableTab>('auto');

  // Auto-Generator Parameters
  const [startTime, setStartTime] = useState<string>('08:00');
  const [endTime, setEndTime] = useState<string>('17:00');
  const [chunkDuration, setChunkDuration] = useState<number>(60);
  const [breakBuffer, setBreakBuffer] = useState<number>(0);
  const [isCustomChunk, setIsCustomChunk] = useState<boolean>(false);
  const [customChunkInput, setCustomChunkInput] = useState<string>('60');

  // Target Date Selection
  const [targetScope, setTargetScope] = useState<TargetDateScope>('today');
  const [customTargetDate, setCustomTargetDate] = useState<string>(getTodayString(0));

  // Generated / Staged Slots for Auto Generator
  const [autoSlots, setAutoSlots] = useState<TimetableSlot[]>(() =>
    generateAutoChunks({
      startTime: '08:00',
      endTime: '17:00',
      chunkMinutes: 60,
      breakMinutes: 0,
      defaultTitle: 'Focus Session',
    })
  );

  // Manual Builder Slots
  const [manualSlots, setManualSlots] = useState<TimetableSlot[]>([
    {
      id: 'manual-1',
      title: 'Morning Deep Work',
      startTime: '08:15',
      endTime: '09:05',
      priority: 'high',
      notes: 'High leverage task without interruptions',
    },
    {
      id: 'manual-2',
      title: 'Strategy & Review',
      startTime: '09:15',
      endTime: '10:30',
      priority: 'medium',
      notes: 'Review sprint deliverables',
    },
    {
      id: 'manual-3',
      title: 'Open Studio / Implementation',
      startTime: '11:00',
      endTime: '13:00',
      priority: 'medium',
    },
  ]);

  // Template Save Modal / Prompt State
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateSourceTab, setTemplateSourceTab] = useState<'auto' | 'manual'>('auto');

  // Applying state
  const [isApplying, setIsApplying] = useState(false);
  const [applySuccessMessage, setApplySuccessMessage] = useState<string | null>(null);

  // Re-generate auto chunks when configuration parameters change
  const handleRegenerateAuto = (
    newStart = startTime,
    newEnd = endTime,
    newChunk = chunkDuration,
    newBreak = breakBuffer
  ) => {
    const fresh = generateAutoChunks({
      startTime: newStart,
      endTime: newEnd,
      chunkMinutes: newChunk,
      breakMinutes: newBreak,
      defaultTitle: 'Focus Slot',
    });
    setAutoSlots(fresh);
  };

  // Compute target dates based on selected scope
  const targetDates = useMemo<string[]>(() => {
    const today = parseISODate(getTodayString(0));
    switch (targetScope) {
      case 'today':
        return [getTodayString(0)];
      case 'tomorrow':
        return [getTodayString(1)];
      case 'weekdays': {
        // Monday through Friday of current week
        const dates: string[] = [];
        const currentDayOfWeek = today.getDay(); // 0 is Sun, 1 is Mon
        const distToMonday = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
        const monday = new Date(today);
        monday.setDate(today.getDate() + distToMonday);

        for (let i = 0; i < 5; i++) {
          const d = new Date(monday);
          d.setDate(monday.getDate() + i);
          dates.push(d.toISOString().split('T')[0]);
        }
        return dates;
      }
      case 'fullweek': {
        // Next 7 days starting today
        const dates: string[] = [];
        for (let i = 0; i < 7; i++) {
          dates.push(getTodayString(i));
        }
        return dates;
      }
      case 'custom':
        return [customTargetDate || getTodayString(0)];
      default:
        return [getTodayString(0)];
    }
  }, [targetScope, customTargetDate]);

  // Update a single slot in auto slots
  const handleUpdateAutoSlot = (index: number, updates: Partial<TimetableSlot>) => {
    setAutoSlots((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...updates };
      return copy;
    });
  };

  // Quick tag chip applied to auto slot
  const handleApplyQuickTag = (index: number, tagLabel: string) => {
    setAutoSlots((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], title: tagLabel };
      return copy;
    });
  };

  // Manual slots management
  const handleAddManualSlot = () => {
    const lastSlot = manualSlots[manualSlots.length - 1];
    let defaultStart = '14:00';
    let defaultEnd = '15:00';

    if (lastSlot && lastSlot.endTime) {
      const endMins = timeToMinutes(lastSlot.endTime);
      const nextStartMins = endMins + 15;
      const nextEndMins = nextStartMins + 60;
      const hours = Math.floor((nextStartMins % (24 * 60)) / 60);
      const mins = nextStartMins % 60;
      defaultStart = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;

      const endHours = Math.floor((nextEndMins % (24 * 60)) / 60);
      const endRemainingMins = nextEndMins % 60;
      defaultEnd = `${String(endHours).padStart(2, '0')}:${String(endRemainingMins).padStart(2, '0')}`;
    }

    const newSlot: TimetableSlot = {
      id: `slot-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: 'New Time Block',
      startTime: defaultStart,
      endTime: defaultEnd,
      priority: 'medium',
    };

    setManualSlots((prev) => [...prev, newSlot]);
  };

  const handleUpdateManualSlot = (id: string, updates: Partial<TimetableSlot>) => {
    setManualSlots((prev) =>
      prev.map((slot) => (slot.id === id ? { ...slot, ...updates } : slot))
    );
  };

  const handleDeleteManualSlot = (id: string) => {
    setManualSlots((prev) => prev.filter((slot) => slot.id !== id));
  };

  const handleMoveManualSlot = (index: number, direction: 'up' | 'down') => {
    setManualSlots((prev) => {
      const copy = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= copy.length) return prev;
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  };

  // Execute Batch Application to Schedule
  const handleApplyToSchedule = async (slotsToApply: TimetableSlot[]) => {
    if (slotsToApply.length === 0 || targetDates.length === 0) return;
    setIsApplying(true);
    setApplySuccessMessage(null);
    try {
      await onApplySlotsToSchedule(slotsToApply, targetDates);
      const count = slotsToApply.length * targetDates.length;
      setApplySuccessMessage(
        `Successfully scheduled ${count} time block${count > 1 ? 's' : ''} across ${
          targetDates.length
        } day${targetDates.length > 1 ? 's' : ''}!`
      );
      setTimeout(() => {
        setApplySuccessMessage(null);
      }, 5000);
    } finally {
      setIsApplying(false);
    }
  };

  // Save current slots as reusable template
  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) return;
    const slots = templateSourceTab === 'auto' ? autoSlots : manualSlots;
    const newTemplate: TimetableTemplate = {
      id: `tmpl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: templateName.trim(),
      description: templateDescription.trim(),
      mode: templateSourceTab === 'auto' ? 'auto_chunks' : 'manual',
      chunkDuration: templateSourceTab === 'auto' ? chunkDuration : undefined,
      breakDuration: templateSourceTab === 'auto' ? breakBuffer : undefined,
      slots: slots.map((s) => ({ ...s })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await onSaveTemplate(newTemplate);
    setIsSaveModalOpen(false);
    setTemplateName('');
    setTemplateDescription('');
    setApplySuccessMessage(`Template "${newTemplate.name}" saved!`);
    setTimeout(() => setApplySuccessMessage(null), 4000);
  };

  // Load template into Manual builder
  const handleLoadTemplate = (template: TimetableTemplate) => {
    setManualSlots(
      template.slots.map((s) => ({
        ...s,
        id: `slot-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      }))
    );
    setActiveTab('manual');
    setApplySuccessMessage(`Loaded "${template.name}" into Manual Builder.`);
    setTimeout(() => setApplySuccessMessage(null), 3000);
  };

  const autoTotalMins = calculateTotalDurationMinutes(autoSlots);
  const manualTotalMins = calculateTotalDurationMinutes(manualSlots);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xs sm:flex-row sm:items-center dark:border-slate-800 dark:bg-[#1E293B]">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#6657E8]/10 text-[#6657E8] dark:bg-[#6657E8]/20 dark:text-[#A59DF7]">
            <CalendarRange className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
              Timetable Planner & Generator
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Chunk your day automatically with custom time gaps, or assemble flexible custom schedules.
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center rounded-xl bg-gray-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('auto')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === 'auto'
                ? 'bg-white text-[#6657E8] shadow-xs dark:bg-slate-700 dark:text-white'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Auto Chunk</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === 'manual'
                ? 'bg-white text-[#6657E8] shadow-xs dark:bg-slate-700 dark:text-white'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Free Will Builder</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('templates')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activeTab === 'templates'
                ? 'bg-white text-[#6657E8] shadow-xs dark:bg-slate-700 dark:text-white'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            <FolderHeart className="h-3.5 w-3.5" />
            <span>Templates ({templates.length})</span>
          </button>
        </div>
      </div>

      {/* Success Notification Alert */}
      {applySuccessMessage && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{applySuccessMessage}</span>
          </div>
          {onNavigateToTasks && (
            <button
              type="button"
              onClick={onNavigateToTasks}
              className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 underline hover:text-emerald-900 dark:text-emerald-300"
            >
              <span>View Tasks</span>
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* Target Date Scope Selector (Global for both Auto & Manual builders) */}
      {activeTab !== 'templates' && (
        <div className="rounded-2xl border border-gray-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#6657E8] dark:text-[#A59DF7]" />
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                Apply to Target Date(s):
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'today', label: 'Today' },
                  { id: 'tomorrow', label: 'Tomorrow' },
                  { id: 'weekdays', label: 'Mon – Fri' },
                  { id: 'fullweek', label: 'Whole Week' },
                  { id: 'custom', label: 'Specific Date' },
                ] as const
              ).map((scope) => (
                <button
                  key={scope.id}
                  type="button"
                  onClick={() => setTargetScope(scope.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    targetScope === scope.id
                      ? 'bg-[#6657E8] text-white shadow-xs'
                      : 'border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {scope.label}
                </button>
              ))}

              {targetScope === 'custom' && (
                <input
                  type="date"
                  value={customTargetDate}
                  onChange={(e) => setCustomTargetDate(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              )}
            </div>
          </div>

          <div className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
            Selected target: <span className="font-semibold text-gray-700 dark:text-gray-300">{targetDates.join(', ')}</span> ({targetDates.length} day{targetDates.length > 1 ? 's' : ''})
          </div>
        </div>
      )}

      {/* TAB 1: AUTO-CHUNK GENERATOR */}
      {activeTab === 'auto' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
            <h2 className="mb-4 text-sm font-bold text-gray-900 dark:text-white">
              1. Configure Chunking Parameters
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Start Time */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  Start Time
                </label>
                <div className="relative">
                  <Clock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => {
                      setStartTime(e.target.value);
                      handleRegenerateAuto(e.target.value, endTime, chunkDuration, breakBuffer);
                    }}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50/50 py-2 pl-9 pr-3 text-xs font-semibold text-gray-900 dark:border-slate-700 dark:bg-slate-800/80 dark:text-white"
                  />
                </div>
              </div>

              {/* End Time */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  End Time
                </label>
                <div className="relative">
                  <Clock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => {
                      setEndTime(e.target.value);
                      handleRegenerateAuto(startTime, e.target.value, chunkDuration, breakBuffer);
                    }}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50/50 py-2 pl-9 pr-3 text-xs font-semibold text-gray-900 dark:border-slate-700 dark:bg-slate-800/80 dark:text-white"
                  />
                </div>
              </div>

              {/* Chunk Duration */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  Chunk Duration
                </label>
                <div className="flex flex-wrap gap-1">
                  {PRESET_CHUNKS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => {
                        setIsCustomChunk(false);
                        setChunkDuration(preset.value);
                        handleRegenerateAuto(startTime, endTime, preset.value, breakBuffer);
                      }}
                      className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition ${
                        !isCustomChunk && chunkDuration === preset.value
                          ? 'bg-[#6657E8] text-white shadow-xs'
                          : 'border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setIsCustomChunk(true)}
                    className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition ${
                      isCustomChunk
                        ? 'bg-[#6657E8] text-white shadow-xs'
                        : 'border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300'
                    }`}
                  >
                    Custom
                  </button>
                </div>

                {isCustomChunk && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      type="number"
                      min={5}
                      max={480}
                      step={5}
                      value={customChunkInput}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 5;
                        setCustomChunkInput(e.target.value);
                        setChunkDuration(val);
                        handleRegenerateAuto(startTime, endTime, val, breakBuffer);
                      }}
                      className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <span className="text-[11px] text-gray-500">minutes</span>
                  </div>
                )}
              </div>

              {/* Optional Break Buffer */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  Break Between Chunks
                </label>
                <div className="flex flex-wrap gap-1">
                  {PRESET_BREAKS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => {
                        setBreakBuffer(preset.value);
                        handleRegenerateAuto(startTime, endTime, chunkDuration, preset.value);
                      }}
                      className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition ${
                        breakBuffer === preset.value
                          ? 'bg-[#6657E8] text-white shadow-xs'
                          : 'border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Matrix Summary Line */}
            <div className="mt-4 flex flex-wrap items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-slate-800 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <Info className="h-3.5 w-3.5 text-[#6657E8]" />
                <span>
                  Auto-divided into <strong>{autoSlots.length} blocks</strong> ({formatDurationHuman(autoTotalMins)} active focus)
                </span>
              </div>
              <div className="flex items-center gap-2 mt-2 sm:mt-0">
                <button
                  type="button"
                  onClick={() => {
                    setTemplateSourceTab('auto');
                    setTemplateName(`Daily Focus (${chunkDuration}m chunks)`);
                    setIsSaveModalOpen(true);
                  }}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-300 dark:hover:bg-slate-800"
                >
                  <Save className="h-3.5 w-3.5 text-gray-500" />
                  <span>Save as Template</span>
                </button>
              </div>
            </div>
          </div>

          {/* Slots Matrix Preview & Inline Batch Assignment */}
          <div className="rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
            <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                  2. Preview & Batch Assign Slots
                </h2>
                <p className="text-xs text-gray-400">
                  Click quick-tags to label blocks or customize slot details directly before scheduling.
                </p>
              </div>

              <button
                type="button"
                disabled={isApplying || autoSlots.length === 0}
                onClick={() => handleApplyToSchedule(autoSlots)}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#6657E8] px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-[#5546d7] active:scale-[0.99] disabled:opacity-50 cursor-pointer"
              >
                <CalendarCheck className="h-4 w-4" />
                <span>{isApplying ? 'Scheduling...' : `Apply ${autoSlots.length} Slots to Schedule`}</span>
              </button>
            </div>

            {/* Slots List */}
            <div className="space-y-3">
              {autoSlots.map((slot, index) => (
                <div
                  key={slot.id || index}
                  className="group rounded-xl border border-gray-200/80 bg-gray-50/40 p-3.5 transition hover:border-[#6657E8]/40 hover:bg-white dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-[#6657E8]/40 dark:hover:bg-slate-800"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    {/* Time Badge & Title */}
                    <div className="flex flex-1 items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#6657E8]/10 text-xs font-bold text-[#6657E8] dark:bg-[#6657E8]/20 dark:text-[#A59DF7]">
                        #{index + 1}
                      </span>

                      <div className="flex items-center gap-1.5 shrink-0 rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:bg-slate-700 dark:text-gray-300">
                        <Clock className="h-3 w-3 text-gray-400" />
                        <span>{slot.startTime} – {slot.endTime}</span>
                      </div>

                      <input
                        type="text"
                        value={slot.title}
                        onChange={(e) => handleUpdateAutoSlot(index, { title: e.target.value })}
                        placeholder="Slot Title / Activity..."
                        className="flex-1 min-w-[160px] rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-900 focus:border-[#6657E8] focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    </div>

                    {/* Category & Priority Selectors */}
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={slot.categoryId || ''}
                        onChange={(e) => handleUpdateAutoSlot(index, { categoryId: e.target.value || undefined })}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300"
                      >
                        <option value="">Category (None)</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>

                      <select
                        value={slot.priority || 'medium'}
                        onChange={(e) => handleUpdateAutoSlot(index, { priority: e.target.value as Priority })}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300"
                      >
                        <option value="low">Low Priority</option>
                        <option value="medium">Medium Priority</option>
                        <option value="high">High Priority</option>
                      </select>
                    </div>
                  </div>

                  {/* Quick-Tag Chips */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pt-2 border-t border-gray-100 dark:border-slate-800/80">
                    <span className="flex items-center gap-1 text-[10px] font-medium text-gray-400">
                      <Tag className="h-2.5 w-2.5" />
                      Quick Preset:
                    </span>
                    {QUICK_TAG_SUGGESTIONS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleApplyQuickTag(index, tag)}
                        className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-600 hover:border-[#6657E8] hover:text-[#6657E8] dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300 dark:hover:border-[#A59DF7]"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Apply Action */}
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                disabled={isApplying || autoSlots.length === 0}
                onClick={() => handleApplyToSchedule(autoSlots)}
                className="flex items-center gap-2 rounded-xl bg-[#6657E8] px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#5546d7] active:scale-[0.99] disabled:opacity-50 cursor-pointer"
              >
                <CalendarCheck className="h-4 w-4" />
                <span>Apply All to Schedule ({autoSlots.length} Slots)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MANUAL BUILDER ("FREE WILL" MODE) */}
      {activeTab === 'manual' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                  Manual Timetable ("Free Will" Mode)
                </h2>
                <p className="text-xs text-gray-400">
                  Design bespoke, non-uniform slots (e.g. 08:15–09:05, 09:15–10:30, 11:00–13:00) with custom labels and notes.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddManualSlot}
                  className="flex items-center gap-1.5 rounded-xl border border-[#6657E8]/30 bg-[#6657E8]/10 px-3 py-1.5 text-xs font-semibold text-[#6657E8] hover:bg-[#6657E8]/20 dark:border-[#6657E8]/40 dark:text-[#A59DF7]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Custom Slot</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTemplateSourceTab('manual');
                    setTemplateName('My Custom Schedule');
                    setIsSaveModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-300 dark:hover:bg-slate-800"
                >
                  <Save className="h-3.5 w-3.5 text-gray-500" />
                  <span>Save Template</span>
                </button>
              </div>
            </div>

            {/* Total Duration Banner */}
            <div className="mt-4 flex items-center justify-between rounded-xl bg-gray-50 px-3.5 py-2 text-xs text-gray-600 dark:bg-slate-800/80 dark:text-gray-300">
              <span>
                Total Slots: <strong>{manualSlots.length}</strong>
              </span>
              <span>
                Total Duration: <strong>{formatDurationHuman(manualTotalMins)}</strong>
              </span>
            </div>

            {/* Slots List */}
            <div className="mt-4 space-y-3">
              {manualSlots.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center dark:border-slate-700">
                  <Clock className="mx-auto h-8 w-8 text-gray-400" />
                  <p className="mt-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
                    No custom slots created yet.
                  </p>
                  <p className="text-[11px] text-gray-400">
                    Add arbitrary time slots, lecture hours, or custom routines.
                  </p>
                  <button
                    type="button"
                    onClick={handleAddManualSlot}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#6657E8] px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add First Slot</span>
                  </button>
                </div>
              ) : (
                manualSlots.map((slot, index) => (
                  <div
                    key={slot.id}
                    className="rounded-xl border border-gray-200/90 bg-white p-3.5 shadow-xs transition hover:border-[#6657E8]/40 dark:border-slate-800 dark:bg-slate-800/50"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      {/* Reorder buttons + Times + Title */}
                      <div className="flex flex-1 items-center gap-2">
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => handleMoveManualSlot(index, 'up')}
                            className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-20 dark:hover:bg-slate-700"
                            title="Move Up"
                          >
                            <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </div>

                        {/* Start and End inputs */}
                        <div className="flex items-center gap-1">
                          <input
                            type="time"
                            value={slot.startTime}
                            onChange={(e) => handleUpdateManualSlot(slot.id, { startTime: e.target.value })}
                            className="w-24 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          />
                          <span className="text-xs text-gray-400">–</span>
                          <input
                            type="time"
                            value={slot.endTime}
                            onChange={(e) => handleUpdateManualSlot(slot.id, { endTime: e.target.value })}
                            className="w-24 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          />
                        </div>

                        {/* Title input */}
                        <input
                          type="text"
                          value={slot.title}
                          onChange={(e) => handleUpdateManualSlot(slot.id, { title: e.target.value })}
                          placeholder="Activity Title..."
                          className="flex-1 min-w-[160px] rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-900 focus:border-[#6657E8] focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                      </div>

                      {/* Category, Priority, and Delete */}
                      <div className="flex items-center gap-2">
                        <select
                          value={slot.categoryId || ''}
                          onChange={(e) =>
                            handleUpdateManualSlot(slot.id, {
                              categoryId: e.target.value || undefined,
                            })
                          }
                          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300"
                        >
                          <option value="">Category</option>
                          {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                        </select>

                        <select
                          value={slot.priority || 'medium'}
                          onChange={(e) =>
                            handleUpdateManualSlot(slot.id, {
                              priority: e.target.value as Priority,
                            })
                          }
                          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Med</option>
                          <option value="high">High</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => handleDeleteManualSlot(slot.id)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                          title="Delete slot"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Optional Notes / Location */}
                    <div className="mt-2.5 flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-slate-800">
                      <input
                        type="text"
                        value={slot.notes || ''}
                        onChange={(e) => handleUpdateManualSlot(slot.id, { notes: e.target.value })}
                        placeholder="Add notes, room/building, meeting link, or instructions (optional)..."
                        className="flex-1 rounded-lg border border-gray-200 bg-gray-50/50 px-2 py-1 text-[11px] text-gray-600 placeholder:text-gray-400 dark:border-slate-700 dark:bg-slate-800/80 dark:text-gray-300"
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Bottom Apply Action */}
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                disabled={isApplying || manualSlots.length === 0}
                onClick={() => handleApplyToSchedule(manualSlots)}
                className="flex items-center gap-2 rounded-xl bg-[#6657E8] px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#5546d7] active:scale-[0.99] disabled:opacity-50 cursor-pointer"
              >
                <CalendarCheck className="h-4 w-4" />
                <span>Apply Manual Schedule ({manualSlots.length} Slots)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SAVED TEMPLATES */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
            <div className="mb-4">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                Saved Timetable Templates
              </h2>
              <p className="text-xs text-gray-400">
                Save routines like "University Semester 1", "Workday Focus Schedule", or "Exam Week" and apply them to any date or week.
              </p>
            </div>

            {templates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center dark:border-slate-700">
                <FolderHeart className="mx-auto h-8 w-8 text-gray-400" />
                <p className="mt-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
                  No templates saved yet.
                </p>
                <p className="text-[11px] text-gray-400">
                  Generate slots in the Auto Chunk tab or assemble custom slots in the Free Will tab, then click "Save as Template".
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('auto')}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#6657E8] px-3 py-1.5 text-xs font-semibold text-white"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Go to Auto Generator</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {templates.map((tmpl) => {
                  const tmplTotalMins = calculateTotalDurationMinutes(tmpl.slots);
                  return (
                    <div
                      key={tmpl.id}
                      className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-xs transition hover:border-[#6657E8]/40 dark:border-slate-800 dark:bg-slate-800/60"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <CalendarRange className="h-4 w-4 text-[#6657E8] dark:text-[#A59DF7]" />
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                              {tmpl.name}
                            </h3>
                          </div>
                          <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-slate-700 dark:text-gray-300">
                            {tmpl.slots.length} blocks
                          </span>
                        </div>

                        {tmpl.description && (
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {tmpl.description}
                          </p>
                        )}

                        <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-400">
                          <Clock className="h-3 w-3" />
                          <span>Total: {formatDurationHuman(tmplTotalMins)}</span>
                        </div>

                        {/* Slot previews */}
                        <div className="mt-3 max-h-36 overflow-y-auto space-y-1.5 pr-1">
                          {tmpl.slots.slice(0, 4).map((slot, sIdx) => (
                            <div
                              key={slot.id || sIdx}
                              className="flex items-center justify-between rounded-md bg-gray-50 px-2 py-1 text-[11px] dark:bg-slate-750 dark:bg-slate-700/50"
                            >
                              <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[160px]">
                                {slot.title}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                {slot.startTime}–{slot.endTime}
                              </span>
                            </div>
                          ))}
                          {tmpl.slots.length > 4 && (
                            <p className="text-[10px] text-gray-400 text-center">
                              +{tmpl.slots.length - 4} more slots
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Card Actions */}
                      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => onDeleteTemplate(tmpl.id)}
                          className="flex items-center gap-1 text-[11px] font-medium text-rose-500 hover:text-rose-700"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Delete</span>
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleLoadTemplate(tmpl)}
                            className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-300 dark:hover:bg-slate-700"
                          >
                            <Copy className="h-3 w-3" />
                            <span>Load in Editor</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              handleApplyToSchedule(tmpl.slots);
                            }}
                            className="flex items-center gap-1 rounded-lg bg-[#6657E8] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#5546d7]"
                          >
                            <CalendarCheck className="h-3 w-3" />
                            <span>Apply</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Save Template Modal */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-[#1E293B]">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Save Timetable Template
              </h3>
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Template Name *
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. University Semester 1, Workday Focus"
                  className="w-full rounded-xl border border-gray-200 bg-white p-2.5 text-xs text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  placeholder="e.g. 4-hour morning deep work blocks with 10 min break"
                  rows={2}
                  className="w-full rounded-xl border border-gray-200 bg-white p-2.5 text-xs text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="text-[11px] text-gray-400">
                Will save{' '}
                <strong>
                  {templateSourceTab === 'auto' ? autoSlots.length : manualSlots.length} slots
                </strong>{' '}
                as a reusable template.
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                className="rounded-xl border border-gray-200 px-3.5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!templateName.trim()}
                onClick={handleSaveAsTemplate}
                className="rounded-xl bg-[#6657E8] px-4 py-2 text-xs font-bold text-white hover:bg-[#5546d7] disabled:opacity-50"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
