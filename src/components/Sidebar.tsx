import {
  LayoutDashboard,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ListTodo,
  Flame,
  BarChart3,
  Tags,
  Settings,
  Plus,
  Sun,
  Moon,
  Sparkles,
  Compass,
  LogOut,
  Bell,
} from 'lucide-react';
import { AppView, UserSettings } from '../types';

interface SidebarProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  onQuickAdd: () => void;
  onAIQuickAdd?: () => void;
  settings: UserSettings;
  onToggleTheme: () => void;
  user?: {
    displayName?: string | null;
    email?: string | null;
    photoURL?: string | null;
  } | null;
  onSignOut?: () => void;
  unreadNotificationsCount?: number;
}

export function Sidebar({
  currentView,
  onNavigate,
  onQuickAdd,
  onAIQuickAdd,
  settings,
  onToggleTheme,
  user,
  onSignOut,
  unreadNotificationsCount = 0,
}: SidebarProps) {
  const navItems: { id: AppView; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'myday', label: 'My Day', icon: CalendarCheck },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'timetable', label: 'Timetable', icon: CalendarRange },
    { id: 'alltasks', label: 'All Tasks', icon: ListTodo },
    { id: 'reminders', label: 'Reminders', icon: Bell, badge: unreadNotificationsCount },
    { id: 'habits', label: 'Habits', icon: Flame },
    { id: 'coach', label: 'AI Coach', icon: Compass },
    { id: 'review', label: 'AI Review', icon: Sparkles },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'categories', label: 'Categories', icon: Tags },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside
      aria-label="Sidebar Navigation"
      className="hidden w-64 shrink-0 flex-col border-r border-purple-100/80 bg-white/95 select-none md:flex dark:border-slate-800 dark:bg-[#1E293B]"
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between border-b border-purple-100/70 p-5 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <img
            src="/ombhi-icon.png"
            alt="OmBhi Logo"
            className="h-9 w-9 shrink-0 rounded-xl object-contain shadow-xs"
          />
          <div className="flex flex-col justify-center">
            <h1 className="text-base font-bold text-slate-900 tracking-tight leading-tight dark:text-white">
              OmBhi
            </h1>
            <p className="text-[11px] font-semibold text-[#6657E8] dark:text-[#A59DF7] leading-tight">
              Personal Productivity
            </p>
          </div>
        </div>
      </div>

      {/* Primary Actions (Quick Add + AI Quick Add) */}
      <div className="p-3 space-y-1.5">
        <button
          type="button"
          onClick={onQuickAdd}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#6657E8] py-2.5 px-3 text-xs font-semibold text-white shadow-xs transition hover:bg-[#5546d7] active:scale-[0.99] cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>New Task / Schedule</span>
        </button>

        {onAIQuickAdd && (
          <button
            type="button"
            onClick={onAIQuickAdd}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#6657E8]/30 bg-[#6657E8]/5 py-2 px-3 text-xs font-semibold text-[#6657E8] transition hover:bg-[#6657E8]/10 active:scale-[0.99] dark:bg-[#6657E8]/10 dark:text-[#A59DF7] cursor-pointer"
            title="Type naturally e.g. 'gym every MWF at 7am'"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#6657E8] dark:text-[#A59DF7]" />
            <span>AI Quick Add</span>
            <kbd className="ml-1 rounded bg-white px-1.5 py-0.5 text-[9px] font-mono text-gray-400 border border-gray-200 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-400">
              ⌘K
            </kbd>
          </button>
        )}
      </div>

      {/* Main Navigation Links */}
      <nav aria-label="Views" className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium transition cursor-pointer ${
                isActive
                  ? 'bg-[#6657E8]/10 text-[#6657E8] font-semibold dark:bg-[#6657E8]/20 dark:text-[#A59DF7]'
                  : 'text-gray-600 hover:bg-gray-100/80 dark:text-gray-400 dark:hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? 'text-[#6657E8] dark:text-[#A59DF7]' : ''}`} />
              <span className="flex-1 text-left">{item.label}</span>
              {Boolean(item.badge && item.badge > 0) && (
                <span className="ml-auto flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-xs">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User Workspace Profile & Sign Out & Theme Toggle */}
      <div className="border-t border-gray-100 p-3 dark:border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'Google User'}
                className="h-8 w-8 rounded-full border border-[#6657E8]/30 object-cover shrink-0"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#6657E8] to-[#9182F3] text-xs font-bold text-white shadow-xs">
                {user?.displayName ? user.displayName.slice(0, 2).toUpperCase() : 'OB'}
              </div>
            )}
            <div className="text-left truncate">
              <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                {user?.displayName || 'Google Account'}
              </p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                {user?.email || 'Cloud Sync Active'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={`Switch to ${settings.theme === 'dark' ? 'light' : 'dark'} mode`}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-gray-200 cursor-pointer"
            title="Toggle light / dark theme"
          >
            {settings.theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>

        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign out"
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200/80 bg-gray-50/50 py-1.5 text-[11px] font-semibold text-gray-600 transition hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 dark:border-slate-800 dark:bg-slate-800/40 dark:text-gray-400 dark:hover:bg-rose-950/20 dark:hover:text-rose-400 cursor-pointer"
          >
            <LogOut className="h-3 w-3" />
            <span>Sign Out</span>
          </button>
        )}
      </div>
    </aside>
  );
}
