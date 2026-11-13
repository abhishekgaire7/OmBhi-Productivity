import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getUserTasksKey,
  getUserCategoriesKey,
  getUserSchedulesKey,
  getUserHabitsKey,
  loadUserStoredTasks,
  saveUserStoredTasks,
  loadUserStoredCategories,
  saveUserStoredCategories,
  loadUserStoredSchedules,
  saveUserStoredSchedules,
  loadUserStoredHabits,
  saveUserStoredHabits,
  purgeLegacySharedStorage,
} from './storage';
import { Task, Category, RecurringSchedule } from '../types';

// Mock localStorage in Node environment for unit tests
const mockStorage: Record<string, string> = {};
globalThis.localStorage = {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, value: string) => {
    mockStorage[key] = value;
  },
  removeItem: (key: string) => {
    delete mockStorage[key];
  },
  clear: () => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  },
  length: 0,
  key: () => null,
};

test('Clean workspace: New users start with 0 tasks and 0 categories', () => {
  localStorage.clear();
  const tasksUserA = loadUserStoredTasks('user-google-alice-123');
  const categoriesUserA = loadUserStoredCategories('user-google-alice-123');
  const schedulesUserA = loadUserStoredSchedules('user-google-alice-123');
  const habitsUserA = loadUserStoredHabits('user-google-alice-123');

  assert.deepEqual(tasksUserA, [], 'New user Alice must start with 0 tasks');
  assert.deepEqual(categoriesUserA, [], 'New user Alice must start with 0 categories');
  assert.deepEqual(schedulesUserA, [], 'New user Alice must start with 0 schedules');
  assert.deepEqual(habitsUserA, [], 'New user Alice must start with 0 habits');
});

test('User isolation: Account A tasks never leak into Account B workspace', () => {
  localStorage.clear();

  const userAliceId = 'user-alice-001';
  const userBobId = 'user-bob-002';

  const aliceTask: Task = {
    id: 'task-alice-1',
    title: 'Alice Private Project Review',
    scheduledDate: '2026-11-01',
    startTime: '09:00',
    categoryId: 'cat-alice-work',
    priority: 'high',
    status: 'pending',
    progress: 0,
    subtasks: [],
    recurrence: 'none',
    createdAt: '2026-10-30T10:00:00.000Z',
    updatedAt: '2026-10-30T10:00:00.000Z',
  };

  // Alice saves a task
  saveUserStoredTasks(userAliceId, [aliceTask]);

  // Alice sees her task
  const aliceTasks = loadUserStoredTasks(userAliceId);
  assert.equal(aliceTasks.length, 1);
  assert.equal(aliceTasks[0].title, 'Alice Private Project Review');

  // Bob signs in: Bob must NOT see Alice's task!
  const bobTasks = loadUserStoredTasks(userBobId);
  assert.deepEqual(bobTasks, [], 'Bob must have an empty workspace with 0 tasks');
});

test('User isolation: Account A categories never appear in Account B account', () => {
  localStorage.clear();

  const userAliceId = 'user-alice-001';
  const userBobId = 'user-bob-002';

  const aliceCategory: Category = {
    id: 'cat-alice-research',
    name: 'Confidential AI Lab',
    color: '#6657E8',
  };

  saveUserStoredCategories(userAliceId, [aliceCategory]);

  const aliceCats = loadUserStoredCategories(userAliceId);
  assert.equal(aliceCats.length, 1);
  assert.equal(aliceCats[0].name, 'Confidential AI Lab');

  // Bob's categories must be empty
  const bobCats = loadUserStoredCategories(userBobId);
  assert.deepEqual(bobCats, [], 'Bob must have 0 categories');

  // Bob creates his own category
  const bobCategory: Category = {
    id: 'cat-bob-art',
    name: 'Ceramics & Pottery',
    color: '#16A34A',
  };
  saveUserStoredCategories(userBobId, [bobCategory]);

  // Re-verify Alice is completely unaffected by Bob's category
  const recheckedAliceCats = loadUserStoredCategories(userAliceId);
  assert.equal(recheckedAliceCats.length, 1);
  assert.equal(recheckedAliceCats[0].name, 'Confidential AI Lab');
  assert.equal(recheckedAliceCats[0].id, 'cat-alice-research');
});

test('User isolation: Recurring schedules are strictly user-specific', () => {
  localStorage.clear();

  const userAliceId = 'user-alice-001';
  const userBobId = 'user-bob-002';

  const aliceSchedule: RecurringSchedule = {
    id: 'series-alice-1',
    title: 'Morning Sprint',
    categoryId: 'cat-alice-work',
    priority: 'medium',
    subtasks: [],
    scheduleMode: 'repeat',
    frequency: 'daily',
    startDate: '2026-11-01',
    isPaused: false,
    excludedDates: [],
    createdAt: '2026-10-30T10:00:00.000Z',
    updatedAt: '2026-10-30T10:00:00.000Z',
  };

  saveUserStoredSchedules(userAliceId, [aliceSchedule]);

  assert.equal(loadUserStoredSchedules(userAliceId).length, 1);
  assert.equal(loadUserStoredSchedules(userBobId).length, 0);
});

test('Legacy cleanup: Purging legacy demo keys removes unscoped storage without touching user keys', () => {
  localStorage.clear();

  // Simulate old demo keys that may have existed in browser storage
  localStorage.setItem('dayforge_tasks_v3', JSON.stringify([{ id: 'demo-task' }]));
  localStorage.setItem('dayforge_categories_v1', JSON.stringify([{ id: 'demo-cat' }]));

  // Valid user key
  saveUserStoredTasks('user-alice-001', [
    {
      id: 'task-real-1',
      title: 'Real User Task',
      scheduledDate: '2026-11-01',
      categoryId: 'cat-1',
      priority: 'medium',
      status: 'pending',
      progress: 0,
      subtasks: [],
      recurrence: 'none',
      createdAt: '2026-10-30T10:00:00.000Z',
      updatedAt: '2026-10-30T10:00:00.000Z',
    },
  ]);

  purgeLegacySharedStorage();

  // Legacy keys must be wiped out
  assert.equal(localStorage.getItem('dayforge_tasks_v3'), null);
  assert.equal(localStorage.getItem('dayforge_categories_v1'), null);

  // User Alice's data is preserved
  const aliceTasks = loadUserStoredTasks('user-alice-001');
  assert.equal(aliceTasks.length, 1);
  assert.equal(aliceTasks[0].title, 'Real User Task');
});

test('Requirement 7 Verification: Account A and Account B workspaces remain strictly segregated across sessions', () => {
  localStorage.clear();

  const accountAId = 'user_account_a_alex';
  const accountBId = 'user_account_b_jordan';

  // 1. Both start clean
  assert.equal(loadUserStoredTasks(accountAId).length, 0);
  assert.equal(loadUserStoredCategories(accountAId).length, 0);
  assert.equal(loadUserStoredTasks(accountBId).length, 0);
  assert.equal(loadUserStoredCategories(accountBId).length, 0);

  // 2. Account A creates category and recurring task
  const catA: Category = { id: 'cat-a-study', name: 'University Study', color: '#6657E8' };
  saveUserStoredCategories(accountAId, [catA]);

  const taskA: Task = {
    id: 'task-a-ml',
    title: 'Machine Learning Revision',
    scheduledDate: '2026-11-02',
    categoryId: 'cat-a-study',
    priority: 'high',
    status: 'pending',
    progress: 0,
    subtasks: [],
    recurrence: 'daily',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveUserStoredTasks(accountAId, [taskA]);

  // 3. Verify Account B sees NOTHING from Account A
  assert.equal(loadUserStoredCategories(accountBId).length, 0, 'Account B must not see Account A categories');
  assert.equal(loadUserStoredTasks(accountBId).length, 0, 'Account B must not see Account A tasks');

  // 4. Account B creates their own category and task
  const catB: Category = { id: 'cat-b-gym', name: 'Athletics & Gym', color: '#16A34A' };
  saveUserStoredCategories(accountBId, [catB]);
  const taskB: Task = {
    id: 'task-b-run',
    title: '5km Morning Run',
    scheduledDate: '2026-11-02',
    categoryId: 'cat-b-gym',
    priority: 'medium',
    status: 'completed',
    progress: 100,
    subtasks: [],
    recurrence: 'none',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveUserStoredTasks(accountBId, [taskB]);

  // 5. Verify Account A is completely unmodified
  const recheckedCatsA = loadUserStoredCategories(accountAId);
  const recheckedTasksA = loadUserStoredTasks(accountAId);
  assert.equal(recheckedCatsA.length, 1);
  assert.equal(recheckedCatsA[0].name, 'University Study');
  assert.equal(recheckedTasksA.length, 1);
  assert.equal(recheckedTasksA[0].title, 'Machine Learning Revision');

  // 6. Verify Account B is completely unmodified
  const recheckedCatsB = loadUserStoredCategories(accountBId);
  const recheckedTasksB = loadUserStoredTasks(accountBId);
  assert.equal(recheckedCatsB.length, 1);
  assert.equal(recheckedCatsB[0].name, 'Athletics & Gym');
  assert.equal(recheckedTasksB.length, 1);
  assert.equal(recheckedTasksB[0].title, '5km Morning Run');
});
