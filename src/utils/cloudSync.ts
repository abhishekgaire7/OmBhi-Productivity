import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { Category, Habit, InAppNotification, RecurringSchedule, Reminder, Task, TimetableTemplate } from '../types';
import { computeNextRunAtUtcMs } from '../shared/reminderScheduler';

/**
 * Recursively cleans an object for Cloud Firestore:
 * 1. Drops any keys with value `undefined`.
 * 2. Recursively cleans nested objects and arrays.
 * 3. Never produces undefined fields or invalid nested values.
 */
export function sanitizeForFirestore<T extends Record<string, any>>(obj: T): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) {
      continue;
    }
    if (val !== null && typeof val === 'object') {
      if (Array.isArray(val)) {
        cleaned[key] = val
          .filter((item) => item !== undefined)
          .map((item) => (item !== null && typeof item === 'object' ? sanitizeForFirestore(item) : item));
      } else {
        cleaned[key] = sanitizeForFirestore(val);
      }
    } else {
      cleaned[key] = val;
    }
  }
  return cleaned;
}

/**
 * Checks if the user is authenticated in Firebase Auth before making Firestore network requests
 */
function isFirebaseAuthReady(userId: string): boolean {
  return Boolean(auth.currentUser && auth.currentUser.uid === userId);
}

/**
 * Loads tasks belonging exclusively to this authenticated user
 */
export async function fetchUserTasks(userId: string): Promise<Task[]> {
  if (!isFirebaseAuthReady(userId)) return [];
  const path = `users/${userId}/tasks`;
  try {
    const colRef = collection(db, 'users', userId, 'tasks');
    const snapshot = await getDocs(colRef);
    const tasks: Task[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      tasks.push({
        ...data,
        id: d.id,
        progress: typeof data.progress === 'number' ? data.progress : 0,
        subtasks: Array.isArray(data.subtasks) ? data.subtasks : [],
      } as Task);
    });
    return tasks;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

/**
 * Persists a task to the user's isolated subcollection without undefined fields
 */
export async function syncTaskToCloud(userId: string, task: Task): Promise<void> {
  if (!isFirebaseAuthReady(userId)) return;
  const path = `users/${userId}/tasks/${task.id}`;
  try {
    const docRef = doc(db, 'users', userId, 'tasks', task.id);
    const payload = sanitizeForFirestore({
      id: task.id,
      title: task.title || '',
      description: task.description ?? '',
      scheduledDate: task.scheduledDate,
      startTime: task.startTime ?? '',
      endTime: task.endTime ?? '',
      categoryId: task.categoryId || '',
      priority: task.priority || 'medium',
      status: task.status || 'pending',
      progress: typeof task.progress === 'number' ? task.progress : 0,
      subtasks: task.subtasks || [],
      notes: task.notes ?? '',
      recurrence: task.recurrence || 'none',
      recurrenceDays: task.recurrenceDays,
      scheduleSummary: task.scheduleSummary,
      seriesId: task.seriesId,
      isDetached: task.isDetached,
      createdAt: task.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId,
    });
    await setDoc(docRef, payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Deletes a task from the user's isolated subcollection
 */
export async function deleteTaskFromCloud(userId: string, taskId: string): Promise<void> {
  if (!isFirebaseAuthReady(userId)) return;
  const path = `users/${userId}/tasks/${taskId}`;
  try {
    const docRef = doc(db, 'users', userId, 'tasks', taskId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Loads recurring schedules belonging exclusively to this authenticated user
 */
export async function fetchUserSchedules(userId: string): Promise<RecurringSchedule[]> {
  if (!isFirebaseAuthReady(userId)) return [];
  const path = `users/${userId}/schedules`;
  try {
    const colRef = collection(db, 'users', userId, 'schedules');
    const snapshot = await getDocs(colRef);
    const schedules: RecurringSchedule[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      schedules.push({
        ...data,
        id: d.id,
        subtasks: Array.isArray(data.subtasks) ? data.subtasks : [],
        excludedDates: Array.isArray(data.excludedDates) ? data.excludedDates : [],
      } as RecurringSchedule);
    });
    return schedules;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

/**
 * Persists a recurring schedule to cloud without undefined fields
 */
export async function syncScheduleToCloud(
  userId: string,
  schedule: RecurringSchedule
): Promise<void> {
  if (!isFirebaseAuthReady(userId)) return;
  const path = `users/${userId}/schedules/${schedule.id}`;
  try {
    const docRef = doc(db, 'users', userId, 'schedules', schedule.id);
    const payload = sanitizeForFirestore({
      id: schedule.id,
      title: schedule.title || '',
      description: schedule.description ?? '',
      startTime: schedule.startTime ?? '',
      endTime: schedule.endTime ?? '',
      categoryId: schedule.categoryId || '',
      priority: schedule.priority || 'medium',
      subtasks: schedule.subtasks || [],
      notes: schedule.notes ?? '',
      scheduleMode: schedule.scheduleMode || 'repeat',
      frequency: schedule.frequency,
      recurrenceDays: schedule.recurrenceDays,
      specificDates: schedule.specificDates,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      isPaused: Boolean(schedule.isPaused),
      excludedDates: schedule.excludedDates || [],
      createdAt: schedule.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId,
    });
    await setDoc(docRef, payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Deletes a recurring schedule from cloud
 */
export async function deleteScheduleFromCloud(
  userId: string,
  scheduleId: string
): Promise<void> {
  if (!isFirebaseAuthReady(userId)) return;
  const path = `users/${userId}/schedules/${scheduleId}`;
  try {
    const docRef = doc(db, 'users', userId, 'schedules', scheduleId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Loads habits belonging exclusively to this authenticated user
 */
export async function fetchUserHabits(userId: string): Promise<Habit[]> {
  if (!isFirebaseAuthReady(userId)) return [];
  const path = `users/${userId}/habits`;
  try {
    const colRef = collection(db, 'users', userId, 'habits');
    const snapshot = await getDocs(colRef);
    const habits: Habit[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      habits.push({
        ...data,
        id: d.id,
        completedDates: Array.isArray(data.completedDates) ? data.completedDates : [],
        streak: typeof data.streak === 'number' ? data.streak : 0,
        notes: data.notes ?? '',
      } as Habit);
    });
    return habits;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

/**
 * Persists a habit to cloud with zero undefined fields (notes is string, never undefined)
 */
export async function syncHabitToCloud(userId: string, habit: Habit): Promise<void> {
  if (!isFirebaseAuthReady(userId)) return;
  const path = `users/${userId}/habits/${habit.id}`;
  try {
    const docRef = doc(db, 'users', userId, 'habits', habit.id);
    const payload = sanitizeForFirestore({
      id: habit.id,
      name: habit.name || '',
      categoryId: habit.categoryId || '',
      frequency: habit.frequency || 'daily',
      targetDaysPerWeek: habit.targetDaysPerWeek || 7,
      completedDates: habit.completedDates || [],
      streak: typeof habit.streak === 'number' ? habit.streak : 0,
      notes: habit.notes ?? '',
      userId,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(docRef, payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Deletes a habit from cloud
 */
export async function deleteHabitFromCloud(userId: string, habitId: string): Promise<void> {
  if (!isFirebaseAuthReady(userId)) return;
  const path = `users/${userId}/habits/${habitId}`;
  try {
    const docRef = doc(db, 'users', userId, 'habits', habitId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Loads categories belonging to this authenticated user
 */
export async function fetchUserCategories(userId: string): Promise<Category[]> {
  if (!isFirebaseAuthReady(userId)) return [];
  const path = `users/${userId}/categories`;
  try {
    const colRef = collection(db, 'users', userId, 'categories');
    const snapshot = await getDocs(colRef);
    const categories: Category[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      categories.push({
        ...data,
        id: d.id,
      } as Category);
    });
    return categories;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

/**
 * Persists a category to cloud
 */
export async function syncCategoryToCloud(userId: string, category: Category): Promise<void> {
  if (!isFirebaseAuthReady(userId)) return;
  const path = `users/${userId}/categories/${category.id}`;
  try {
    const docRef = doc(db, 'users', userId, 'categories', category.id);
    const payload = sanitizeForFirestore({
      id: category.id,
      name: category.name || '',
      color: category.color || '#6657E8',
      userId,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(docRef, payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Deletes a category from cloud
 */
export async function deleteCategoryFromCloud(userId: string, categoryId: string): Promise<void> {
  if (!isFirebaseAuthReady(userId)) return;
  const path = `users/${userId}/categories/${categoryId}`;
  try {
    const docRef = doc(db, 'users', userId, 'categories', categoryId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Loads reminders belonging exclusively to this authenticated user
 */
export async function fetchUserReminders(userId: string): Promise<Reminder[]> {
  if (!isFirebaseAuthReady(userId)) return [];
  const path = `users/${userId}/reminders`;
  try {
    const colRef = collection(db, 'users', userId, 'reminders');
    const snapshot = await getDocs(colRef);
    const reminders: Reminder[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      reminders.push({
        ...data,
        id: d.id,
        completed: Boolean(data.completed),
        priority: data.priority || 'medium',
        repeat: data.repeat || 'never',
        notificationMethod: data.notificationMethod || 'both',
      } as Reminder);
    });
    return reminders;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

/**
 * Persists a reminder to the user's isolated subcollection without undefined fields
 */
export async function syncReminderToCloud(userId: string, reminder: Reminder): Promise<void> {
  if (!isFirebaseAuthReady(userId)) return;
  const path = `users/${userId}/reminders/${reminder.id}`;
  try {
    const docRef = doc(db, 'users', userId, 'reminders', reminder.id);
    const payload = sanitizeForFirestore({
      id: reminder.id,
      title: reminder.title || '',
      description: reminder.description ?? '',
      date: reminder.date,
      time: reminder.time,
      categoryId: reminder.categoryId || 'rem-cat-personal',
      priority: reminder.priority || 'medium',
      repeat: reminder.repeat || 'never',
      customRepeatDays: reminder.customRepeatDays ?? [],
      notificationMethod: reminder.notificationMethod || 'both',
      completed: Boolean(reminder.completed),
      completedAt: reminder.completedAt ?? null,
      snoozedUntil: reminder.snoozedUntil ?? null,
      lastNotifiedAt: reminder.lastNotifiedAt ?? null,
      emailSentAt: reminder.emailSentAt ?? null,
      timezone: reminder.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      nextRunAtUtcMs: computeNextRunAtUtcMs(
        reminder,
        reminder.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
      ),
      createdAt: reminder.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId,
    });
    await setDoc(docRef, payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Deletes a reminder from the user's subcollection
 */
export async function deleteReminderFromCloud(userId: string, reminderId: string): Promise<void> {
  if (!isFirebaseAuthReady(userId)) return;
  const path = `users/${userId}/reminders/${reminderId}`;
  try {
    const docRef = doc(db, 'users', userId, 'reminders', reminderId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Loads in-app notifications belonging exclusively to this authenticated user
 */
export async function fetchUserNotifications(userId: string): Promise<InAppNotification[]> {
  if (!isFirebaseAuthReady(userId)) return [];
  const path = `users/${userId}/notifications`;
  try {
    const colRef = collection(db, 'users', userId, 'notifications');
    const snapshot = await getDocs(colRef);
    const notifications: InAppNotification[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      notifications.push({
        ...data,
        id: d.id,
        read: Boolean(data.read),
      } as InAppNotification);
    });
    return notifications;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

/**
 * Persists an in-app notification to the user's isolated subcollection
 */
export async function syncNotificationToCloud(
  userId: string,
  notification: InAppNotification
): Promise<void> {
  if (!isFirebaseAuthReady(userId)) return;
  const path = `users/${userId}/notifications/${notification.id}`;
  try {
    const docRef = doc(db, 'users', userId, 'notifications', notification.id);
    const payload = sanitizeForFirestore({
      id: notification.id,
      userId,
      reminderId: notification.reminderId || '',
      title: notification.title || '',
      message: notification.message || '',
      priority: notification.priority || 'medium',
      read: Boolean(notification.read),
      scheduledFor: notification.scheduledFor || new Date().toISOString(),
      createdAt: notification.createdAt || new Date().toISOString(),
    });
    await setDoc(docRef, payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Deletes an in-app notification from the user's subcollection
 */
export async function deleteNotificationFromCloud(
  userId: string,
  notificationId: string
): Promise<void> {
  if (!isFirebaseAuthReady(userId)) return;
  const path = `users/${userId}/notifications/${notificationId}`;
  try {
    const docRef = doc(db, 'users', userId, 'notifications', notificationId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Marks all notifications as read in Firestore
 */
export async function markAllNotificationsAsReadInCloud(
  userId: string,
  notificationIds?: string[]
): Promise<void> {
  if (!isFirebaseAuthReady(userId)) return;
  let idsToUpdate = notificationIds;
  if (!idsToUpdate) {
    try {
      const colRef = collection(db, 'users', userId, 'notifications');
      const snapshot = await getDocs(colRef);
      idsToUpdate = snapshot.docs.map((d) => d.id);
    } catch {
      return;
    }
  }
  await Promise.all(
    idsToUpdate.map(async (id) => {
      try {
        const docRef = doc(db, 'users', userId, 'notifications', id);
        await setDoc(docRef, { read: true }, { merge: true });
      } catch {
        // Continue on individual failure
      }
    })
  );
}

/**
 * Loads timetable templates belonging exclusively to this authenticated user
 */
export async function fetchUserTimetableTemplates(userId: string): Promise<TimetableTemplate[]> {
  if (!isFirebaseAuthReady(userId)) return [];
  const path = `users/${userId}/timetableTemplates`;
  try {
    const colRef = collection(db, 'users', userId, 'timetableTemplates');
    const snapshot = await getDocs(colRef);
    const templates: TimetableTemplate[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      templates.push({
        ...data,
        id: d.id,
        slots: Array.isArray(data.slots) ? data.slots : [],
      } as TimetableTemplate);
    });
    return templates;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

/**
 * Synchronizes a timetable template to Firestore
 */
export async function syncTimetableTemplateToCloud(
  userId: string,
  template: TimetableTemplate
): Promise<void> {
  if (!isFirebaseAuthReady(userId)) return;
  const path = `users/${userId}/timetableTemplates/${template.id}`;
  try {
    const payload = sanitizeForFirestore({
      ...template,
      userId,
      updatedAt: new Date().toISOString(),
    });
    const docRef = doc(db, 'users', userId, 'timetableTemplates', template.id);
    await setDoc(docRef, payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Deletes a timetable template from Firestore
 */
export async function deleteTimetableTemplateFromCloud(
  userId: string,
  templateId: string
): Promise<void> {
  if (!isFirebaseAuthReady(userId)) return;
  const path = `users/${userId}/timetableTemplates/${templateId}`;
  try {
    const docRef = doc(db, 'users', userId, 'timetableTemplates', templateId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

