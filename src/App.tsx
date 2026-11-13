import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { X, Clock } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import {
  fetchUserTasks,
  fetchUserSchedules,
  fetchUserHabits,
  fetchUserCategories,
  fetchUserReminders,
  syncTaskToCloud,
  deleteTaskFromCloud,
  syncScheduleToCloud,
  deleteScheduleFromCloud,
  syncHabitToCloud,
  deleteHabitFromCloud,
  syncCategoryToCloud,
  deleteCategoryFromCloud,
  syncReminderToCloud,
  deleteReminderFromCloud,
  fetchUserNotifications,
  syncNotificationToCloud,
  deleteNotificationFromCloud,
  markAllNotificationsAsReadInCloud,
  fetchUserTimetableTemplates,
  syncTimetableTemplateToCloud,
  deleteTimetableTemplateFromCloud,
} from './utils/cloudSync';
import {
  AppView,
  Category,
  Habit,
  InAppNotification,
  Priority,
  RecurringSchedule,
  Reminder,
  ScheduleMode,
  Subtask,
  Task,
  TimetableSlot,
  TimetableTemplate,
  UserSettings,
  WeeklyReview,
} from './types';
import {
  loadUserStoredCategories,
  saveUserStoredCategories,
  loadUserStoredHabits,
  saveUserStoredHabits,
  loadUserStoredSchedules,
  saveUserStoredSchedules,
  loadUserStoredSettings,
  saveUserStoredSettings,
  loadUserStoredTasks,
  saveUserStoredTasks,
  loadUserStoredWeeklyReviews,
  saveUserStoredWeeklyReviews,
  loadUserStoredReminders,
  saveUserStoredReminders,
  loadUserStoredNotifications,
  saveUserStoredNotifications,
  loadUserStoredTimetableTemplates,
  saveUserStoredTimetableTemplates,
  clearUserStoredData,
  purgeLegacySharedStorage,
} from './utils/storage';
import { DEFAULT_SETTINGS } from './utils/sampleData';
import { getTodayString } from './utils/date';
import { calculateHabitStreak } from './utils/calculations';
import {
  formatScheduleSummary,
  syncOccurrencesForSchedules,
} from './utils/recurring';
import {
  computeSnoozedDateTime,
  getNextReminderOccurrence,
  getSystemTimezone,
} from './utils/reminders';
import { authenticatedFetch } from './utils/api';

import { Sidebar } from './components/Sidebar';
import { MobileHeader, MobileBottomBar } from './components/MobileNav';
import type { DeleteScope } from './components/DeleteScopeModal';
import { CelebrationBurst } from './components/Celebration';
import {
  shouldTriggerCelebration,
  canCelebrateTaskTransition,
  CELEBRATION_DURATION_MS,
} from './utils/celebration';
import { shouldPlayNotificationSound, playNotificationChime } from './utils/sound';
import { NotificationCenter } from './components/NotificationCenter';
import { rescheduleSingleOccurrence } from './utils/rescheduling';

// Lazy-loaded auth screen
const SignInView = lazy(() =>
  import('./components/SignInView').then((m) => ({ default: m.SignInView }))
);

// Lazy-loaded core views
const DashboardView = lazy(() =>
  import('./views/DashboardView').then((m) => ({ default: m.DashboardView }))
);
const MyDayView = lazy(() =>
  import('./views/MyDayView').then((m) => ({ default: m.MyDayView }))
);
const CalendarView = lazy(() =>
  import('./views/CalendarView').then((m) => ({ default: m.CalendarView }))
);
const AllTasksView = lazy(() =>
  import('./views/AllTasksView').then((m) => ({ default: m.AllTasksView }))
);
const HabitsView = lazy(() =>
  import('./views/HabitsView').then((m) => ({ default: m.HabitsView }))
);
const AnalyticsView = lazy(() =>
  import('./views/AnalyticsView').then((m) => ({ default: m.AnalyticsView }))
);
const WeeklyReviewView = lazy(() =>
  import('./views/WeeklyReviewView').then((m) => ({ default: m.WeeklyReviewView }))
);
const ConsistencyCoachView = lazy(() =>
  import('./views/ConsistencyCoachView').then((m) => ({ default: m.ConsistencyCoachView }))
);
const CategoriesView = lazy(() =>
  import('./views/CategoriesView').then((m) => ({ default: m.CategoriesView }))
);
const SettingsView = lazy(() =>
  import('./views/SettingsView').then((m) => ({ default: m.SettingsView }))
);
const RemindersView = lazy(() =>
  import('./views/RemindersView').then((m) => ({ default: m.RemindersView }))
);
const TimetableView = lazy(() =>
  import('./views/TimetableView').then((m) => ({ default: m.TimetableView }))
);

// Lazy-loaded dialogs & modals
const TaskModal = lazy(() =>
  import('./components/TaskModal').then((m) => ({ default: m.TaskModal }))
);
const ReminderModal = lazy(() =>
  import('./components/ReminderModal').then((m) => ({ default: m.ReminderModal }))
);
const AIDayPlannerModal = lazy(() =>
  import('./components/AIDayPlannerModal').then((m) => ({ default: m.AIDayPlannerModal }))
);
const NaturalLanguageTaskModal = lazy(() =>
  import('./components/NaturalLanguageTaskModal').then((m) => ({ default: m.NaturalLanguageTaskModal }))
);
const SmartRescheduleModal = lazy(() =>
  import('./components/SmartRescheduleModal').then((m) => ({ default: m.SmartRescheduleModal }))
);
const DeleteScopeModal = lazy(() =>
  import('./components/DeleteScopeModal').then((m) => ({ default: m.DeleteScopeModal }))
);
const FailSkipModal = lazy(() =>
  import('./components/FailSkipModal').then((m) => ({ default: m.FailSkipModal }))
);

function ViewLoadingFallback() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="flex flex-col items-center gap-2.5">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#6657E8]/20 border-t-[#6657E8]" />
        <span className="text-xs font-semibold text-gray-400">Loading view...</span>
      </div>
    </div>
  );
}

interface ToastNotification {
  id: string;
  text: string;
  actionText?: string;
  onAction?: () => void;
}

function formatCloudSyncError(rawError: unknown, fallback = 'Could not connect to Cloud Firestore.'): string {
  const raw = rawError instanceof Error ? rawError.message : typeof rawError === 'string' ? rawError : '';
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.message === 'string') {
      const op = typeof parsed.operationType === 'string' ? parsed.operationType : '';
      return op ? `${parsed.message} (${op})` : parsed.message;
    }
  } catch {
    // Not JSON; return plain message
  }
  return raw;
}

function SchedulerApp() {
  const { user, loading, signOut } = useAuth();
  const [currentView, setCurrentView] = useState<AppView>('dashboard');
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [isWorkspaceLoaded, setIsWorkspaceLoaded] = useState(false);
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);

  // Application Stores (strictly isolated per authenticated Firebase UID, starting 100% clean)
  const [schedules, setSchedules] = useState<RecurringSchedule[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [timetableTemplates, setTimetableTemplates] = useState<TimetableTemplate[]>([]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [weeklyReviews, setWeeklyReviews] = useState<Record<string, WeeklyReview>>({});

  // Modals & Overlays
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [modalTask, setModalTask] = useState<Task | null>(null);
  const [modalInitialDate, setModalInitialDate] = useState<string>(getTodayString(0));
  const [modalInitialTime, setModalInitialTime] = useState<string>('');
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);

  const [failSkipTask, setFailSkipTask] = useState<Task | null>(null);
  const [deleteScopeTask, setDeleteScopeTask] = useState<Task | null>(null);
  const [isNLModalOpen, setIsNLModalOpen] = useState(false);
  const [isDayPlannerOpen, setIsDayPlannerOpen] = useState(false);
  const [dayPlannerDate, setDayPlannerDate] = useState<string>(getTodayString(0));
  const [rescheduleTargetTask, setRescheduleTargetTask] = useState<Task | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationMessage, setCelebrationMessage] = useState('Milestone reached! Completed.');
  const [toast, setToast] = useState<ToastNotification | null>(null);

  // Deduplication & state guards for celebrations and notification sounds
  const celebratedTaskIdsRef = useRef<Set<string>>(new Set());
  const celebratedHabitsRef = useRef<Set<string>>(new Set());
  const celebratedRemindersRef = useRef<Set<string>>(new Set());
  const knownNotificationIdsRef = useRef<Set<string>>(new Set());

  const handleCelebrationComplete = useCallback(() => {
    setShowCelebration(false);
  }, []);

  // Live Date and Time Tracking Clock
  const [currentDateTime, setCurrentDateTime] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDateTime = useMemo(() => {
    const datePart = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(currentDateTime);

    const timePart = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: !settings.timeFormat24h,
    }).format(currentDateTime);

    return { datePart, timePart };
  }, [currentDateTime, settings.timeFormat24h]);

  // Active User UID tracker to guarantee zero cross-account data leakage
  const currentUserId = user?.uid ?? null;

  useEffect(() => {
    // Purge old unscoped legacy storage on startup
    purgeLegacySharedStorage();
  }, []);

  // Strict User Workspace Isolation & Account Switching Loader
  useEffect(() => {
    if (!currentUserId) {
      // User is logged out: Immediately wipe all in-memory workspace data!
      setSchedules([]);
      setTasks([]);
      setCategories([]);
      setHabits([]);
      setReminders([]);
      setNotifications([]);
      setTimetableTemplates([]);
      setWeeklyReviews({});
      setIsWorkspaceLoaded(false);
      setIsWorkspaceLoading(false);
      setCloudSyncError(null);
      return;
    }

    let isMounted = true;

    async function loadUserWorkspace(uid: string) {
      setIsWorkspaceLoading(true);
      setIsCloudSyncing(true);
      setCloudSyncError(null);

      // 1. Immediately load user-isolated local cache (if any)
      const cachedTasks = loadUserStoredTasks(uid);
      const cachedSchedules = loadUserStoredSchedules(uid);
      const cachedHabits = loadUserStoredHabits(uid);
      const cachedCategories = loadUserStoredCategories(uid);
      const cachedSettings = loadUserStoredSettings(uid);
      const cachedReviews = loadUserStoredWeeklyReviews(uid);
      const cachedReminders = loadUserStoredReminders(uid);
      const cachedNotifications = loadUserStoredNotifications(uid);
      const cachedTemplates = loadUserStoredTimetableTemplates(uid);

      if (isMounted) {
        setSchedules(cachedSchedules);
        setTasks(cachedTasks);
        setHabits(cachedHabits);
        setCategories(cachedCategories);
        setSettings(cachedSettings);
        setWeeklyReviews(cachedReviews);
        setReminders(cachedReminders);
        setNotifications(cachedNotifications);
        setTimetableTemplates(cachedTemplates);

        // Pre-populate completed item sets to ensure refresh or initial load never triggers confetti
        cachedTasks.forEach((t) => {
          if (t.status === 'completed' || t.progress === 100) {
            celebratedTaskIdsRef.current.add(t.id);
          }
        });
        cachedHabits.forEach((h) => {
          (h.completedDates || []).forEach((d) => celebratedHabitsRef.current.add(`${h.id}-${d}`));
        });
        cachedReminders.forEach((r) => {
          if (r.completed) celebratedRemindersRef.current.add(r.id);
        });
        cachedNotifications.forEach((n) => {
          knownNotificationIdsRef.current.add(n.id);
        });
      }

      // 2. Fetch exclusively from this user's isolated Firestore subcollections
      try {
        const [
          cloudTasks,
          cloudSchedules,
          cloudHabits,
          cloudCategories,
          cloudReminders,
          cloudNotifications,
          cloudTemplates,
        ] = await Promise.all([
          fetchUserTasks(uid),
          fetchUserSchedules(uid),
          fetchUserHabits(uid),
          fetchUserCategories(uid),
          fetchUserReminders(uid),
          fetchUserNotifications(uid),
          fetchUserTimetableTemplates(uid),
        ]);

        if (!isMounted) return;

        // Set state exclusively to this user's real Firestore data (new users have 0 records, start clean)
        setSchedules(cloudSchedules);
        const horizonStart = getTodayString(-60);
        const horizonEnd = getTodayString(120);
        const synced = syncOccurrencesForSchedules(
          cloudSchedules,
          cloudTasks,
          horizonStart,
          horizonEnd
        );
        let mergedNotifications = [...cloudNotifications];
        try {
          const pendingRes = await authenticatedFetch('/api/reminders/pending-notifications');
          if (pendingRes.ok) {
            const pendingData = await pendingRes.json();
            if (Array.isArray(pendingData.pendingNotifications) && pendingData.pendingNotifications.length > 0) {
              for (const notif of pendingData.pendingNotifications) {
                await syncNotificationToCloud(uid, notif);
              }
              const existingNotifIds = new Set(mergedNotifications.map((n) => n.id));
              const fresh = pendingData.pendingNotifications.filter((n: InAppNotification) => !existingNotifIds.has(n.id));
              mergedNotifications = [...fresh, ...mergedNotifications];
            }
          }
        } catch {
          // Offline fetch error caught
        }

        setTasks(synced);
        setHabits(cloudHabits);
        setCategories(cloudCategories);
        setReminders(cloudReminders);
        setNotifications(mergedNotifications);
        setTimetableTemplates(cloudTemplates);

        // Populate completed cloud items to guarantee refresh or remote sync never triggers celebratory confetti
        synced.forEach((t) => {
          if (t.status === 'completed' || t.progress === 100) {
            celebratedTaskIdsRef.current.add(t.id);
          }
        });
        cloudHabits.forEach((h) => {
          (h.completedDates || []).forEach((d) => celebratedHabitsRef.current.add(`${h.id}-${d}`));
        });
        cloudReminders.forEach((r) => {
          if (r.completed) celebratedRemindersRef.current.add(r.id);
        });
        mergedNotifications.forEach((n) => {
          knownNotificationIdsRef.current.add(n.id);
        });

        // Synchronize active reminders with server-side persistent schedule store for offline background processing
        try {
          await authenticatedFetch('/api/reminders/sync-schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              timezone: settings.timezone || getSystemTimezone(),
              reminders: cloudReminders,
            }),
          });
        } catch {
          // Background sync catch
        }

        // Update isolated user cache with latest verified cloud data
        saveUserStoredTasks(uid, synced);
        saveUserStoredSchedules(uid, cloudSchedules);
        saveUserStoredHabits(uid, cloudHabits);
        saveUserStoredCategories(uid, cloudCategories);
        saveUserStoredReminders(uid, cloudReminders);
        saveUserStoredNotifications(uid, mergedNotifications);
        saveUserStoredTimetableTemplates(uid, cloudTemplates);

        setIsWorkspaceLoaded(true);
        setCurrentView('dashboard');
      } catch (err: any) {
        console.error('Failed to sync cloud state:', formatCloudSyncError(err));
        if (isMounted) {
          const msg = err instanceof Error ? err.message : String(err);
          setCloudSyncError(msg || 'Could not connect to Cloud Firestore. Working with local workspace.');
          // If cached data exists, allow user into workspace while displaying error banner
          if (cachedTasks.length > 0 || cachedCategories.length > 0 || cachedHabits.length > 0 || cachedReminders.length > 0) {
            setIsWorkspaceLoaded(true);
          }
        }
      } finally {
        if (isMounted) {
          setIsCloudSyncing(false);
          setIsWorkspaceLoading(false);
        }
      }
    }

    loadUserWorkspace(currentUserId);

    return () => {
      isMounted = false;
    };
  }, [currentUserId]);

  // Sync state exclusively to user-isolated localStorage cache
  useEffect(() => {
    if (currentUserId) {
      saveUserStoredTasks(currentUserId, tasks);
    }
  }, [currentUserId, tasks]);

  useEffect(() => {
    if (currentUserId) {
      saveUserStoredSchedules(currentUserId, schedules);
    }
  }, [currentUserId, schedules]);

  useEffect(() => {
    if (currentUserId) {
      saveUserStoredCategories(currentUserId, categories);
    }
  }, [currentUserId, categories]);

  useEffect(() => {
    if (currentUserId) {
      saveUserStoredHabits(currentUserId, habits);
    }
  }, [currentUserId, habits]);

  useEffect(() => {
    if (currentUserId) {
      saveUserStoredWeeklyReviews(currentUserId, weeklyReviews);
    }
  }, [currentUserId, weeklyReviews]);

  useEffect(() => {
    if (currentUserId) {
      saveUserStoredReminders(currentUserId, reminders);
    }
  }, [currentUserId, reminders]);

  useEffect(() => {
    if (currentUserId) {
      saveUserStoredNotifications(currentUserId, notifications);
    }
  }, [currentUserId, notifications]);

  // Reliable server-side reminder processing & notification delivery
  const processRemindersOnServer = useCallback(async () => {
    if (!currentUserId || !reminders || reminders.length === 0) return;
    try {
      const res = await authenticatedFetch('/api/reminders/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezone: settings.timezone || getSystemTimezone(),
          reminders,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.newNotifications && data.newNotifications.length > 0) {
        let shouldPlayChime = false;
        for (const notif of data.newNotifications) {
          await syncNotificationToCloud(currentUserId, notif);
          if (
            shouldPlayNotificationSound(
              notif.id,
              knownNotificationIdsRef.current,
              settings.notificationSound !== false
            )
          ) {
            shouldPlayChime = true;
          }
          knownNotificationIdsRef.current.add(notif.id);
        }
        if (shouldPlayChime) {
          playNotificationChime();
        }
        setNotifications((prev) => {
          const existingIds = new Set(prev.map((n) => n.id));
          const added = data.newNotifications.filter((n: InAppNotification) => !existingIds.has(n.id));
          return [...added, ...prev];
        });
      }
      if (data.updatedReminders && data.updatedReminders.length > 0) {
        for (const upd of data.updatedReminders) {
          await syncReminderToCloud(currentUserId, upd);
        }
        setReminders((prev) =>
          prev.map((r) => {
            const matching = data.updatedReminders.find((u: Reminder) => u.id === r.id);
            return matching || r;
          })
        );
      }
    } catch {
      // Non-blocking network catch; next periodic cycle will retry
    }
  }, [currentUserId, user?.email, settings.timezone, reminders]);

  useEffect(() => {
    if (!currentUserId) return;
    processRemindersOnServer();
    const interval = setInterval(processRemindersOnServer, 30000);
    return () => clearInterval(interval);
  }, [processRemindersOnServer, currentUserId]);

  const unreadNotificationsCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const handleSaveReview = (review: WeeklyReview) => {
    setWeeklyReviews((prev) => ({ ...prev, [review.weekKey]: review }));
    showToast('AI Weekly Review saved!');
  };

  useEffect(() => {
    if (currentUserId) {
      saveUserStoredSettings(currentUserId, settings);
    }
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [currentUserId, settings]);

  // Global Keyboard Shortcut: Cmd+K / Ctrl+K for AI Quick Add
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsNLModalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Toast Auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const showToast = (text: string, actionText?: string, onAction?: () => void) => {
    setToast({
      id: String(Date.now()),
      text,
      actionText,
      onAction,
    });
  };

  // Reusable in-app notification creator and dispatcher
  const pushInAppNotification = (params: {
    title: string;
    message: string;
    itemType?: 'task' | 'habit' | 'reminder' | 'system';
    targetId?: string;
    priority?: Priority;
  }) => {
    if (!currentUserId) return;
    const notifId = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const notif: InAppNotification = {
      id: notifId,
      userId: currentUserId,
      title: params.title,
      message: params.message,
      itemType: params.itemType,
      targetId: params.targetId,
      taskId: params.itemType === 'task' ? params.targetId : undefined,
      habitId: params.itemType === 'habit' ? params.targetId : undefined,
      reminderId: params.itemType === 'reminder' ? params.targetId : undefined,
      priority: params.priority || 'medium',
      read: false,
      createdAt: new Date().toISOString(),
    };

    if (
      shouldPlayNotificationSound(
        notifId,
        knownNotificationIdsRef.current,
        settings.notificationSound !== false
      )
    ) {
      knownNotificationIdsRef.current.add(notifId);
      playNotificationChime();
    } else {
      knownNotificationIdsRef.current.add(notifId);
    }

    setNotifications((prev) => [notif, ...prev]);
    saveUserStoredNotifications(currentUserId, [notif, ...notifications]);
    syncNotificationToCloud(currentUserId, notif).catch((err) => {
      console.warn('Failed to sync notification to Firestore:', err);
    });
  };

  /* ========================================================================
     TASK COMPLETION & PROGRESS LOGIC (STRICTLY INDEPENDENT PER DAY)
     ======================================================================== */

  // METHOD A: Complete with a checkmark (Synchronized with 100% / 0% progress)
  const handleCompleteTask = async (task: Task) => {
    const isCurrentlyCompleted = task.status === 'completed' || task.progress === 100;
    const prevStatus = task.status;
    const prevProgress = task.progress;
    const nowIso = new Date().toISOString();

    if (isCurrentlyCompleted) {
      // Unchecking manually: reset progress to 0% and status to 'pending'
      celebratedTaskIdsRef.current.delete(task.id);
      setShowCelebration(false);
      const updated: Task = {
        ...task,
        status: 'pending',
        progress: 0,
        updatedAt: nowIso,
      };
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? updated : t))
      );
      if (user) {
        try {
          await syncTaskToCloud(user.uid, updated);
        } catch (err: any) {
          setCloudSyncError(err?.message || 'Failed to update task in Firestore');
        }
      }
      showToast(`Reopened "${task.title}" (Progress reset to 0%)`);
      return;
    }

    // Checking manually: sets progress to 100% and status to 'completed'
    const updated: Task = {
      ...task,
      status: 'completed',
      progress: 100,
      updatedAt: nowIso,
    };

    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    if (user) {
      try {
        await syncTaskToCloud(user.uid, updated);
      } catch (err: any) {
        setCloudSyncError(err?.message || 'Failed to update task in Firestore');
      }
    }

    // Guard: Trigger celebration ONLY when transitioning from incomplete to completed,
    // and never repeat for the same task unless reopened
    if (
      canCelebrateTaskTransition(task.id, false, true, celebratedTaskIdsRef.current) &&
      shouldTriggerCelebration('task', settings, showCelebration)
    ) {
      celebratedTaskIdsRef.current.add(task.id);
      setCelebrationMessage(`Milestone reached! "${task.title}" completed.`);
      setShowCelebration(true);
    } else {
      celebratedTaskIdsRef.current.add(task.id);
    }

    pushInAppNotification({
      title: `Task Completed: ${task.title}`,
      message: 'Marked as completed (100% progress). Great job!',
      itemType: 'task',
      targetId: task.id,
      priority: task.priority,
    });

    showToast(`Completed "${task.title}" (100%)`, 'Undo', async () => {
      const reverted: Task = {
        ...task,
        status: prevStatus,
        progress: prevProgress,
        updatedAt: new Date().toISOString(),
      };
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? reverted : t))
      );
      if (user) {
        await syncTaskToCloud(user.uid, reverted).catch(() => {});
      }
    });
  };

  // METHOD B: Mark as Failed or Skipped
  const handleConfirmFailSkip = async (task: Task, newStatus: 'failed' | 'skipped') => {
    const prevStatus = task.status;
    const prevProgress = task.progress;

    const updated: Task = {
      ...task,
      status: newStatus,
      progress: 0,
      updatedAt: new Date().toISOString(),
    };

    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    if (user) {
      try {
        await syncTaskToCloud(user.uid, updated);
      } catch (err: any) {
        setCloudSyncError(err?.message || 'Failed to update task in Firestore');
      }
    }
    setFailSkipTask(null);

    showToast(`Marked "${task.title}" as ${newStatus}`, 'Undo', async () => {
      const reverted: Task = {
        ...task,
        status: prevStatus,
        progress: prevProgress,
        updatedAt: new Date().toISOString(),
      };
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? reverted : t))
      );
      if (user) {
        await syncTaskToCloud(user.uid, reverted).catch(() => {});
      }
    });
  };

  // METHOD C: Custom Percentage Progress (Immediately synchronized with completion checkbox)
  const handleUpdateProgress = async (task: Task, newProgress: number) => {
    const bounded = Math.max(0, Math.min(100, Math.round(newProgress)));
    const nowIso = new Date().toISOString();

    // When progress reaches exactly 100%, automatically mark as completed
    // When progress is below 100%, automatically uncheck it (pending if 0, in_progress if 1-99)
    let nextStatus: Task['status'];
    if (bounded === 100) {
      nextStatus = 'completed';
    } else if (bounded === 0) {
      nextStatus = 'pending';
    } else {
      nextStatus = 'in_progress';
    }

    const updated: Task = {
      ...task,
      progress: bounded,
      status: nextStatus,
      updatedAt: nowIso,
    };

    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    if (bounded === 100 && task.progress < 100) {
      if (
        canCelebrateTaskTransition(task.id, false, true, celebratedTaskIdsRef.current) &&
        shouldTriggerCelebration('task', settings, showCelebration)
      ) {
        celebratedTaskIdsRef.current.add(task.id);
        setCelebrationMessage(`Milestone reached! "${task.title}" completed.`);
        setShowCelebration(true);
      } else {
        celebratedTaskIdsRef.current.add(task.id);
      }
      pushInAppNotification({
        title: `Task Completed: ${task.title}`,
        message: 'Reached 100% progress milestone.',
        itemType: 'task',
        targetId: task.id,
        priority: task.priority,
      });
    } else if (bounded < 100) {
      celebratedTaskIdsRef.current.delete(task.id);
    }
    if (user) {
      try {
        await syncTaskToCloud(user.uid, updated);
      } catch (err: any) {
        setCloudSyncError(err?.message || 'Failed to sync progress to Firestore');
      }
    }
  };

  /* ========================================================================
     SMART RESCHEDULING & AI DAY PLANNING HANDLERS
     ======================================================================== */
  const handleConfirmReschedule = (
    task: Task,
    targetDate: string,
    targetStartTime?: string,
    targetEndTime?: string
  ) => {
    const rescheduled = rescheduleSingleOccurrence(
      task,
      targetDate,
      targetStartTime,
      targetEndTime
    );
    setTasks((prev) => prev.map((t) => (t.id === task.id ? rescheduled : t)));
    if (user) {
      syncTaskToCloud(user.uid, rescheduled);
    }
    setRescheduleTargetTask(null);
    showToast(`Rescheduled "${task.title}" to ${targetDate}`);
  };

  const handleApplyDayPlan = (
    updates: { taskId: string; startTime: string; endTime: string }[]
  ) => {
    setTasks((prev) =>
      prev.map((t) => {
        const match = updates.find((u) => u.taskId === t.id);
        if (match) {
          const updated = {
            ...t,
            startTime: match.startTime,
            endTime: match.endTime,
            updatedAt: new Date().toISOString(),
          };
          if (user) {
            syncTaskToCloud(user.uid, updated);
          }
          return updated;
        }
        return t;
      })
    );
    showToast(`Applied smart schedule to ${updates.length} tasks!`);
  };

  /* ========================================================================
     TASK & SCHEDULE CREATION AND EDITING
     ======================================================================== */

  const handleSaveTask = (payload: {
    id?: string;
    seriesId?: string;
    title: string;
    description?: string;
    scheduledDate: string;
    startTime?: string;
    endTime?: string;
    categoryId: string;
    priority: Priority;
    status: Task['status'];
    progress: number;
    subtasks: Subtask[];
    notes?: string;
    scheduleMode: ScheduleMode;
    recurrenceFrequency?: any;
    recurrenceDays?: number[];
    specificDates?: string[];
    seriesStartDate?: string;
    seriesEndDate?: string;
    editScope?: 'single' | 'future' | 'all';
  }) => {
    const nowIso = new Date().toISOString();
    const horizonStart = getTodayString(-60);
    const horizonEnd = getTodayString(120);

    // Case 1: Saving a REPEAT or MULTI-DATE schedule
    if (payload.scheduleMode === 'repeat' || payload.scheduleMode === 'multi_date') {
      if (payload.seriesId) {
        // Editing an existing recurring series
        const targetSchedule = schedules.find((s) => s.id === payload.seriesId);

        if (payload.editScope === 'single' && payload.id) {
          // A. "This occurrence only": detach this occurrence
          const existing = tasks.find((t) => t.id === payload.id);
          const updatedOccurrence: Task = {
            ...(existing || {
              id: payload.id,
              seriesId: payload.seriesId,
              scheduledDate: payload.scheduledDate,
              status: payload.status,
              progress: payload.progress,
              recurrence: 'daily',
              createdAt: nowIso,
            }),
            title: payload.title,
            description: payload.description || '',
            startTime: payload.startTime || '',
            endTime: payload.endTime || '',
            categoryId: payload.categoryId,
            priority: payload.priority,
            subtasks: payload.subtasks || [],
            notes: payload.notes || '',
            isDetached: true,
            updatedAt: nowIso,
          };
          setTasks((prev) =>
            prev.map((item) => (item.id === payload.id ? updatedOccurrence : item))
          );
          if (user) {
            syncTaskToCloud(user.uid, updatedOccurrence);
          }
          showToast(`Updated occurrence for ${payload.scheduledDate}`);
        } else {
          // B. "Entire series" or "Future occurrences"
          const updatedSchedule: RecurringSchedule = {
            ...(targetSchedule || {
              id: payload.seriesId,
              startDate: payload.scheduledDate,
              isPaused: false,
              excludedDates: [],
              createdAt: nowIso,
            }),
            title: payload.title,
            description: payload.description || '',
            startTime: payload.startTime || '',
            endTime: payload.endTime || '',
            categoryId: payload.categoryId,
            priority: payload.priority,
            subtasks: payload.subtasks || [],
            notes: payload.notes || '',
            scheduleMode: payload.scheduleMode,
            frequency: payload.recurrenceFrequency,
            recurrenceDays: payload.recurrenceDays,
            specificDates: payload.specificDates,
            startDate: payload.seriesStartDate || targetSchedule?.startDate || payload.scheduledDate,
            endDate: payload.seriesEndDate,
            updatedAt: nowIso,
          };

          const newSchedules = schedules.map((s) =>
            s.id === payload.seriesId ? updatedSchedule : s
          );
          setSchedules(newSchedules);
          if (user) {
            syncScheduleToCloud(user.uid, updatedSchedule);
          }

          const synced = syncOccurrencesForSchedules(newSchedules, tasks, horizonStart, horizonEnd);
          setTasks(synced);
          showToast(`Updated recurring schedule "${payload.title}"`);
        }
      } else {
        // C. Creating a brand new recurring or multi-date schedule!
        const newSeriesId = 'series-' + Date.now();
        const newSchedule: RecurringSchedule = {
          id: newSeriesId,
          title: payload.title,
          description: payload.description || '',
          startTime: payload.startTime || '',
          endTime: payload.endTime || '',
          categoryId: payload.categoryId,
          priority: payload.priority,
          subtasks: payload.subtasks || [],
          notes: payload.notes || '',
          scheduleMode: payload.scheduleMode,
          frequency: payload.recurrenceFrequency || 'daily',
          recurrenceDays: payload.recurrenceDays,
          specificDates: payload.specificDates,
          startDate: payload.seriesStartDate || payload.scheduledDate,
          endDate: payload.seriesEndDate,
          isPaused: false,
          excludedDates: [],
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        const newSchedules = [newSchedule, ...schedules];
        setSchedules(newSchedules);
        if (user) {
          syncScheduleToCloud(user.uid, newSchedule);
        }

        const synced = syncOccurrencesForSchedules(newSchedules, tasks, horizonStart, horizonEnd);
        setTasks(synced);
        showToast(
          payload.scheduleMode === 'multi_date'
            ? `Scheduled "${payload.title}" across ${payload.specificDates?.length || 0} dates`
            : `Created recurring schedule "${payload.title}"`
        );
      }
    } else {
      // Case 2: Standard ONE-TIME task
      if (payload.id) {
        // Update existing one-time task
        const existing = tasks.find((t) => t.id === payload.id);
        const updated: Task = {
          ...(existing || {
            id: payload.id,
            status: payload.status,
            progress: payload.progress,
            recurrence: 'none',
            createdAt: nowIso,
          }),
          title: payload.title,
          description: payload.description || '',
          scheduledDate: payload.scheduledDate,
          startTime: payload.startTime || '',
          endTime: payload.endTime || '',
          categoryId: payload.categoryId,
          priority: payload.priority,
          subtasks: payload.subtasks || [],
          notes: payload.notes || '',
          updatedAt: nowIso,
        };

        setTasks((prev) => prev.map((t) => (t.id === payload.id ? updated : t)));
        if (user) {
          syncTaskToCloud(user.uid, updated);
        }
        showToast(`Updated "${payload.title}"`);
      } else {
        // Create new one-time task
        const created: Task = {
          id: 'task-' + Date.now(),
          title: payload.title,
          description: payload.description || '',
          scheduledDate: payload.scheduledDate,
          startTime: payload.startTime || '',
          endTime: payload.endTime || '',
          categoryId: payload.categoryId,
          priority: payload.priority,
          status: 'pending',
          progress: 0,
          subtasks: payload.subtasks || [],
          notes: payload.notes || '',
          recurrence: 'none',
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        setTasks((prev) => [created, ...prev]);
        if (user) {
          syncTaskToCloud(user.uid, created);
        }
        showToast(`Created "${created.title}"`);
      }
    }

    setIsTaskModalOpen(false);
  };

  // Delete Handlers with Recurring Scope support
  const handleDeleteTaskRequest = (task: Task) => {
    if (task.seriesId) {
      setDeleteScopeTask(task);
    } else {
      // Regular one-time task deletion
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      if (user) {
        deleteTaskFromCloud(user.uid, task.id);
      }
      showToast(`Deleted "${task.title}"`, 'Undo', () => {
        setTasks((prev) => [task, ...prev]);
        if (user) {
          syncTaskToCloud(user.uid, task);
        }
      });
    }
  };

  const handleConfirmDeleteScope = (scope: DeleteScope) => {
    if (!deleteScopeTask) return;
    const taskToDelete = deleteScopeTask;
    setDeleteScopeTask(null);

    if (scope === 'single') {
      // Delete only this day's occurrence and add date to schedule's excludedDates
      setTasks((prev) => prev.filter((t) => t.id !== taskToDelete.id));
      if (user) {
        deleteTaskFromCloud(user.uid, taskToDelete.id);
      }
      if (taskToDelete.seriesId) {
        setSchedules((prev) =>
          prev.map((s) => {
            if (s.id === taskToDelete.seriesId) {
              const updatedS = {
                ...s,
                excludedDates: [...(s.excludedDates || []), taskToDelete.scheduledDate],
                updatedAt: new Date().toISOString(),
              };
              if (user) syncScheduleToCloud(user.uid, updatedS);
              return updatedS;
            }
            return s;
          })
        );
      }
      showToast(`Deleted occurrence for ${taskToDelete.scheduledDate}`, 'Undo', () => {
        setTasks((prev) => [taskToDelete, ...prev]);
        if (user) {
          syncTaskToCloud(user.uid, taskToDelete);
        }
        if (taskToDelete.seriesId) {
          setSchedules((prev) =>
            prev.map((s) =>
              s.id === taskToDelete.seriesId
                ? {
                    ...s,
                    excludedDates: (s.excludedDates || []).filter(
                      (d) => d !== taskToDelete.scheduledDate
                    ),
                  }
                : s
            )
          );
        }
      });
    } else {
      // Delete entire recurring series
      const targetSeriesId = taskToDelete.seriesId;
      const removedSchedule = schedules.find((s) => s.id === targetSeriesId);
      const removedOccurrences = tasks.filter((t) => t.seriesId === targetSeriesId);

      setSchedules((prev) => prev.filter((s) => s.id !== targetSeriesId));
      setTasks((prev) => prev.filter((t) => t.seriesId !== targetSeriesId));
      if (user && targetSeriesId) {
        deleteScheduleFromCloud(user.uid, targetSeriesId);
        removedOccurrences.forEach((occ) => deleteTaskFromCloud(user.uid, occ.id));
      }

      showToast(`Deleted entire recurring schedule "${taskToDelete.title}"`, 'Undo', () => {
        if (removedSchedule) {
          setSchedules((prev) => [removedSchedule, ...prev]);
          if (user) syncScheduleToCloud(user.uid, removedSchedule);
        }
        setTasks((prev) => [...removedOccurrences, ...prev]);
        if (user) {
          removedOccurrences.forEach((occ) => syncTaskToCloud(user.uid, occ));
        }
      });
    }
  };

  const handleDuplicateTask = (task: Task) => {
    const duplicated: Task = {
      ...task,
      id: 'task-' + Date.now(),
      seriesId: undefined, // Duplicates become independent one-time tasks
      title: `${task.title} (Copy)`,
      status: 'pending',
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setTasks((prev) => [duplicated, ...prev]);
    if (user) {
      syncTaskToCloud(user.uid, duplicated);
    }
    showToast(`Duplicated "${task.title}"`);
  };

  // Schedule Management (Pause / Resume / Delete)
  const handleTogglePauseSchedule = (scheduleId: string) => {
    const horizonStart = getTodayString(-60);
    const horizonEnd = getTodayString(120);

    const updatedSchedules = schedules.map((s) =>
      s.id === scheduleId ? { ...s, isPaused: !s.isPaused, updatedAt: new Date().toISOString() } : s
    );
    setSchedules(updatedSchedules);

    const synced = syncOccurrencesForSchedules(updatedSchedules, tasks, horizonStart, horizonEnd);
    setTasks(synced);

    const target = updatedSchedules.find((s) => s.id === scheduleId);
    if (user && target) {
      syncScheduleToCloud(user.uid, target);
    }
    showToast(target?.isPaused ? `Paused schedule "${target.title}"` : `Resumed schedule "${target?.title}"`);
  };

  const handleDeleteSchedule = (scheduleId: string) => {
    const horizonStart = getTodayString(-60);
    const horizonEnd = getTodayString(120);

    const target = schedules.find((s) => s.id === scheduleId);
    const updatedSchedules = schedules.filter((s) => s.id !== scheduleId);
    setSchedules(updatedSchedules);

    // Keep completed or in-progress tasks, remove unstarted occurrences
    setTasks((prev) =>
      prev.filter((t) => t.seriesId !== scheduleId || t.status === 'completed' || t.progress > 0)
    );
    if (user) {
      deleteScheduleFromCloud(user.uid, scheduleId);
    }

    showToast(`Removed recurring schedule "${target?.title || ''}"`);
  };

  // Modal Openers
  const openNewTaskModal = (dateStr?: string, timeStr?: string) => {
    setModalTask(null);
    setModalInitialDate(dateStr || getTodayString(0));
    setModalInitialTime(timeStr || '');
    setIsTaskModalOpen(true);
  };

  const openEditTaskModal = (task: Task) => {
    setModalTask(task);
    setIsTaskModalOpen(true);
  };

  // Habits Toggle
  const handleToggleHabitDate = (habitId: string, dateStr: string) => {
    const today = getTodayString(0);
    const yesterday = getTodayString(-1);

    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== habitId) return h;
        const exists = h.completedDates.includes(dateStr);
        const nextDates = exists
          ? h.completedDates.filter((d) => d !== dateStr)
          : [...h.completedDates, dateStr];

        const streak = calculateHabitStreak(nextDates, today, yesterday);
        const updatedHabit = {
          ...h,
          completedDates: nextDates,
          streak,
        };
        if (!exists) {
          const habitKey = `${h.id}-${dateStr}`;
          if (!celebratedHabitsRef.current.has(habitKey)) {
            celebratedHabitsRef.current.add(habitKey);
            if (shouldTriggerCelebration('habit', settings, showCelebration)) {
              setCelebrationMessage(`Habit streak! "${h.name}" completed.`);
              setShowCelebration(true);
            }
          }
          pushInAppNotification({
            title: `Habit Completed: ${h.name}`,
            message: `Completed for ${dateStr}. Current streak: ${streak} day${streak === 1 ? '' : 's'} 🔥`,
            itemType: 'habit',
            targetId: h.id,
            priority: 'medium',
          });
        } else {
          celebratedHabitsRef.current.delete(`${h.id}-${dateStr}`);
        }
        if (user) {
          syncHabitToCloud(user.uid, updatedHabit);
        }
        return updatedHabit;
      })
    );
  };

  // Synchronize reminders with persistent backend server store
  const syncServerSchedule = useCallback(
    (updatedReminders: Reminder[]) => {
      if (!currentUserId) return;
      authenticatedFetch('/api/reminders/sync-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezone: settings.timezone || getSystemTimezone(),
          reminders: updatedReminders,
        }),
      }).catch(() => {});
    },
    [currentUserId, settings.timezone]
  );

  // Reminder Operations
  const handleSaveReminder = async (saved: Reminder) => {
    let nextReminders: Reminder[] = [];
    setReminders((prev) => {
      const exists = prev.some((r) => r.id === saved.id);
      nextReminders = exists ? prev.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...prev];
      return nextReminders;
    });
    setIsReminderModalOpen(false);
    setEditingReminder(null);
    if (currentUserId) {
      try {
        await syncReminderToCloud(currentUserId, saved);
      } catch (err: any) {
        setCloudSyncError(err?.message || 'Failed to sync reminder to cloud');
      }
      syncServerSchedule(nextReminders);
    }
    showToast(`Reminder "${saved.title}" saved`);
    setTimeout(processRemindersOnServer, 500);
  };

  const handleEditReminder = (reminder: Reminder) => {
    setEditingReminder(reminder);
    setIsReminderModalOpen(true);
  };

  const handleDeleteReminder = async (reminderId: string) => {
    const target = reminders.find((r) => r.id === reminderId);
    const nextReminders = reminders.filter((r) => r.id !== reminderId);
    setReminders(nextReminders);
    if (currentUserId) {
      try {
        await deleteReminderFromCloud(currentUserId, reminderId);
      } catch (err: any) {
        setCloudSyncError(err?.message || 'Failed to delete reminder from cloud');
      }
      syncServerSchedule(nextReminders);
    }
    showToast(`Reminder "${target?.title || ''}" deleted`);
  };

  const handleToggleCompleteReminder = async (reminderId: string) => {
    const target = reminders.find((r) => r.id === reminderId);
    if (!target) return;

    let updated: Reminder;
    if (!target.completed) {
      if (target.repeat && target.repeat !== 'never') {
        const nextOccurrence = getNextReminderOccurrence(
          target.date,
          target.time,
          target.repeat,
          target.customRepeatDays
        );
        updated = {
          ...target,
          date: nextOccurrence.date,
          time: nextOccurrence.time,
          completed: false,
          lastNotifiedAt: undefined,
          emailSentAt: undefined,
        };
        showToast(`Advanced to next occurrence: ${updated.date} at ${updated.time}`);
      } else {
        updated = { ...target, completed: true };
        showToast(`Reminder "${target.title}" completed`);
      }
      if (!celebratedRemindersRef.current.has(reminderId)) {
        celebratedRemindersRef.current.add(reminderId);
        if (shouldTriggerCelebration('reminder', settings, showCelebration)) {
          setCelebrationMessage(`Milestone reached! "${target.title}" completed.`);
          setShowCelebration(true);
        }
      }
      pushInAppNotification({
        title: `Reminder Done: ${target.title}`,
        message: `Scheduled for ${target.time}. Completed!`,
        itemType: 'reminder',
        targetId: target.id,
        priority: target.priority,
      });
    } else {
      celebratedRemindersRef.current.delete(reminderId);
      updated = { ...target, completed: false };
      showToast(`Reminder "${target.title}" reopened`);
    }

    const nextReminders = reminders.map((r) => (r.id === reminderId ? updated : r));
    setReminders(nextReminders);
    if (currentUserId) {
      try {
        await syncReminderToCloud(currentUserId, updated);
      } catch (err: any) {
        setCloudSyncError(err?.message || 'Failed to update reminder in cloud');
      }
      syncServerSchedule(nextReminders);
    }
  };

  const handleSnoozeReminder = async (reminderId: string, minutes: number) => {
    const target = reminders.find((r) => r.id === reminderId);
    if (!target) return;

    const { date, time } = computeSnoozedDateTime(target.date, target.time, minutes);
    const updated: Reminder = {
      ...target,
      date,
      time,
      completed: false,
      lastNotifiedAt: undefined,
      emailSentAt: undefined,
    };

    const nextReminders = reminders.map((r) => (r.id === reminderId ? updated : r));
    setReminders(nextReminders);
    if (currentUserId) {
      try {
        await syncReminderToCloud(currentUserId, updated);
      } catch (err: any) {
        setCloudSyncError(err?.message || 'Failed to snooze reminder');
      }
      syncServerSchedule(nextReminders);
    }
    showToast(`Snoozed until ${time} (${minutes >= 1440 ? 'Tomorrow' : `${minutes}m`})`);
    setTimeout(processRemindersOnServer, 500);
  };

  // Notification Operations
  const handleMarkNotificationAsRead = async (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );
    const target = notifications.find((n) => n.id === notificationId);
    if (currentUserId && target) {
      await syncNotificationToCloud(currentUserId, { ...target, read: true });
    }
  };

  const handleMarkAllNotificationsAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    if (currentUserId) {
      await markAllNotificationsAsReadInCloud(currentUserId);
    }
  };

  const handleDeleteNotification = async (notificationId: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    if (currentUserId) {
      await deleteNotificationFromCloud(currentUserId, notificationId);
    }
  };

  const handleSelectNotificationReminder = (reminderId: string) => {
    setCurrentView('reminders');
    const target = reminders.find((r) => r.id === reminderId);
    if (target) {
      setEditingReminder(target);
      setIsReminderModalOpen(true);
    }
  };

  const handleSelectNotification = (n: InAppNotification) => {
    // 1. Task notification: open task editor modal
    if (n.itemType === 'task' || n.taskId) {
      const targetId = n.taskId || n.targetId;
      const target = tasks.find((t) => t.id === targetId);
      if (target) {
        setModalTask(target);
        setIsTaskModalOpen(true);
      } else {
        setCurrentView('alltasks');
      }
      return;
    }

    // 2. Habit notification: navigate to Habits view
    if (n.itemType === 'habit' || n.habitId) {
      setCurrentView('habits');
      return;
    }

    // 3. Reminder notification: open reminder modal
    const reminderId = n.reminderId || n.targetId;
    setCurrentView('reminders');
    if (reminderId) {
      const target = reminders.find((r) => r.id === reminderId);
      if (target) {
        setEditingReminder(target);
        setIsReminderModalOpen(true);
      }
    }
  };

  const handleTriggerTestInApp = async (): Promise<{ success: boolean; message: string }> => {
    if (!currentUserId) {
      throw new Error('Authentication required to generate notifications.');
    }
    const testNotif: InAppNotification = {
      id: `notif-test-${Date.now()}`,
      userId: currentUserId,
      reminderId: '',
      title: '🔔 Test Notification: In-App System Verified',
      message: 'In-app notification delivery is fully functional, persisted in Firestore, and updating your notification bell in real-time.',
      priority: 'high',
      read: false,
      scheduledFor: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    await syncNotificationToCloud(currentUserId, testNotif);
    setNotifications((prev) => [testNotif, ...prev]);
    showToast('Test notification saved to Firestore!');
    return {
      success: true,
      message: 'Test notification created and stored in Firestore. Check the bell icon in the header!',
    };
  };

  const handleSaveTimetableTemplate = async (template: TimetableTemplate) => {
    setTimetableTemplates((prev) => {
      const idx = prev.findIndex((t) => t.id === template.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = template;
        return copy;
      }
      return [...prev, template];
    });

    if (currentUserId) {
      const updated = [...timetableTemplates.filter((t) => t.id !== template.id), template];
      saveUserStoredTimetableTemplates(currentUserId, updated);
      try {
        await syncTimetableTemplateToCloud(currentUserId, template);
      } catch (err: any) {
        setCloudSyncError(err?.message || 'Failed to sync timetable template');
      }
    }
    showToast(`Template "${template.name}" saved!`);
  };

  const handleDeleteTimetableTemplate = async (templateId: string) => {
    setTimetableTemplates((prev) => prev.filter((t) => t.id !== templateId));
    if (currentUserId) {
      const updated = timetableTemplates.filter((t) => t.id !== templateId);
      saveUserStoredTimetableTemplates(currentUserId, updated);
      try {
        await deleteTimetableTemplateFromCloud(currentUserId, templateId);
      } catch (err: any) {
        setCloudSyncError(err?.message || 'Failed to delete template from cloud');
      }
    }
    showToast('Template deleted');
  };

  const handleApplyTimetableSlotsToSchedule = async (
    slots: TimetableSlot[],
    targetDates: string[]
  ) => {
    const newTasks: Task[] = [];
    for (const date of targetDates) {
      for (const slot of slots) {
        const newTask: Task = {
          id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          title: slot.title || 'Focus Session',
          description: slot.notes || '',
          scheduledDate: date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          categoryId: slot.categoryId || categories[0]?.id || 'general',
          priority: slot.priority || 'medium',
          status: 'pending',
          progress: 0,
          subtasks: [],
          notes: slot.notes || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        newTasks.push(newTask);
      }
    }

    if (newTasks.length === 0) return;

    setTasks((prev) => [...prev, ...newTasks]);

    if (currentUserId) {
      const updated = [...tasks, ...newTasks];
      saveUserStoredTasks(currentUserId, updated);
      try {
        for (const t of newTasks) {
          await syncTaskToCloud(currentUserId, t);
        }
      } catch (err: any) {
        setCloudSyncError(err?.message || 'Failed to sync scheduled timetable tasks');
      }
    }

    showToast(`Scheduled ${newTasks.length} time block${newTasks.length > 1 ? 's' : ''}!`);
  };

  const handleSignOut = async () => {
    // Immediately clear in-memory workspace state to guarantee zero residue
    setSchedules([]);
    setTasks([]);
    setCategories([]);
    setHabits([]);
    setReminders([]);
    setNotifications([]);
    setTimetableTemplates([]);
    setWeeklyReviews({});
    setIsWorkspaceLoaded(false);
    setIsWorkspaceLoading(false);
    setCloudSyncError(null);
    setCurrentView('dashboard');
    await signOut();
  };

  // Route Protection: Unauthenticated users are redirected to the Google Sign-in screen
  if (loading || (user && isWorkspaceLoading && !isWorkspaceLoaded)) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#FAF8FE] dark:bg-[#0F172A]">
        <div className="flex flex-col items-center gap-3">
          <img
            src="/ombhi-icon.png"
            alt="OmBhi"
            className="h-12 w-12 rounded-xl object-contain shadow-xs animate-pulse"
          />
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-[#6657E8]/20 border-t-[#6657E8]" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Loading your OmBhi workspace...</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">Retrieving latest tasks & habits from Firestore</p>
          {cloudSyncError && (
            <div className="mt-4 max-w-sm rounded-xl border border-rose-200 bg-rose-50 p-4 text-center text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
              <p className="font-bold">Sync Notice</p>
              <p className="mt-1">{formatCloudSyncError(cloudSyncError)}</p>
              <button
                type="button"
                onClick={() => {
                  if (currentUserId) {
                    setIsWorkspaceLoading(true);
                    setCloudSyncError(null);
                    Promise.all([
                      fetchUserTasks(currentUserId),
                      fetchUserSchedules(currentUserId),
                      fetchUserHabits(currentUserId),
                      fetchUserCategories(currentUserId),
                    ])
                      .then(([cloudTasks, cloudSchedules, cloudHabits, cloudCategories]) => {
                        setSchedules(cloudSchedules);
                        setTasks(cloudTasks);
                        setHabits(cloudHabits);
                        setCategories(cloudCategories);
                        setIsWorkspaceLoaded(true);
                        setIsWorkspaceLoading(false);
                        setCurrentView('dashboard');
                      })
                      .catch((e: any) => {
                        setCloudSyncError(e?.message || 'Connection failed');
                        setIsWorkspaceLoading(false);
                      });
                  }
                }}
                className="mt-3 rounded-lg bg-rose-600 px-3 py-1.5 font-semibold text-white hover:bg-rose-700"
              >
                Retry Loading
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-[#FAF8FE] dark:bg-[#0F172A]">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-[#6657E8]/20 border-t-[#6657E8]" />
          </div>
        }
      >
        <SignInView />
      </Suspense>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#FAF8FE] text-[#172033] antialiased transition-colors duration-150 dark:bg-[#0F172A] dark:text-[#F1F5F9]">
      {/* Desktop Sidebar */}
      <Sidebar
        currentView={currentView}
        onNavigate={setCurrentView}
        onQuickAdd={() => openNewTaskModal()}
        onAIQuickAdd={() => setIsNLModalOpen(true)}
        settings={settings}
        onToggleTheme={() =>
          setSettings((s) => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }))
        }
        user={user}
        onSignOut={handleSignOut}
        unreadNotificationsCount={unreadNotificationsCount}
      />

      {/* Main View Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Top Header */}
        <MobileHeader
          onQuickAdd={() => openNewTaskModal()}
          settings={settings}
          onToggleTheme={() =>
            setSettings((s) => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }))
          }
          onSignOut={handleSignOut}
          notificationCenterNode={
            <NotificationCenter
              notifications={notifications}
              onMarkAsRead={handleMarkNotificationAsRead}
              onMarkAllAsRead={handleMarkAllNotificationsAsRead}
              onDeleteNotification={handleDeleteNotification}
              onSelectReminder={handleSelectNotificationReminder}
            />
          }
        />

        {/* View Content Port */}
        <main
          aria-label="Main Content"
          className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8"
        >
          {/* Top-Right Corner Live Date & Time Tracker & Sync Notice */}
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {cloudSyncError ? (
              <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                <span className="font-semibold">Cloud Sync Notice:</span>
                <span className="line-clamp-1">{formatCloudSyncError(cloudSyncError)}</span>
                <button
                  type="button"
                  onClick={() => setCloudSyncError(null)}
                  className="ml-auto text-xs underline hover:no-underline"
                >
                  Dismiss
                </button>
              </div>
            ) : <div />}

            <div className="flex items-center gap-2.5 self-end">
              <NotificationCenter
                notifications={notifications}
                onMarkAsRead={handleMarkNotificationAsRead}
                onMarkAllAsRead={handleMarkAllNotificationsAsRead}
                onDeleteNotification={handleDeleteNotification}
                onSelectReminder={handleSelectNotificationReminder}
                onSelectNotification={handleSelectNotification}
              />

              <div
                aria-label="Current Live Date and Time"
                className="flex items-center gap-2.5 rounded-xl border border-purple-100/90 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs backdrop-blur-md dark:border-slate-800 dark:bg-[#1E293B]/95 dark:text-gray-200"
              >
                <div className="flex items-center gap-1.5 text-[#6657E8] dark:text-[#A59DF7]">
                  <Clock className="h-3.5 w-3.5 animate-pulse" />
                  <span className="tabular-nums font-mono text-xs">{formattedDateTime.timePart}</span>
                </div>
                <span className="text-gray-300 dark:text-slate-700">•</span>
                <span className="text-gray-600 dark:text-gray-300">{formattedDateTime.datePart}</span>
              </div>
            </div>
          </div>

          <div className="mx-auto max-w-5xl space-y-6">
            <Suspense fallback={<ViewLoadingFallback />}>
              {currentView === 'dashboard' && (
              <DashboardView
                tasks={tasks}
                categories={categories}
                habits={habits}
                settings={settings}
                savedReviews={weeklyReviews}
                onNavigateToReview={() => setCurrentView('review')}
                onNavigateToTimetable={() => setCurrentView('timetable')}
                onOpenNewTask={openNewTaskModal}
                onEditTask={openEditTaskModal}
                onCompleteTask={handleCompleteTask}
                onFailSkipClick={(t) => setFailSkipTask(t)}
                onUpdateProgress={handleUpdateProgress}
                onDeleteTask={handleDeleteTaskRequest}
                onDuplicateTask={handleDuplicateTask}
                onRescheduleTask={(t) => setRescheduleTargetTask(t)}
              />
            )}

            {currentView === 'myday' && (
              <MyDayView
                tasks={tasks}
                categories={categories}
                settings={settings}
                onOpenNewTask={openNewTaskModal}
                onEditTask={openEditTaskModal}
                onCompleteTask={handleCompleteTask}
                onFailSkipClick={(t) => setFailSkipTask(t)}
                onUpdateProgress={handleUpdateProgress}
                onDeleteTask={handleDeleteTaskRequest}
                onDuplicateTask={handleDuplicateTask}
                onOpenTimetable={() => setCurrentView('timetable')}
                onOpenDayPlanner={(d) => {
                  setDayPlannerDate(d);
                  setIsDayPlannerOpen(true);
                }}
                onRescheduleTask={(t) => setRescheduleTargetTask(t)}
              />
            )}

            {currentView === 'calendar' && (
              <CalendarView
                tasks={tasks}
                categories={categories}
                settings={settings}
                onOpenNewTask={openNewTaskModal}
                onEditTask={openEditTaskModal}
                onCompleteTask={handleCompleteTask}
                onFailSkipClick={(t) => setFailSkipTask(t)}
                onUpdateProgress={handleUpdateProgress}
              />
            )}

            {currentView === 'timetable' && (
              <TimetableView
                categories={categories}
                settings={settings}
                templates={timetableTemplates}
                onSaveTemplate={handleSaveTimetableTemplate}
                onDeleteTemplate={handleDeleteTimetableTemplate}
                onApplySlotsToSchedule={handleApplyTimetableSlotsToSchedule}
                onNavigateToTasks={() => setCurrentView('myday')}
              />
            )}

            {currentView === 'alltasks' && (
              <AllTasksView
                tasks={tasks}
                categories={categories}
                settings={settings}
                onOpenNewTask={() => openNewTaskModal()}
                onEditTask={openEditTaskModal}
                onCompleteTask={handleCompleteTask}
                onFailSkipClick={(t) => setFailSkipTask(t)}
                onUpdateProgress={handleUpdateProgress}
                onDeleteTask={handleDeleteTaskRequest}
                onDuplicateTask={handleDuplicateTask}
                onRescheduleTask={(t) => setRescheduleTargetTask(t)}
              />
            )}

            {currentView === 'habits' && (
              <HabitsView
                habits={habits}
                categories={categories}
                onToggleHabitDate={handleToggleHabitDate}
                onAddHabit={async (newHabit) => {
                  setHabits((prev) => [...prev, newHabit]);
                  if (user) {
                    try {
                      await syncHabitToCloud(user.uid, newHabit);
                    } catch (err: any) {
                      setCloudSyncError(err?.message || 'Failed to save habit to Firestore');
                    }
                  }
                  showToast(`Added habit "${newHabit.name}"`);
                }}
                onDeleteHabit={async (id) => {
                  setHabits((prev) => prev.filter((h) => h.id !== id));
                  if (user) {
                    try {
                      await deleteHabitFromCloud(user.uid, id);
                    } catch (err: any) {
                      setCloudSyncError(err?.message || 'Failed to delete habit from Firestore');
                    }
                  }
                  showToast('Habit removed');
                }}
              />
            )}

            {currentView === 'analytics' && (
              <AnalyticsView
                tasks={tasks}
                categories={categories}
                onNavigateToReview={() => setCurrentView('review')}
              />
            )}

            {currentView === 'review' && (
              <WeeklyReviewView
                tasks={tasks}
                categories={categories}
                habits={habits}
                savedReviews={weeklyReviews}
                onSaveReview={handleSaveReview}
                onNavigateToCalendar={() => setCurrentView('calendar')}
              />
            )}

            {currentView === 'coach' && (
              <ConsistencyCoachView
                tasks={tasks}
                habits={habits}
                categories={categories}
                onOpenNewTask={() => setIsNLModalOpen(true)}
              />
            )}

            {currentView === 'categories' && (
              <CategoriesView
                categories={categories}
                tasks={tasks}
                onAddCategory={async (cat) => {
                  setCategories((prev) => [...prev, cat]);
                  if (user) {
                    try {
                      await syncCategoryToCloud(user.uid, cat);
                    } catch (err: any) {
                      setCloudSyncError(err?.message || 'Failed to save category to Firestore');
                    }
                  }
                }}
                onUpdateCategory={async (cat) => {
                  setCategories((prev) => prev.map((c) => (c.id === cat.id ? cat : c)));
                  if (user) {
                    try {
                      await syncCategoryToCloud(user.uid, cat);
                    } catch (err: any) {
                      setCloudSyncError(err?.message || 'Failed to update category in Firestore');
                    }
                  }
                }}
                onDeleteCategory={async (catId) => {
                  setCategories((prev) => prev.filter((c) => c.id !== catId));
                  if (user) {
                    try {
                      await deleteCategoryFromCloud(user.uid, catId);
                    } catch (err: any) {
                      setCloudSyncError(err?.message || 'Failed to delete category from Firestore');
                    }
                  }
                  showToast('Category removed');
                }}
              />
            )}

            {currentView === 'reminders' && (
              <RemindersView
                reminders={reminders}
                categories={categories}
                settings={settings}
                onOpenCreateReminder={() => {
                  setEditingReminder(null);
                  setIsReminderModalOpen(true);
                }}
                onEditReminder={handleEditReminder}
                onDeleteReminder={handleDeleteReminder}
                onToggleComplete={handleToggleCompleteReminder}
                onSnooze={handleSnoozeReminder}
                onAddCategory={async (cat: Category) => {
                  setCategories((prev) => [...prev, cat]);
                  if (user) {
                    try {
                      await syncCategoryToCloud(user.uid, cat);
                    } catch (err: any) {
                      setCloudSyncError(err?.message || 'Failed to save category');
                    }
                  }
                }}
              />
            )}

            {currentView === 'settings' && (
              <SettingsView
                settings={settings}
                onUpdateSettings={setSettings}
                tasks={tasks}
                schedules={schedules}
                categories={categories}
                habits={habits}
                reminders={reminders}
                user={user}
                onSignOut={handleSignOut}
                onTestInAppNotification={handleTriggerTestInApp}
                onTogglePauseSchedule={handleTogglePauseSchedule}
                onDeleteSchedule={handleDeleteSchedule}
                onImportBackup={(imported) => {
                  const importedReminders = (imported.reminders || []).map((r) => ({
                    ...r,
                    userId: currentUserId || '',
                  }));
                  setTasks(imported.tasks);
                  if (imported.schedules) setSchedules(imported.schedules);
                  setCategories(imported.categories);
                  setHabits(imported.habits);
                  setSettings(imported.settings);
                  if (imported.reminders) setReminders(importedReminders);

                  if (currentUserId) {
                    saveUserStoredTasks(currentUserId, imported.tasks);
                    if (imported.schedules) saveUserStoredSchedules(currentUserId, imported.schedules);
                    saveUserStoredCategories(currentUserId, imported.categories);
                    saveUserStoredHabits(currentUserId, imported.habits);
                    saveUserStoredSettings(currentUserId, imported.settings);
                    if (imported.reminders) saveUserStoredReminders(currentUserId, importedReminders);

                    imported.categories.forEach((c) => syncCategoryToCloud(currentUserId, c).catch(() => {}));
                    (imported.schedules || []).forEach((s) => syncScheduleToCloud(currentUserId, s).catch(() => {}));
                    imported.tasks.forEach((t) => syncTaskToCloud(currentUserId, t).catch(() => {}));
                    imported.habits.forEach((h) => syncHabitToCloud(currentUserId, h).catch(() => {}));
                    importedReminders.forEach((r) => syncReminderToCloud(currentUserId, r).catch(() => {}));
                  }
                  showToast('Backup successfully imported!');
                }}
                onClearAllData={() => {
                  if (currentUserId) {
                    tasks.forEach((t) => deleteTaskFromCloud(currentUserId, t.id));
                    schedules.forEach((s) => deleteScheduleFromCloud(currentUserId, s.id));
                    habits.forEach((h) => deleteHabitFromCloud(currentUserId, h.id));
                    categories.forEach((c) => deleteCategoryFromCloud(currentUserId, c.id));
                    reminders.forEach((r) => deleteReminderFromCloud(currentUserId, r.id));
                    notifications.forEach((n) => deleteNotificationFromCloud(currentUserId, n.id));
                    timetableTemplates.forEach((tmpl) =>
                      deleteTimetableTemplateFromCloud(currentUserId, tmpl.id)
                    );
                    clearUserStoredData(currentUserId);
                  }
                  setSchedules([]);
                  setTasks([]);
                  setCategories([]);
                  setHabits([]);
                  setReminders([]);
                  setNotifications([]);
                  setTimetableTemplates([]);
                  showToast('Workspace cleared.');
                }}
              />
            )}
            </Suspense>
          </div>
        </main>

        {/* Mobile Bottom Navigation Bar */}
        <MobileBottomBar
          currentView={currentView}
          onNavigate={setCurrentView}
        />
      </div>

      <Suspense fallback={null}>
        {/* Task Creation / Editing Modal */}
        {isTaskModalOpen && (
        <TaskModal
          task={modalTask}
          initialDate={modalInitialDate}
          initialTime={modalInitialTime}
          categories={categories}
          onClose={() => setIsTaskModalOpen(false)}
          onSave={handleSaveTask}
        />
      )}

      {/* Fail / Skip Status Modal */}
      {failSkipTask && (
        <FailSkipModal
          task={failSkipTask}
          onClose={() => setFailSkipTask(null)}
          onConfirm={handleConfirmFailSkip}
          onSmartReschedule={(t) => {
            setFailSkipTask(null);
            setRescheduleTargetTask(t);
          }}
        />
      )}

      {/* Natural Language Task Creation Modal */}
      {isNLModalOpen && (
        <NaturalLanguageTaskModal
          categories={categories}
          initialReferenceDate={getTodayString(0)}
          onClose={() => setIsNLModalOpen(false)}
          onSaveTask={handleSaveTask}
        />
      )}

      {/* AI Day Planner Modal */}
      {isDayPlannerOpen && (
        <AIDayPlannerModal
          date={dayPlannerDate}
          tasks={tasks}
          timeFormat24h={settings.timeFormat24h}
          onClose={() => setIsDayPlannerOpen(false)}
          onApplyPlan={handleApplyDayPlan}
        />
      )}

      {/* Smart Reschedule Modal */}
      {rescheduleTargetTask && (
        <SmartRescheduleModal
          task={rescheduleTargetTask}
          allTasks={tasks}
          timeFormat24h={settings.timeFormat24h}
          onClose={() => setRescheduleTargetTask(null)}
          onConfirmReschedule={handleConfirmReschedule}
        />
      )}

      {/* Delete Scope Modal (This occurrence vs Entire recurring series) */}
      {deleteScopeTask && (
        <DeleteScopeModal
          task={deleteScopeTask}
          onClose={() => setDeleteScopeTask(null)}
          onSelectScope={handleConfirmDeleteScope}
        />
      )}

      {/* Reminder Creation / Editing Modal */}
      {isReminderModalOpen && (
        <ReminderModal
          isOpen={isReminderModalOpen}
          reminder={editingReminder}
          categories={categories}
          settings={settings}
          userId={currentUserId || ''}
          onClose={() => {
            setIsReminderModalOpen(false);
            setEditingReminder(null);
          }}
          onSave={handleSaveReminder}
          onAddCategory={async (cat: Category) => {
            setCategories((prev) => [...prev, cat]);
            if (user) {
              try {
                await syncCategoryToCloud(user.uid, cat);
              } catch (err: any) {
                setCloudSyncError(err?.message || 'Failed to save category');
              }
            }
          }}
        />
      )}
      </Suspense>

      {/* Subtle Milestone Celebration (stops strictly within 3 seconds) */}
      <CelebrationBurst
        active={showCelebration}
        onComplete={handleCelebrationComplete}
        durationMs={CELEBRATION_DURATION_MS}
        message={celebrationMessage}
      />

      {/* Toast Notification with Undo */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-6 bottom-16 z-50 flex items-center gap-3 rounded-2xl bg-[#172033] px-4 py-2.5 text-xs font-semibold text-white shadow-xl md:bottom-6 dark:bg-white dark:text-[#172033]"
        >
          <span>{toast.text}</span>
          {toast.actionText && toast.onAction && (
            <button
              type="button"
              onClick={() => {
                toast.onAction?.();
                setToast(null);
              }}
              className="text-[#A59DF7] underline hover:opacity-80 dark:text-[#6657E8]"
            >
              {toast.actionText}
            </button>
          )}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="opacity-70 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SchedulerApp />
    </AuthProvider>
  );
}

