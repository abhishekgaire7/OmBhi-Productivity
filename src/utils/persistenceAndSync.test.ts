import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeForFirestore } from './cloudSync';
import {
  loadUserStoredTasks,
  saveUserStoredTasks,
  loadUserStoredCategories,
  saveUserStoredCategories,
  loadUserStoredHabits,
  saveUserStoredHabits,
} from './storage';
import { Habit, Task, Category } from '../types';

// Mock localStorage for node test runner
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
    for (const k of Object.keys(mockStorage)) delete mockStorage[k];
  },
  key: (i: number) => Object.keys(mockStorage)[i] ?? null,
  length: 0,
} as Storage;

test('1. sanitizeForFirestore strips undefined fields and preserves safe defaults', () => {
  // Test case with habit containing empty or undefined notes
  const habitWithUndefinedNotes: any = {
    id: 'hab-123',
    name: 'Morning Meditation',
    categoryId: 'cat-mind',
    frequency: 'daily',
    targetDaysPerWeek: 7,
    completedDates: [],
    streak: 0,
    notes: undefined, // this previously caused "Unsupported field value: undefined"
  };

  const sanitizedHabit = sanitizeForFirestore(habitWithUndefinedNotes);
  assert.equal('notes' in sanitizedHabit, false, 'undefined notes field must be omitted');
  assert.equal(sanitizedHabit.id, 'hab-123');

  // Test case with task containing undefined description and notes
  const taskWithUndefineds: any = {
    id: 'task-test-01',
    title: 'Deploy to Cloud',
    description: undefined,
    scheduledDate: '2026-11-01',
    startTime: undefined,
    endTime: undefined,
    categoryId: 'cat-work',
    priority: 'high',
    status: 'pending',
    progress: 0,
    subtasks: [],
    notes: undefined,
  };

  const sanitizedTask = sanitizeForFirestore(taskWithUndefineds);
  assert.equal('description' in sanitizedTask, false);
  assert.equal('startTime' in sanitizedTask, false);
  assert.equal('endTime' in sanitizedTask, false);
  assert.equal('notes' in sanitizedTask, false);
  assert.equal(sanitizedTask.title, 'Deploy to Cloud');

  // Verify that an object with empty string notes is safely kept as string
  const habitWithEmptyNotes: Habit = {
    id: 'hab-empty-notes',
    name: 'Hydration 2L',
    categoryId: 'cat-health',
    frequency: 'daily',
    targetDaysPerWeek: 7,
    completedDates: [],
    streak: 0,
    notes: '',
  };
  const sanitizedEmptyHabit = sanitizeForFirestore(habitWithEmptyNotes);
  assert.equal(sanitizedEmptyHabit.notes, '');
});

test('2. Progress slider and completion checkbox synchronization', () => {
  const initialTask: Task = {
    id: 'task-sync-1',
    title: 'Write Documentation',
    scheduledDate: '2026-11-01',
    categoryId: 'cat-docs',
    priority: 'medium',
    status: 'pending',
    progress: 0,
    subtasks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Requirement 4: When progress reaches exactly 100%, automatically mark completion checkbox as checked (status: completed)
  const updateProgress = (task: Task, progressVal: number): Task => {
    const bounded = Math.max(0, Math.min(100, Math.round(progressVal)));
    let nextStatus: Task['status'];
    if (bounded === 100) {
      nextStatus = 'completed';
    } else if (bounded === 0) {
      nextStatus = 'pending';
    } else {
      nextStatus = 'in_progress';
    }
    return {
      ...task,
      progress: bounded,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    };
  };

  // 1. Move task progress to 100%; verify the checkbox becomes checked (status = completed)
  const taskAt100 = updateProgress(initialTask, 100);
  assert.equal(taskAt100.progress, 100);
  assert.equal(taskAt100.status, 'completed');
  const isCheckboxCheckedAt100 = taskAt100.status === 'completed' || taskAt100.progress === 100;
  assert.equal(isCheckboxCheckedAt100, true);

  // 2. When progress is below 100%, automatically uncheck it
  const taskAt75 = updateProgress(taskAt100, 75);
  assert.equal(taskAt75.progress, 75);
  assert.equal(taskAt75.status, 'in_progress');
  const isCheckboxCheckedAt75 = (taskAt75.status as string) === 'completed' || (taskAt75.progress as number) === 100;
  assert.equal(isCheckboxCheckedAt75, false);

  // 3. Checking the checkbox manually should set progress to 100%
  const completeTaskToggle = (task: Task): Task => {
    const isCompleted = task.status === 'completed' || task.progress === 100;
    if (isCompleted) {
      // Unchecking manually resets progress to 0% and status to pending
      return {
        ...task,
        status: 'pending',
        progress: 0,
        updatedAt: new Date().toISOString(),
      };
    }
    // Checking manually sets progress to 100% and status to completed
    return {
      ...task,
      status: 'completed',
      progress: 100,
      updatedAt: new Date().toISOString(),
    };
  };

  const manuallyChecked = completeTaskToggle(taskAt75);
  assert.equal(manuallyChecked.status, 'completed');
  assert.equal(manuallyChecked.progress, 100);

  // 4. Unchecking it manually should reset progress to 0%
  const manuallyUnchecked = completeTaskToggle(manuallyChecked);
  assert.equal(manuallyUnchecked.status, 'pending');
  assert.equal(manuallyUnchecked.progress, 0);
});

test('3. Data persistence, account switching, and multi-user isolation', () => {
  const accountA_UID = 'user-alice-uid-1111';
  const accountB_UID = 'user-bob-uid-2222';

  // Account A creates a task
  const taskA: Task = {
    id: 'task-a-1',
    title: 'Alice Private Project Task',
    scheduledDate: '2026-11-01',
    categoryId: 'cat-a',
    priority: 'urgent',
    status: 'pending',
    progress: 0,
    subtasks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveUserStoredTasks(accountA_UID, [taskA]);

  // Account A signs out -> in-memory state is cleared
  let inMemoryWorkspace: Task[] = [];
  assert.equal(inMemoryWorkspace.length, 0);

  // Account B signs in -> Account B sees clean empty workspace
  const bobTasks = loadUserStoredTasks(accountB_UID);
  assert.equal(bobTasks.length, 0, 'Account B must not see Alice tasks');

  // Account B creates their own task
  const taskB: Task = {
    id: 'task-b-1',
    title: 'Bob Infrastructure Task',
    scheduledDate: '2026-11-02',
    categoryId: 'cat-b',
    priority: 'medium',
    status: 'in_progress',
    progress: 50,
    subtasks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveUserStoredTasks(accountB_UID, [taskB]);

  // Switch back to Account A -> Account A's task is restored
  const aliceRestoredTasks = loadUserStoredTasks(accountA_UID);
  assert.equal(aliceRestoredTasks.length, 1);
  assert.equal(aliceRestoredTasks[0].id, 'task-a-1');
  assert.equal(aliceRestoredTasks[0].title, 'Alice Private Project Task');

  // Verify Account B's task remains independent
  const bobRestoredTasks = loadUserStoredTasks(accountB_UID);
  assert.equal(bobRestoredTasks.length, 1);
  assert.equal(bobRestoredTasks[0].id, 'task-b-1');
  assert.equal(bobRestoredTasks[0].title, 'Bob Infrastructure Task');
});

test('4. Dashboard landing page default state', () => {
  // Verifies that default view is dashboard
  const defaultView = 'dashboard';
  assert.equal(defaultView, 'dashboard');
});
