import { useState, useMemo } from 'react';
import {
  Sparkles,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Copy,
  Check,
  Download,
  Calendar,
  Target,
  Flame,
  Clock,
  RotateCcw,
  Zap,
} from 'lucide-react';
import { Category, Habit, Task, WeeklyReview } from '../types';
import {
  calculateWeeklyMetrics,
  getWeekInfo,
  requestAIWeeklyReview,
  WeekInfo,
} from '../utils/weeklyReview';

interface WeeklyReviewViewProps {
  tasks: Task[];
  categories: Category[];
  habits: Habit[];
  savedReviews: Record<string, WeeklyReview>;
  onSaveReview: (review: WeeklyReview) => void;
  onNavigateToCalendar?: () => void;
}

export function WeeklyReviewView({
  tasks,
  categories,
  habits,
  savedReviews,
  onSaveReview,
  onNavigateToCalendar,
}: WeeklyReviewViewProps) {
  // Offset in weeks relative to today (0 = current week, -1 = last week, etc.)
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [reflectionInput, setReflectionInput] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Compute reference week info based on weekOffset
  const currentWeekInfo: WeekInfo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return getWeekInfo(d, true);
  }, [weekOffset]);

  // Current review for this week, if already generated
  const activeReview: WeeklyReview | undefined = savedReviews[currentWeekInfo.weekKey];

  // Calculate live weekly metrics from current state
  const liveMetrics = useMemo(() => {
    return calculateWeeklyMetrics(tasks, categories, habits, currentWeekInfo.days);
  }, [tasks, categories, habits, currentWeekInfo.days]);

  // Handle Generate / Regenerate
  const handleGenerateReview = async () => {
    setIsGenerating(true);
    try {
      const review = await requestAIWeeklyReview(
        tasks,
        categories,
        habits,
        currentWeekInfo,
        reflectionInput.trim() || undefined
      );
      onSaveReview(review);
    } catch (err) {
      console.error('Failed to generate review', err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Copy review to clipboard
  const handleCopyReview = async () => {
    if (!activeReview) return;
    const text = `# OmBhi AI Weekly Review — ${activeReview.weekLabel}
Status: ${activeReview.momentumScore} (${activeReview.completionRate}% completion)

${activeReview.headline}

## What Worked
${activeReview.whatWorked.map((w) => `- ${w}`).join('\n')}

## What Was Missed
${activeReview.whatWasMissed.map((m) => `- ${m}`).join('\n')}

## What to Change Next Week
${activeReview.whatToChange.map((c) => `- ${c}`).join('\n')}

## Next Week Focus
${activeReview.focusNextWeek}

${activeReview.encouragement}
`;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn('Clipboard write failed:', e);
    }
  };

  // Export as Markdown file
  const handleExportMarkdown = () => {
    if (!activeReview) return;
    const content = `# OmBhi AI Weekly Review — ${activeReview.weekLabel}
Generated: ${new Date(activeReview.createdAt).toLocaleString()}
Engine: ${activeReview.source === 'ai' ? 'Gemini 3.8 Flash' : 'OmBhi Intelligence'}

${activeReview.headline}

### Momentum: ${activeReview.momentumScore}
- Total Planned Tasks: ${activeReview.totalPlanned}
- Completed: ${activeReview.completedCount} (${activeReview.completionRate}%)
- Skipped: ${activeReview.skippedCount}
- Failed: ${activeReview.failedCount}

### 1. What Worked
${activeReview.whatWorked.map((w) => `- ${w}`).join('\n')}

### 2. What Was Missed
${activeReview.whatWasMissed.map((m) => `- ${m}`).join('\n')}

### 3. What to Change Next Week
${activeReview.whatToChange.map((c) => `- ${c}`).join('\n')}

### Focus for Next Week
${activeReview.focusNextWeek}

> ${activeReview.encouragement}
`;

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OmBhi_Review_${activeReview.weekKey}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isCurrentWeek = weekOffset === 0;
  const isLastWeek = weekOffset === -1;

  return (
    <div className="space-y-6">
      {/* Top Header & Navigation Banner */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-gray-200/90 bg-white p-6 shadow-xs sm:flex-row sm:items-center dark:border-slate-800 dark:bg-[#1E293B]">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#6657E8]/10 text-[#6657E8] dark:bg-[#6657E8]/20 dark:text-[#A59DF7]">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="text-xs font-bold tracking-wider text-[#6657E8] uppercase dark:text-[#A59DF7]">
              AI Weekly Review
            </span>
          </div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            {currentWeekInfo.weekLabel}
          </h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            A meaningful summary of what worked, what you missed, and what to change next week.
          </p>
        </div>

        {/* Week navigation controls */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50 p-0.5 dark:border-slate-700 dark:bg-slate-800/80">
            <button
              type="button"
              onClick={() => setWeekOffset((prev) => prev - 1)}
              aria-label="Previous week"
              className="rounded-lg p-1.5 text-gray-500 hover:bg-white hover:text-gray-900 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-white transition"
              title="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                isCurrentWeek
                  ? 'bg-white text-[#6657E8] shadow-xs dark:bg-slate-900 dark:text-[#A59DF7]'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
              }`}
            >
              This Week
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset(-1)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                isLastWeek
                  ? 'bg-white text-[#6657E8] shadow-xs dark:bg-slate-900 dark:text-[#A59DF7]'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
              }`}
            >
              Last Week
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset((prev) => prev + 1)}
              aria-label="Next week"
              className="rounded-lg p-1.5 text-gray-500 hover:bg-white hover:text-gray-900 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-white transition"
              title="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Action buttons */}
          {activeReview && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopyReview}
                aria-label="Copy weekly review summary"
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700 transition"
                title="Copy to clipboard"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportMarkdown}
                aria-label="Export review as Markdown"
                className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700 transition"
                title="Download Markdown"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Export</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerateReview}
            disabled={isGenerating}
            aria-label="Generate AI weekly review"
            className="flex items-center gap-2 rounded-xl bg-[#6657E8] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#5544DB] active:scale-[0.98] disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Analyzing week...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                <span>{activeReview ? 'Regenerate Review' : 'Generate Review'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Review Presentation or Empty State */}
      {activeReview ? (
        <div className="space-y-6">
          {/* Executive Headline Hero Card */}
          <div className="relative overflow-hidden rounded-2xl border border-indigo-100/80 bg-gradient-to-br from-white via-indigo-50/20 to-violet-50/30 p-6 shadow-xs dark:border-slate-800 dark:from-[#1E293B] dark:via-[#1E293B] dark:to-[#172033]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-100/60 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#6657E8]/10 px-3 py-1 text-xs font-bold text-[#6657E8] dark:bg-[#6657E8]/20 dark:text-[#A59DF7]">
                  {activeReview.momentumScore}
                </span>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {activeReview.source === 'ai' ? '✨ Gemini 3.8 Flash Coach' : '⚡ OmBhi Intelligence'}
                </span>
              </div>

              <span className="text-xs font-semibold text-gray-400">
                Generated {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' }).format(new Date(activeReview.createdAt))}
              </span>
            </div>

            {/* The Main Punchline Quote */}
            <div className="mt-5">
              <blockquote className="text-lg sm:text-xl font-bold tracking-tight text-[#172033] dark:text-white leading-relaxed">
                “{activeReview.headline}”
              </blockquote>
            </div>

            {/* Quick KPI Strip */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 pt-4 border-t border-gray-100 dark:border-slate-800/80">
              <div className="rounded-xl bg-white/80 p-3.5 border border-gray-100 dark:bg-slate-800/60 dark:border-slate-700/60">
                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider dark:text-gray-400">
                  Planned Tasks
                </div>
                <div className="mt-1 text-2xl font-black text-gray-900 tabular-nums dark:text-white">
                  {activeReview.totalPlanned}
                </div>
              </div>

              <div className="rounded-xl bg-white/80 p-3.5 border border-gray-100 dark:bg-slate-800/60 dark:border-slate-700/60">
                <div className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider dark:text-emerald-400 flex items-center justify-between">
                  <span>Completed</span>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </div>
                <div className="mt-1 text-2xl font-black text-emerald-600 tabular-nums dark:text-emerald-400">
                  {activeReview.completedCount}
                </div>
              </div>

              <div className="rounded-xl bg-white/80 p-3.5 border border-gray-100 dark:bg-slate-800/60 dark:border-slate-700/60">
                <div className="text-[11px] font-semibold text-amber-600 uppercase tracking-wider dark:text-amber-400 flex items-center justify-between">
                  <span>Skipped / Missed</span>
                  <Clock className="h-3.5 w-3.5" />
                </div>
                <div className="mt-1 text-2xl font-black text-amber-600 tabular-nums dark:text-amber-400">
                  {activeReview.skippedCount + activeReview.failedCount}
                </div>
              </div>

              <div className="rounded-xl bg-white/80 p-3.5 border border-gray-100 dark:bg-slate-800/60 dark:border-slate-700/60">
                <div className="text-[11px] font-semibold text-[#6657E8] uppercase tracking-wider dark:text-[#A59DF7] flex items-center justify-between">
                  <span>Completion Rate</span>
                  <Target className="h-3.5 w-3.5" />
                </div>
                <div className="mt-1 text-2xl font-black text-[#6657E8] tabular-nums dark:text-[#A59DF7]">
                  {activeReview.completionRate}%
                </div>
              </div>
            </div>
          </div>

          {/* Daily Momentum Rhythm Bar Chart */}
          <div className="rounded-2xl border border-gray-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Flame className="h-4 w-4 text-amber-500" />
                  <span>Daily Execution Pattern</span>
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Breakdown across Monday through Sunday. Notice where completion was highest.
                </p>
              </div>

              {activeReview.strongestDays.length > 0 && (
                <span className="hidden sm:inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  🌟 Strongest: {activeReview.strongestDays.join(', ')}
                </span>
              )}
            </div>

            <div className="grid grid-cols-7 gap-2 pt-2">
              {liveMetrics.dayStats.map((d) => {
                const isStrongest = activeReview.strongestDays.includes(d.dayName);
                const isToughest = activeReview.toughestDays.includes(d.dayName) && !isStrongest;

                return (
                  <div
                    key={d.date}
                    className={`flex flex-col items-center rounded-xl p-3 border transition-all ${
                      isStrongest
                        ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-800/60 dark:bg-emerald-950/20'
                        : isToughest
                        ? 'border-amber-200 bg-amber-50/40 dark:border-amber-800/60 dark:bg-amber-950/20'
                        : 'border-gray-100 bg-gray-50/60 dark:border-slate-800 dark:bg-slate-800/40'
                    }`}
                  >
                    <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300">
                      {d.shortName}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {d.date.slice(8)}
                    </span>

                    {/* Rate pill */}
                    <div className="my-2 flex h-14 w-full flex-col justify-end items-center">
                      <div
                        className={`w-4 rounded-t-md transition-all ${
                          d.rate >= 80
                            ? 'bg-emerald-500'
                            : d.rate >= 50
                            ? 'bg-[#6657E8]'
                            : d.total > 0
                            ? 'bg-amber-500'
                            : 'bg-gray-200 dark:bg-slate-700'
                        }`}
                        style={{ height: `${Math.max(8, d.rate)}%` }}
                      />
                    </div>

                    <span className="text-xs font-bold text-gray-900 dark:text-white tabular-nums">
                      {d.total > 0 ? `${d.rate}%` : '—'}
                    </span>
                    <span className="text-[10px] text-gray-400 tabular-nums">
                      {d.completed}/{d.total}
                    </span>

                    {isStrongest && (
                      <span className="mt-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                        Peak
                      </span>
                    )}
                    {isToughest && (
                      <span className="mt-1 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                        Friction
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* The 3 Core Pillars */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Pillar 1: What Worked Well */}
            <div className="rounded-2xl border border-emerald-200/90 bg-emerald-50/30 p-6 shadow-xs dark:border-emerald-900/60 dark:bg-emerald-950/15">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-bold tracking-tight">What Worked Well</h3>
              </div>
              <p className="mt-1 text-xs text-emerald-900/70 dark:text-emerald-300/70">
                Wins, strengths, and habits that compounded in your favor.
              </p>

              <ul className="mt-4 space-y-3">
                {activeReview.whatWorked.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs text-gray-800 dark:text-gray-200 leading-relaxed">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Pillar 2: What You Missed */}
            <div className="rounded-2xl border border-amber-200/90 bg-amber-50/30 p-6 shadow-xs dark:border-amber-900/60 dark:bg-amber-950/15">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-bold tracking-tight">What Was Missed</h3>
              </div>
              <p className="mt-1 text-xs text-amber-900/70 dark:text-amber-300/70">
                Objective friction points, skipped sessions, or energy dips.
              </p>

              <ul className="mt-4 space-y-3">
                {activeReview.whatWasMissed.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs text-gray-800 dark:text-gray-200 leading-relaxed">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Pillar 3: What to Change Next Week */}
            <div className="rounded-2xl border border-indigo-200/90 bg-indigo-50/30 p-6 shadow-xs dark:border-indigo-900/60 dark:bg-indigo-950/15">
              <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-300">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                  <Zap className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-bold tracking-tight">What to Change Next Week</h3>
              </div>
              <p className="mt-1 text-xs text-indigo-900/70 dark:text-indigo-300/70">
                Actionable shifts in scheduling, volume, and pacing.
              </p>

              <ul className="mt-4 space-y-3">
                {activeReview.whatToChange.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs text-gray-800 dark:text-gray-200 leading-relaxed">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6657E8]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Focal Anchor Card */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-gray-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#6657E8] text-white shadow-xs">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6657E8] dark:text-[#A59DF7]">
                  Primary Focal Priority for Next Week
                </span>
                <p className="mt-0.5 text-base font-bold text-gray-900 dark:text-white">
                  {activeReview.focusNextWeek}
                </p>
                <p className="mt-1 text-xs italic text-gray-500 dark:text-gray-400">
                  “{activeReview.encouragement}”
                </p>
              </div>
            </div>

            {onNavigateToCalendar && (
              <button
                type="button"
                onClick={onNavigateToCalendar}
                className="flex items-center gap-1.5 shrink-0 rounded-xl bg-gray-100 px-4 py-2.5 text-xs font-semibold text-gray-800 hover:bg-gray-200 dark:bg-slate-800 dark:text-gray-200 dark:hover:bg-slate-700 transition"
              >
                <Calendar className="h-4 w-4" />
                <span>Open Next Week in Calendar</span>
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </button>
            )}
          </div>

          {/* Personal Reflection & Refinement Box */}
          <div className="rounded-2xl border border-gray-200/90 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Personal Context & Reflection Notes
            </h4>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Add any unique factors (e.g. exams, travel, illness) to regenerate an even more customized review.
            </p>

            <div className="mt-3 flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={reflectionInput}
                onChange={(e) => setReflectionInput(e.target.value)}
                placeholder="e.g., Had heavy university midterm exams on Thursday; felt tired on Friday."
                className="flex-1 rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-xs text-gray-900 placeholder-gray-400 focus:border-[#6657E8] focus:bg-white focus:outline-hidden dark:border-slate-700 dark:bg-slate-800/80 dark:text-white dark:placeholder-gray-500"
              />

              <button
                type="button"
                onClick={handleGenerateReview}
                disabled={isGenerating}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#6657E8]/10 px-4 py-2.5 text-xs font-semibold text-[#6657E8] hover:bg-[#6657E8]/20 dark:bg-[#6657E8]/20 dark:text-[#A59DF7] dark:hover:bg-[#6657E8]/30 transition disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Update with Notes</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Empty / Invitation State */
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-[#6657E8] dark:bg-slate-800 dark:text-[#A59DF7]">
            <Sparkles className="h-7 w-7" />
          </div>

          <h3 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">
            AI Weekly Review Ready to Generate
          </h3>
          <p className="mx-auto mt-2 max-w-md text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            OmBhi has tracked <span className="font-semibold text-gray-800 dark:text-gray-200">{liveMetrics.totalPlanned} planned tasks</span> ({liveMetrics.completed} completed, {liveMetrics.skipped} skipped) for {currentWeekInfo.weekLabel}. Generate your personalized coach's synthesis of what worked, what you missed, and what to change.
          </p>

          {/* Quick Metrics preview */}
          <div className="mx-auto mt-6 max-w-lg grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 dark:border-slate-700/60 dark:bg-slate-800/60">
              <div className="text-[10px] font-semibold text-gray-400 uppercase">Planned</div>
              <div className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{liveMetrics.totalPlanned}</div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 dark:border-slate-700/60 dark:bg-slate-800/60">
              <div className="text-[10px] font-semibold text-emerald-600 uppercase">Completed</div>
              <div className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400">{liveMetrics.completed}</div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 dark:border-slate-700/60 dark:bg-slate-800/60">
              <div className="text-[10px] font-semibold text-[#6657E8] uppercase">Rate</div>
              <div className="mt-1 text-xl font-bold text-[#6657E8] dark:text-[#A59DF7]">{liveMetrics.completionRate}%</div>
            </div>
          </div>

          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={handleGenerateReview}
              disabled={isGenerating}
              className="flex items-center gap-2 rounded-xl bg-[#6657E8] px-6 py-3 text-xs font-semibold text-white shadow-xs transition hover:bg-[#5544DB] active:scale-[0.98] disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Synthesizing Review...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Generate {isCurrentWeek ? "This Week's Review" : "Weekly Review"}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
