import {
  LayoutDashboard,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ListTodo,
  Flame,
  BarChart3,
  Plus,
  Sun,
  Moon,
  Compass,
  LogOut,
  Bell,
} from 'lucide-react';
import { AppView, UserSettings } from '../types';

interface MobileNavProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  onQuickAdd: () => void;
  settings: UserSettings;
  onToggleTheme: () => void;
  onSignOut?: () => void;
  notificationCenterNode?: React.ReactNode;
}

export function MobileHeader({
  onQuickAdd,
  settings,
  onToggleTheme,
  onSignOut,
  notificationCenterNode,
}: Omit<MobileNavProps, 'currentView' | 'onNavigate'>) {
  return (
    <header className="flex items-center justify-between border-b border-purple-100/80 bg-white/95 px-4 py-3 md:hidden dark:border-slate-800 dark:bg-[#1E293B]">
      <div className="flex items-center gap-2.5">
        <img
          src="/ombhi-icon.png"
          alt="OmBhi Logo"
          className="h-8 w-8 shrink-0 rounded-lg object-contain shadow-xs"
        />
        <div className="flex flex-col justify-center">
          <span className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
            OmBhi
          </span>
          <span className="text-[10px] font-semibold text-[#6657E8] dark:text-[#A59DF7] leading-tight">
            Personal Productivity
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {notificationCenterNode}

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800"
        >
          {settings.theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign out"
            className="rounded-lg p-2 text-gray-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
            title="Sign Out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}

        <button
          type="button"
          onClick={onQuickAdd}
          aria-label="Add task"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#6657E8] text-white shadow-xs"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

export function MobileBottomBar({
  currentView,
  onNavigate,
}: Pick<MobileNavProps, 'currentView' | 'onNavigate'>) {
  const items: { id: AppView; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'myday', label: 'My Day', icon: CalendarCheck },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'timetable', label: 'Timetable', icon: CalendarRange },
    { id: 'alltasks', label: 'Tasks', icon: ListTodo },
    { id: 'reminders', label: 'Reminders', icon: Bell },
    { id: 'habits', label: 'Habits', icon: Flame },
    { id: 'analytics', label: 'Stats', icon: BarChart3 },
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className="flex items-center justify-around border-t border-gray-200/90 bg-white/95 py-2 backdrop-blur-md md:hidden dark:border-slate-800 dark:bg-[#1E293B]/95"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = currentView === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className={`flex flex-col items-center gap-1 p-1 text-[10px] font-medium transition ${
              isActive
                ? 'text-[#6657E8] font-bold dark:text-[#A59DF7]'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
