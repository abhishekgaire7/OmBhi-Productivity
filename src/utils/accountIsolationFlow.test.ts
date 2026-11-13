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
  clearUserStoredData,
  purgeLegacySharedStorage,
  loadStoredTasks,
  loadStoredCategories,
} from './storage';
import { DEFAULT_CATEGORIES, getInitialTasks, getInitialHabits, getInitialSchedules } from './sampleData';
import { Task, Category, Habit } from '../types';

// Mock localStorage
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

test('Requirement 2: Sample data returns completely empty defaults for clean workspaces', () => {
  assert.deepEqual(DEFAULT_CATEGORIES, [], 'Default categories must be an empty array');
  assert.deepEqual(getInitialTasks(), [], 'Initial tasks must be an empty array');
  assert.deepEqual(getInitialSchedules(), [], 'Initial schedules must be an empty array');
  assert.deepEqual(getInitialHabits(), [], 'Initial habits must be an empty array');
  assert.deepEqual(loadStoredTasks(), [], 'loadStoredTasks fallback must be empty');
  assert.deepEqual(loadStoredCategories(), [], 'loadStoredCategories fallback must be empty');
});

test('Requirement 7 Mandatory Flow: Multi-account switching, isolation, refresh, and no cross-access', () => {
  localStorage.clear();

  const accountA_UID = 'firebase_user_alice_alpha_111';
  const accountB_UID = 'firebase_user_bob_beta_222';

  // 1. New user Account A signs in
  // Starts with an entirely empty workspace
  assert.equal(loadUserStoredTasks(accountA_UID).length, 0, 'Account A initially has 0 tasks');
  assert.equal(loadUserStoredCategories(accountA_UID).length, 0, 'Account A initially has 0 categories');
  assert.equal(loadUserStoredHabits(accountA_UID).length, 0, 'Account A initially has 0 habits');

  // Account A creates a unique task and category
  const categoryA: Category = {
    id: 'cat-alpha-design',
    name: 'Alice Design System',
    color: '#6657E8',
  };
  saveUserStoredCategories(accountA_UID, [categoryA]);

  const taskA: Task = {
    id: 'task-alpha-001',
    title: 'Alice Confidential Q4 Roadmap',
    description: 'Review internal design tokens',
    scheduledDate: '2026-11-01',
    startTime: '10:00',
    endTime: '11:30',
    categoryId: 'cat-alpha-design',
    priority: 'high',
    status: 'in_progress',
    progress: 40,
    subtasks: [],
    recurrence: 'none',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveUserStoredTasks(accountA_UID, [taskA]);

  // 2. Sign out Account A. In-memory state is wiped.
  // Verify Account A data is saved only in Account A keys
  assert.equal(loadUserStoredTasks(accountA_UID).length, 1);
  assert.equal(loadUserStoredCategories(accountA_UID).length, 1);

  // 3. Sign in with Account B
  // Verify Account B sees an ENTIRELY EMPTY workspace!
  const tasksInWorkspaceB = loadUserStoredTasks(accountB_UID);
  const categoriesInWorkspaceB = loadUserStoredCategories(accountB_UID);
  const habitsInWorkspaceB = loadUserStoredHabits(accountB_UID);

  assert.deepEqual(tasksInWorkspaceB, [], 'Account B MUST see 0 tasks on initial sign in');
  assert.deepEqual(categoriesInWorkspaceB, [], 'Account B MUST see 0 categories on initial sign in');
  assert.deepEqual(habitsInWorkspaceB, [], 'Account B MUST see 0 habits on initial sign in');

  // 4. Create different data in Account B
  const categoryB: Category = {
    id: 'cat-beta-dev',
    name: 'Bob Backend Infrastructure',
    color: '#16A34A',
  };
  saveUserStoredCategories(accountB_UID, [categoryB]);

  const taskB: Task = {
    id: 'task-beta-777',
    title: 'Bob Cloud Migration Script',
    description: 'Automate Firestore indexing',
    scheduledDate: '2026-11-02',
    startTime: '14:00',
    endTime: '16:00',
    categoryId: 'cat-beta-dev',
    priority: 'urgent',
    status: 'pending',
    progress: 0,
    subtasks: [],
    recurrence: 'daily',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveUserStoredTasks(accountB_UID, [taskB]);

  const habitB: Habit = {
    id: 'hab-beta-water',
    name: 'Bob Daily Hydration',
    categoryId: 'cat-beta-dev',
    targetDaysPerWeek: 7,
    frequency: 'daily',
    completedDates: ['2026-10-31'],
    streak: 1,
  };
  saveUserStoredHabits(accountB_UID, [habitB]);

  // 5. Sign out Account B and switch back to Account A
  // Verify ONLY Account A's data appears!
  const reloadedTasksA = loadUserStoredTasks(accountA_UID);
  const reloadedCategoriesA = loadUserStoredCategories(accountA_UID);
  const reloadedHabitsA = loadUserStoredHabits(accountA_UID);

  assert.equal(reloadedTasksA.length, 1, 'Account A must have exactly 1 task');
  assert.equal(reloadedTasksA[0].id, 'task-alpha-001', 'Task must be Alice roadmap task');
  assert.equal(reloadedTasksA[0].title, 'Alice Confidential Q4 Roadmap');
  assert.equal(reloadedCategoriesA.length, 1, 'Account A must have exactly 1 category');
  assert.equal(reloadedCategoriesA[0].name, 'Alice Design System');
  assert.equal(reloadedHabitsA.length, 0, 'Account A must have 0 habits (Bob habit must not leak)');

  // 6. Refresh both accounts (simulate reloads) and repeat checks
  // Reload Account B:
  const reloadedTasksB = loadUserStoredTasks(accountB_UID);
  const reloadedCategoriesB = loadUserStoredCategories(accountB_UID);
  const reloadedHabitsB = loadUserStoredHabits(accountB_UID);

  assert.equal(reloadedTasksB.length, 1, 'Account B must have exactly 1 task');
  assert.equal(reloadedTasksB[0].id, 'task-beta-777');
  assert.equal(reloadedTasksB[0].title, 'Bob Cloud Migration Script');
  assert.equal(reloadedCategoriesB.length, 1);
  assert.equal(reloadedCategoriesB[0].name, 'Bob Backend Infrastructure');
  assert.equal(reloadedHabitsB.length, 1);
  assert.equal(reloadedHabitsB[0].name, 'Bob Daily Hydration');

  // 7. Test clearUserStoredData on Account A
  clearUserStoredData(accountA_UID);
  assert.equal(loadUserStoredTasks(accountA_UID).length, 0, 'Account A data must be cleared');
  assert.equal(loadUserStoredCategories(accountA_UID).length, 0);

  // Account B data must remain completely untouched!
  assert.equal(loadUserStoredTasks(accountB_UID).length, 1, 'Account B must remain intact');
  assert.equal(loadUserStoredTasks(accountB_UID)[0].title, 'Bob Cloud Migration Script');
});
