import { useState, useRef, useEffect } from 'react';
import { Bell, CheckCheck, Trash2, Clock, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { InAppNotification } from '../types';

interface NotificationCenterProps {
  notifications: InAppNotification[];
  onMarkAsRead: (notificationId: string) => void;
  onMarkAllAsRead: () => void;
  onDeleteNotification: (notificationId: string) => void;
  onSelectReminder?: (reminderId: string) => void;
  onSelectNotificationReminder?: (reminderId: string) => void;
  onSelectNotification?: (notification: InAppNotification) => void;
}

export function NotificationCenter({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDeleteNotification,
  onSelectReminder,
  onSelectNotificationReminder,
  onSelectNotification,
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleNotificationClick = (n: InAppNotification) => {
    if (!n.read) {
      onMarkAsRead(n.id);
    }
    if (onSelectNotification) {
      onSelectNotification(n);
      setIsOpen(false);
      return;
    }
    const selectFn = onSelectReminder || onSelectNotificationReminder;
    if (selectFn && (n.reminderId || n.targetId)) {
      selectFn(n.reminderId || n.targetId || '');
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Notification Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={isOpen}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-purple-100/90 bg-white/95 text-gray-600 shadow-xs transition hover:bg-[#6657E8]/10 hover:text-[#6657E8] dark:border-slate-800 dark:bg-[#1E293B]/95 dark:text-gray-300 dark:hover:bg-slate-800 cursor-pointer"
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-xs animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Panel */}
      {isOpen && (
        <div className="absolute right-0 top-11 z-50 w-80 sm:w-96 rounded-2xl border border-purple-100/90 bg-white shadow-xl backdrop-blur-xl dark:border-slate-800 dark:bg-[#1E293B] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-[#6657E8] dark:text-[#A59DF7]" />
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-[#6657E8]/10 px-2 py-0.5 text-[10px] font-bold text-[#6657E8] dark:bg-[#6657E8]/25 dark:text-[#A59DF7]">
                  {unreadCount} new
                </span>
              )}
            </div>

            {notifications.length > 0 && unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllAsRead}
                className="flex items-center gap-1 text-[11px] font-semibold text-[#6657E8] hover:underline dark:text-[#A59DF7] cursor-pointer"
              >
                <CheckCheck className="h-3 w-3" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100/80 dark:divide-slate-800/80">
            {notifications.length === 0 ? (
              <div className="p-8 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-purple-50 text-[#6657E8] dark:bg-slate-800 dark:text-[#A59DF7]">
                  <Bell className="h-5 w-5 opacity-50" />
                </div>
                <p className="mt-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                  No notifications yet
                </p>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  You're all caught up with your scheduled reminders.
                </p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`group flex items-start gap-3 p-3.5 transition cursor-pointer ${
                    !n.read
                      ? 'bg-[#6657E8]/5 hover:bg-[#6657E8]/10 dark:bg-[#6657E8]/15 dark:hover:bg-[#6657E8]/20'
                      : 'hover:bg-gray-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      n.itemType === 'task'
                        ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400'
                        : n.itemType === 'habit'
                        ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400'
                        : n.priority === 'urgent'
                        ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400'
                        : n.priority === 'high'
                        ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400'
                        : 'bg-[#6657E8]/15 text-[#6657E8] dark:bg-[#6657E8]/30 dark:text-[#A59DF7]'
                    }`}
                  >
                    {n.itemType === 'task' ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : n.itemType === 'habit' ? (
                      <Sparkles className="h-3.5 w-3.5" />
                    ) : n.priority === 'urgent' ? (
                      <AlertCircle className="h-3.5 w-3.5" />
                    ) : (
                      <Clock className="h-3.5 w-3.5" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className={`text-xs truncate ${
                          !n.read
                            ? 'font-bold text-gray-900 dark:text-white'
                            : 'font-medium text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {n.title}
                      </p>
                      {!n.read && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-[#6657E8]" />
                      )}
                    </div>
                    {n.message && (
                      <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2">
                        {n.message}
                      </p>
                    )}
                    <span className="mt-1 block text-[10px] text-gray-400">
                      {new Date(n.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteNotification(n.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-rose-500 transition cursor-pointer"
                    title="Dismiss"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
