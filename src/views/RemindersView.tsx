import { useState, useMemo } from 'react';
import {
  Bell,
  Plus,
  Calendar,
  Clock,
  Search,
  CheckCircle2,
  AlertCircle,
  Repeat,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Trash2,
  Edit2,
  RotateCcw,
  Sparkles,
  LayoutList,
  CalendarDays,
  Tag,
  Hourglass,
} from 'lucide-react';
import {
  Category,
  NotificationMethod,
  Reminder,
  ReminderPriority,
  UserSettings,
} from '../types';
import {
  DEFAULT_REMINDER_CATEGORIES,
  getAvailableReminderCategories,
  getCategoryById,
} from '../utils/reminderCategories';
import {
  calculateSnooze,
  filterRemindersByTab,
  formatReadableReminderDate,
  formatTimeDisplay,
  getTodayDateString,
  getTomorrowDateString,
  isReminderOverdue,
  ReminderSortBy,
  ReminderTab,
  sortReminders,
} from '../utils/reminders';

interface RemindersViewProps {
  reminders: Reminder[];
  categories: Category[];
  settings?: UserSettings;
  onOpenNewReminder?: () => void;
  onOpenCreateReminder?: () => void;
  onEditReminder: (reminder: Reminder) => void;
  onDeleteReminder: (reminderId: string) => void;
  onCompleteReminder?: (reminder: Reminder) => void;
  onToggleComplete?: (reminderId: string) => void;
  onSnoozeReminder?: (reminder: Reminder, option: 10 | 30 | 60 | 'tomorrow') => void;
  onSnooze?: (reminderId: string, minutes: number) => void;
  onAddCategory?: (category: Category) => void;
}

export function RemindersView({
  reminders,
  categories,
  settings = {
    theme: 'light',
    timeFormat24h: true,
    startOfWeekMonday: true,
    defaultTaskDuration: 30,
    dailyFocusGoal: 5,
    celebratoryAnimations: true,
    timezone: 'UTC',
    defaultNotificationMethod: 'both',
  },
  onOpenNewReminder,
  onOpenCreateReminder,
  onEditReminder,
  onDeleteReminder,
  onCompleteReminder,
  onToggleComplete,
  onSnoozeReminder,
  onSnooze,
}: RemindersViewProps) {
  const openNew = onOpenNewReminder || onOpenCreateReminder || (() => {});
  const handleToggle = (r: Reminder) => {
    if (onCompleteReminder) onCompleteReminder(r);
    else if (onToggleComplete) onToggleComplete(r.id);
  };
  const handleSnooze = (r: Reminder, opt: 10 | 30 | 60 | 'tomorrow') => {
    if (onSnoozeReminder) {
      onSnoozeReminder(r, opt);
    } else if (onSnooze) {
      const minutes = opt === 'tomorrow' ? 1440 : opt;
      onSnooze(r.id, minutes);
    }
  };

  const [activeTab, setActiveTab] = useState<ReminderTab>('all');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [sortBy, setSortBy] = useState<ReminderSortBy>('date_asc');
  const [snoozeMenuOpenId, setSnoozeMenuOpenId] = useState<string | null>(null);

  // Calendar view navigation state
  const [calendarDate, setCalendarDate] = useState(() => new Date());

  const availableCategories = useMemo(
    () => getAvailableReminderCategories(categories),
    [categories]
  );

  const todayStr = getTodayDateString(settings.timezone);

  // Summary counts
  const summary = useMemo(() => {
    const total = reminders.length;
    const completed = reminders.filter((r) => r.completed).length;
    const overdue = reminders.filter((r) => !r.completed && isReminderOverdue(r)).length;
    const today = reminders.filter((r) => !r.completed && r.date === todayStr).length;
    const upcoming = reminders.filter((r) => !r.completed && r.date > todayStr).length;

    return { total, completed, overdue, today, upcoming };
  }, [reminders, todayStr]);

  // Tab filtered
  const tabFiltered = useMemo(() => {
    return filterRemindersByTab(reminders, activeTab, settings.timezone);
  }, [reminders, activeTab, settings.timezone]);

  // Search & attribute filters
  const finalReminders = useMemo(() => {
    const filtered = tabFiltered.filter((r) => {
      // Search query
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesTitle = r.title.toLowerCase().includes(query);
        const matchesDesc = r.description?.toLowerCase().includes(query);
        const cat = getCategoryById(availableCategories, r.categoryId);
        const matchesCat = cat.name.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDesc && !matchesCat) return false;
      }

      // Category filter
      if (selectedCategory !== 'all' && r.categoryId !== selectedCategory) {
        return false;
      }

      // Priority filter
      if (selectedPriority !== 'all' && r.priority !== selectedPriority) {
        return false;
      }

      return true;
    });

    return sortReminders(filtered, sortBy);
  }, [tabFiltered, search, selectedCategory, selectedPriority, sortBy, availableCategories]);

  // Calendar month days calculation
  const calendarMonthData = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0=Sun
    const totalDays = new Date(year, month + 1, 0).getDate();

    const days: Array<{ dateStr: string; dayNumber: number; isCurrentMonth: boolean }> = [];

    // Preceding padding days
    const prevMonthTotalDays = new Date(year, month, 0).getDate();
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthTotalDays - i;
      const prevMonth = month === 0 ? 12 : month;
      const prevYear = month === 0 ? year - 1 : year;
      const dateStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      days.push({ dateStr, dayNumber: dayNum, isCurrentMonth: false });
    }

    // Current month days
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ dateStr, dayNumber: d, isCurrentMonth: true });
    }

    // Trailing days to fill 35 or 42 grid cells
    const remaining = 35 - days.length > 0 ? 35 - days.length : 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const nextMonth = month === 11 ? 1 : month + 2;
      const nextYear = month === 11 ? year + 1 : year;
      const dateStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days.push({ dateStr, dayNumber: i, isCurrentMonth: false });
    }

    return days;
  }, [calendarDate]);

  return (
    <div className="space-y-6">
      {/* 1. Header with Title, Tagline & Top Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#6657E8]/10 text-[#6657E8] dark:bg-[#6657E8]/20 dark:text-[#A59DF7]">
              <Bell className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
              Reminders
            </h1>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Never miss an important event, bill, or scheduled commitment.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* List vs Calendar View Toggle */}
          <div className="flex items-center rounded-xl border border-gray-200/90 bg-white p-1 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-label="List view"
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-[#6657E8] text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              <LayoutList className="h-3.5 w-3.5" />
              <span>List</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              aria-label="Calendar view"
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                viewMode === 'calendar'
                  ? 'bg-[#6657E8] text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              <span>Calendar</span>
            </button>
          </div>

          {/* New Reminder Button */}
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-1.5 rounded-xl bg-[#6657E8] px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#5748d6] transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>New Reminder</span>
          </button>
        </div>
      </div>

      {/* 2. Four Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Today's Reminders */}
        <div
          onClick={() => setActiveTab('today')}
          className={`rounded-2xl border p-4 transition shadow-xs cursor-pointer ${
            activeTab === 'today'
              ? 'border-[#6657E8] bg-[#6657E8]/5 ring-1 ring-[#6657E8]/30 dark:bg-[#6657E8]/10'
              : 'border-purple-100/90 bg-white hover:border-[#6657E8]/40 dark:border-slate-800 dark:bg-[#1E293B]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
              Today's Reminders
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#6657E8]/10 text-[#6657E8] dark:bg-[#6657E8]/20 dark:text-[#A59DF7]">
              <Clock className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              {summary.today}
            </span>
            <span className="text-[10px] text-gray-400">due today</span>
          </div>
        </div>

        {/* Upcoming Reminders */}
        <div
          onClick={() => setActiveTab('upcoming')}
          className={`rounded-2xl border p-4 transition shadow-xs cursor-pointer ${
            activeTab === 'upcoming'
              ? 'border-[#6657E8] bg-[#6657E8]/5 ring-1 ring-[#6657E8]/30 dark:bg-[#6657E8]/10'
              : 'border-purple-100/90 bg-white hover:border-[#6657E8]/40 dark:border-slate-800 dark:bg-[#1E293B]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
              Upcoming
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <Calendar className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              {summary.upcoming}
            </span>
            <span className="text-[10px] text-gray-400">future items</span>
          </div>
        </div>

        {/* Overdue Reminders */}
        <div
          onClick={() => setActiveTab('overdue')}
          className={`rounded-2xl border p-4 transition shadow-xs cursor-pointer ${
            activeTab === 'overdue'
              ? 'border-rose-400 bg-rose-50/70 ring-1 ring-rose-400/40 dark:border-rose-800 dark:bg-rose-950/30'
              : summary.overdue > 0
              ? 'border-rose-200 bg-rose-50/40 hover:border-rose-300 dark:border-rose-900/60 dark:bg-rose-950/20'
              : 'border-purple-100/90 bg-white hover:border-gray-200 dark:border-slate-800 dark:bg-[#1E293B]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
              Overdue
            </span>
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                summary.overdue > 0
                  ? 'bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400'
                  : 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-gray-400'
              }`}
            >
              <AlertCircle className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold tracking-tight ${
                summary.overdue > 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-gray-900 dark:text-white'
              }`}
            >
              {summary.overdue}
            </span>
            <span className="text-[10px] text-gray-400">attention needed</span>
          </div>
        </div>

        {/* Completed Reminders */}
        <div
          onClick={() => setActiveTab('completed')}
          className={`rounded-2xl border p-4 transition shadow-xs cursor-pointer ${
            activeTab === 'completed'
              ? 'border-emerald-400 bg-emerald-50/60 ring-1 ring-emerald-400/30 dark:border-emerald-800 dark:bg-emerald-950/30'
              : 'border-purple-100/90 bg-white hover:border-emerald-200 dark:border-slate-800 dark:bg-[#1E293B]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
              Completed
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              {summary.completed}
            </span>
            <span className="text-[10px] text-gray-400">fulfilled</span>
          </div>
        </div>
      </div>

      {/* 3. Seven Filter Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs border-b border-gray-200/80 dark:border-slate-800 scrollbar-none">
        {[
          { id: 'all', label: 'All Reminders' },
          { id: 'today', label: 'Today' },
          { id: 'tomorrow', label: 'Tomorrow' },
          { id: 'this_week', label: 'This Week' },
          { id: 'upcoming', label: 'Upcoming' },
          { id: 'overdue', label: 'Overdue', badge: summary.overdue },
          { id: 'completed', label: 'Completed' },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as ReminderTab)}
              className={`flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 font-medium transition cursor-pointer border-b-2 -mb-px ${
                isActive
                  ? 'border-[#6657E8] text-[#6657E8] font-bold dark:border-[#A59DF7] dark:text-[#A59DF7]'
                  : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              <span>{tab.label}</span>
              {Boolean(tab.badge && tab.badge > 0) && (
                <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 4. Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reminders by title, notes, or category..."
            className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3.5 py-2 text-xs text-gray-900 focus:border-[#6657E8] focus:ring-1 focus:ring-[#6657E8] dark:border-slate-800 dark:bg-[#1E293B] dark:text-white"
          />
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            aria-label="Filter by category"
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 focus:border-[#6657E8] dark:border-slate-800 dark:bg-[#1E293B] dark:text-gray-200 cursor-pointer"
          >
            <option value="all">All Categories</option>
            {availableCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Priority Filter */}
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            aria-label="Filter by priority"
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 focus:border-[#6657E8] dark:border-slate-800 dark:bg-[#1E293B] dark:text-gray-200 cursor-pointer"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as ReminderSortBy)}
            aria-label="Sort reminders"
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 focus:border-[#6657E8] dark:border-slate-800 dark:bg-[#1E293B] dark:text-gray-200 cursor-pointer"
          >
            <option value="date_asc">Date (Earliest First)</option>
            <option value="date_desc">Date (Latest First)</option>
            <option value="priority_desc">Priority (Highest First)</option>
            <option value="priority_asc">Priority (Lowest First)</option>
            <option value="title_asc">Title (A-Z)</option>
          </select>
        </div>
      </div>

      {/* 5. View Content: List View or Calendar View */}
      {viewMode === 'list' ? (
        <div className="space-y-3">
          {finalReminders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white/50 p-12 text-center dark:border-slate-800 dark:bg-[#1E293B]/50">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-[#6657E8] dark:bg-slate-800 dark:text-[#A59DF7]">
                <Bell className="h-6 w-6 opacity-60" />
              </div>
              <h3 className="mt-3 text-sm font-bold text-gray-900 dark:text-white">
                {search.trim()
                  ? 'No matching reminders found'
                  : activeTab === 'overdue'
                  ? 'No overdue reminders'
                  : activeTab === 'today'
                  ? 'No reminders scheduled for today'
                  : activeTab === 'completed'
                  ? 'No completed reminders yet'
                  : 'No reminders in this view'}
              </h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                {search.trim()
                  ? 'Try adjusting your search query or filters.'
                  : 'Stay organized and prompt by setting reminders for tasks, bills, and events.'}
              </p>
              {!search.trim() && (
                <button
                  type="button"
                  onClick={openNew}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#6657E8] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#5748d6] cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create Reminder</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {finalReminders.map((reminder) => {
                const category = getCategoryById(availableCategories, reminder.categoryId);
                const isOverdue = !reminder.completed && isReminderOverdue(reminder);

                return (
                  <div
                    key={reminder.id}
                    className={`group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-4 transition shadow-xs ${
                      reminder.completed
                        ? 'border-emerald-200/60 bg-emerald-50/20 dark:border-emerald-950/40 dark:bg-emerald-950/10'
                        : isOverdue
                        ? 'border-rose-300 bg-white ring-1 ring-rose-300/40 dark:border-rose-800/80 dark:bg-[#1E293B]'
                        : 'border-purple-100/90 bg-white hover:border-[#6657E8]/40 dark:border-slate-800 dark:bg-[#1E293B]'
                    }`}
                  >
                    {/* Left: Complete Checkbox + Title + Details */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => handleToggle(reminder)}
                        aria-label={
                          reminder.completed
                            ? `Mark "${reminder.title}" as incomplete`
                            : `Mark "${reminder.title}" as completed`
                        }
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border transition cursor-pointer ${
                          reminder.completed
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'border-gray-300 bg-white hover:border-[#6657E8] dark:border-slate-600 dark:bg-slate-800'
                        }`}
                      >
                        {reminder.completed && <CheckCircle2 className="h-3.5 w-3.5" />}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4
                            className={`text-sm font-semibold truncate ${
                              reminder.completed
                                ? 'line-through text-gray-400 dark:text-gray-500'
                                : 'text-gray-900 dark:text-white'
                            }`}
                          >
                            {reminder.title}
                          </h4>

                          {/* Overdue Badge */}
                          {isOverdue && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                              <AlertCircle className="h-3 w-3" /> Overdue
                            </span>
                          )}

                          {/* Priority Pill */}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${
                              reminder.priority === 'urgent'
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                                : reminder.priority === 'high'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                                : reminder.priority === 'medium'
                                ? 'bg-[#6657E8]/10 text-[#6657E8] dark:bg-[#6657E8]/25 dark:text-[#A59DF7]'
                                : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-400'
                            }`}
                          >
                            {reminder.priority}
                          </span>

                          {/* Category Badge */}
                          <span
                            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium"
                            style={{
                              backgroundColor: `${category.color}15`,
                              color: category.color,
                            }}
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: category.color }}
                            />
                            {category.name}
                          </span>
                        </div>

                        {/* Description */}
                        {reminder.description && (
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                            {reminder.description}
                          </p>
                        )}

                        {/* Meta: Date, Time, Repeat, Delivery Method */}
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 text-gray-400" />
                            <span>{formatReadableReminderDate(reminder.date, settings.timezone)}</span>
                          </span>

                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-gray-400" />
                            <span>{formatTimeDisplay(reminder.time, settings.timeFormat24h)}</span>
                          </span>

                          {reminder.repeat !== 'never' && (
                            <span className="inline-flex items-center gap-1 text-[#6657E8] dark:text-[#A59DF7] font-medium">
                              <Repeat className="h-3 w-3" />
                              <span className="capitalize">{reminder.repeat}</span>
                            </span>
                          )}

                          <span className="inline-flex items-center gap-1 text-[#6657E8]/80 dark:text-[#A59DF7]" title="In-App Notification Bell">
                            <Bell className="h-3 w-3" />
                          </span>

                          {reminder.snoozedUntil && (
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 text-[10.5px]">
                              <Hourglass className="h-3 w-3" />
                              <span>
                                Snoozed until{' '}
                                {new Date(reminder.snoozedUntil).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions (Snooze, Edit, Delete) */}
                    <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                      {/* Snooze Dropdown */}
                      {!reminder.completed && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() =>
                              setSnoozeMenuOpenId((prev) =>
                                prev === reminder.id ? null : reminder.id
                              )
                            }
                            aria-label="Snooze options"
                            className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-300 cursor-pointer"
                          >
                            <Hourglass className="h-3 w-3 text-amber-500" />
                            <span>Snooze</span>
                          </button>

                          {snoozeMenuOpenId === reminder.id && (
                            <div className="absolute right-0 top-8 z-30 w-36 rounded-xl border border-purple-100 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-[#1E293B]">
                              <button
                                type="button"
                                onClick={() => {
                                  handleSnooze(reminder, 10);
                                  setSnoozeMenuOpenId(null);
                                }}
                                className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-gray-700 hover:bg-purple-50 hover:text-[#6657E8] dark:text-gray-300 dark:hover:bg-slate-800"
                              >
                                10 minutes
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleSnooze(reminder, 30);
                                  setSnoozeMenuOpenId(null);
                                }}
                                className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-gray-700 hover:bg-purple-50 hover:text-[#6657E8] dark:text-gray-300 dark:hover:bg-slate-800"
                              >
                                30 minutes
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleSnooze(reminder, 60);
                                  setSnoozeMenuOpenId(null);
                                }}
                                className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-gray-700 hover:bg-purple-50 hover:text-[#6657E8] dark:text-gray-300 dark:hover:bg-slate-800"
                              >
                                1 hour
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleSnooze(reminder, 'tomorrow');
                                  setSnoozeMenuOpenId(null);
                                }}
                                className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-gray-700 hover:bg-purple-50 hover:text-[#6657E8] dark:text-gray-300 dark:hover:bg-slate-800"
                              >
                                Tomorrow 9:00 AM
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Edit Button */}
                      <button
                        type="button"
                        onClick={() => onEditReminder(reminder)}
                        aria-label={`Edit reminder "${reminder.title}"`}
                        className="rounded-xl border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 hover:text-[#6657E8] dark:border-slate-700 dark:text-gray-400 dark:hover:bg-slate-800 cursor-pointer"
                        title="Edit"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => onDeleteReminder(reminder.id)}
                        aria-label={`Delete reminder "${reminder.title}"`}
                        className="rounded-xl border border-gray-200 p-1.5 text-gray-500 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-700 dark:text-gray-400 dark:hover:bg-rose-950/30 cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Calendar View */
        <div className="rounded-2xl border border-purple-100/90 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#1E293B]">
          {/* Calendar Month Navigation */}
          <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
              {calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h3>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setCalendarDate(
                    new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1)
                  )
                }
                aria-label="Previous month"
                className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setCalendarDate(new Date())}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-[#6657E8] hover:bg-[#6657E8]/10 dark:text-[#A59DF7] cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() =>
                  setCalendarDate(
                    new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1)
                  )
                }
                aria-label="Next month"
                className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Days of Week Header */}
          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-gray-400">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Month Day Cells */}
          <div className="grid grid-cols-7 gap-1.5 mt-1">
            {calendarMonthData.map((cell) => {
              const cellReminders = reminders.filter((r) => r.date === cell.dateStr);
              const isToday = cell.dateStr === todayStr;

              return (
                <div
                  key={cell.dateStr}
                  onClick={() => {
                    if (cellReminders.length > 0) {
                      setSearch(cell.dateStr);
                      setViewMode('list');
                    }
                  }}
                  className={`min-h-[72px] sm:min-h-[85px] rounded-xl border p-1.5 flex flex-col justify-between transition cursor-pointer ${
                    isToday
                      ? 'border-[#6657E8] bg-[#6657E8]/5 dark:bg-[#6657E8]/15'
                      : cell.isCurrentMonth
                      ? 'border-gray-100 bg-white hover:border-purple-200 dark:border-slate-800 dark:bg-slate-900/40'
                      : 'border-transparent bg-gray-50/50 opacity-40 dark:bg-slate-900/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${
                        isToday
                          ? 'bg-[#6657E8] text-white font-bold'
                          : 'text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {cell.dayNumber}
                    </span>
                    {cellReminders.length > 0 && (
                      <span className="rounded-full bg-[#6657E8]/15 px-1.5 py-0.2 text-[9px] font-bold text-[#6657E8] dark:bg-[#6657E8]/30 dark:text-[#A59DF7]">
                        {cellReminders.length}
                      </span>
                    )}
                  </div>

                  {/* Reminder pills in cell */}
                  <div className="space-y-0.5 mt-1 overflow-hidden">
                    {cellReminders.slice(0, 2).map((r) => (
                      <div
                        key={r.id}
                        className={`truncate rounded px-1 py-0.5 text-[9.5px] font-medium leading-none ${
                          r.completed
                            ? 'line-through text-gray-400 bg-gray-100 dark:bg-slate-800'
                            : isReminderOverdue(r)
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                            : 'bg-purple-50 text-[#6657E8] dark:bg-[#6657E8]/20 dark:text-[#A59DF7]'
                        }`}
                      >
                        {formatTimeDisplay(r.time, settings.timeFormat24h)} {r.title}
                      </div>
                    ))}
                    {cellReminders.length > 2 && (
                      <span className="text-[9px] text-gray-400 pl-1 block">
                        +{cellReminders.length - 2} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
