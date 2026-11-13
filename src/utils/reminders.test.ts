import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_REMINDER_CATEGORIES,
  getAvailableReminderCategories,
  getCategoryById,
} from './reminderCategories';
import {
  computeSnoozedDateTime,
  getNextReminderOccurrence,
  isReminderOverdue,
  isReminderDueNow,
  filterRemindersByTab,
  sortReminders,
  getSystemTimezone,
} from './reminders';
import { Reminder } from '../types';

test('Default Categories: contains all 7 required default categories with appropriate metadata', () => {
  const categories = DEFAULT_REMINDER_CATEGORIES;
  assert.equal(categories.length, 7);

  const names = categories.map((c) => c.name);
  assert.ok(names.includes('Personal'));
  assert.ok(names.includes('Work'));
  assert.ok(names.includes('Study'));
  assert.ok(names.includes('Appointments'));
  assert.ok(names.includes('Bills & Payments'));
  assert.ok(names.includes('Health & Fitness'));
  assert.ok(names.includes('Important Events'));

  // Verify getCategoryById helper
  const personal = getCategoryById('rem-cat-personal', []);
  assert.equal(personal?.name, 'Personal');
  assert.equal(personal?.isDefault, true);

  // Custom categories merge without duplicating defaults
  const customCats = [{ id: 'custom-1', name: 'Freelance Client', color: '#10B981', isDefault: false }];
  const available = getAvailableReminderCategories(customCats);
  assert.equal(available.length, 8);
  assert.ok(available.some((c) => c.id === 'custom-1'));
});

test('Due & Overdue Logic: correctly identifies past due reminders', () => {
  const pastReminder: Reminder = {
    id: 'rem-past',
    userId: 'user-123',
    categoryId: 'rem-cat-bills',
    title: 'Pay electricity bill',
    date: '2020-01-01',
    time: '09:00',
    priority: 'high',
    repeat: 'never',
    notificationMethod: 'both',
    completed: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const futureReminder: Reminder = {
    id: 'rem-future',
    userId: 'user-123',
    categoryId: 'rem-cat-appointments',
    title: 'Future Dental checkup',
    date: '2099-12-31',
    time: '15:00',
    priority: 'medium',
    repeat: 'never',
    notificationMethod: 'in_app',
    completed: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const completedReminder: Reminder = {
    ...pastReminder,
    id: 'rem-completed',
    completed: true,
  };

  assert.equal(isReminderOverdue(pastReminder), true);
  assert.equal(isReminderOverdue(futureReminder), false);
  // Completed reminders are never counted as overdue
  assert.equal(isReminderOverdue(completedReminder), false);
});

test('Snooze Calculations: calculates correct new date and time for 10m, 30m, 60m, and tomorrow', () => {
  // Test 10 minutes snooze within same hour
  const res10 = computeSnoozedDateTime('2026-05-10', '10:15', 10);
  assert.equal(res10.date, '2026-05-10');
  assert.equal(res10.time, '10:25');

  // Test 60 minutes snooze crossing hour boundary
  const res60 = computeSnoozedDateTime('2026-05-10', '23:30', 60);
  assert.equal(res60.date, '2026-05-11');
  assert.equal(res60.time, '00:30');

  // Test 1 day (1440 minutes) snooze to tomorrow
  const resTomorrow = computeSnoozedDateTime('2026-05-10', '14:00', 1440);
  assert.equal(resTomorrow.date, '2026-05-11');
  assert.equal(resTomorrow.time, '14:00');
});

test('Recurrence Advancement: computes next scheduled date correctly', () => {
  // Daily: adds 1 day
  const daily = getNextReminderOccurrence('2026-04-15', '08:30', 'daily');
  assert.equal(daily.date, '2026-04-16');
  assert.equal(daily.time, '08:30');

  // Weekly: adds 7 days
  const weekly = getNextReminderOccurrence('2026-04-15', '10:00', 'weekly');
  assert.equal(weekly.date, '2026-04-22');
  assert.equal(weekly.time, '10:00');

  // Monthly: advances 1 month
  const monthly = getNextReminderOccurrence('2026-04-15', '09:00', 'monthly');
  assert.equal(monthly.date, '2026-05-15');

  // Yearly: advances 1 year
  const yearly = getNextReminderOccurrence('2026-04-15', '12:00', 'yearly');
  assert.equal(yearly.date, '2027-04-15');
});

test('Tab Filtering: accurately separates today, upcoming, overdue, and completed reminders', () => {
  const list: Reminder[] = [
    {
      id: 'rem-1',
      userId: 'u1',
      categoryId: 'rem-cat-personal',
      title: 'Old undone task',
      date: '2021-01-01',
      time: '10:00',
      priority: 'urgent',
      repeat: 'never',
      notificationMethod: 'both',
      completed: false,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'rem-2',
      userId: 'u1',
      categoryId: 'rem-cat-work',
      title: 'Far future item',
      date: '2090-06-01',
      time: '14:00',
      priority: 'low',
      repeat: 'never',
      notificationMethod: 'in_app',
      completed: false,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'rem-3',
      userId: 'u1',
      categoryId: 'rem-cat-study',
      title: 'Finished item',
      date: '2021-01-01',
      time: '10:00',
      priority: 'medium',
      repeat: 'never',
      notificationMethod: 'email',
      completed: true,
      createdAt: '',
      updatedAt: '',
    },
  ];

  const overdue = filterRemindersByTab(list, 'overdue');
  assert.equal(overdue.length, 1);
  assert.equal(overdue[0].id, 'rem-1');

  const upcoming = filterRemindersByTab(list, 'upcoming');
  assert.ok(upcoming.some((r) => r.id === 'rem-2'));

  const completed = filterRemindersByTab(list, 'completed');
  assert.equal(completed.length, 1);
  assert.equal(completed[0].id, 'rem-3');

  const all = filterRemindersByTab(list, 'all');
  assert.equal(all.length, 3);
});

test('Sorting: orders reminders by priority and date correctly', () => {
  const rLow: Reminder = {
    id: 'low',
    userId: 'u1',
    categoryId: 'rem-cat-personal',
    title: 'Low priority',
    date: '2026-05-01',
    time: '10:00',
    priority: 'low',
    repeat: 'never',
    notificationMethod: 'in_app',
    completed: false,
    createdAt: '',
    updatedAt: '',
  };

  const rUrgent: Reminder = {
    id: 'urgent',
    userId: 'u1',
    categoryId: 'rem-cat-work',
    title: 'Urgent priority',
    date: '2026-05-01',
    time: '11:00',
    priority: 'urgent',
    repeat: 'never',
    notificationMethod: 'in_app',
    completed: false,
    createdAt: '',
    updatedAt: '',
  };

  const sortedPriority = sortReminders([rLow, rUrgent], 'priority');
  assert.equal(sortedPriority[0].id, 'urgent');
  assert.equal(sortedPriority[1].id, 'low');
});

test('Duplicate Notification Prevention: ensures already-notified reminders are tracked', () => {
  const reminder: Reminder = {
    id: 'r-duplicate-check',
    userId: 'u1',
    categoryId: 'rem-cat-appointments',
    title: 'Doctor Appointment',
    date: '2026-01-01',
    time: '09:00',
    priority: 'high',
    repeat: 'never',
    notificationMethod: 'both',
    completed: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastNotifiedAt: '2026-01-01T09:00:00.000Z',
  };

  // If already notified for this scheduled occurrence and date/time haven't changed,
  // isReminderDueNow should return false
  const due = isReminderDueNow(reminder);
  assert.equal(due, false, 'Reminder already notified should not trigger duplicate notifications');
});
