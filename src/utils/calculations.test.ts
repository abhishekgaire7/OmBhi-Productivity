import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateFullCompletionRate,
  calculateAverageProgress,
  calculateHabitStreak,
  isTaskOverdue,
  matchesTaskFilters
} from './calculations';
import { Task } from '../types';

const baseTask: Task = {
  id: '1',
  title: 'Test Task',
  scheduledDate: '2026-10-25',
  categoryId: 'cat-1',
  priority: 'medium',
  status: 'pending',
  progress: 0,
  subtasks: [],
  recurrence: 'none',
  createdAt: '2026-10-25T00:00:00Z',
  updatedAt: '2026-10-25T00:00:00Z'
};

test('calculateFullCompletionRate computes correct percentage keeping failed and skipped in denominator', () => {
  assert.equal(calculateFullCompletionRate([]), 0);

  const tasks: Task[] = [
    { ...baseTask, id: '1', status: 'completed' },
    { ...baseTask, id: '2', status: 'completed' },
    { ...baseTask, id: '3', status: 'failed' },
    { ...baseTask, id: '4', status: 'skipped' },
  ];
  // 2 completed out of 4 scheduled = 50%
  assert.equal(calculateFullCompletionRate(tasks), 50);
});

test('calculateAverageProgress computes arithmetic mean of progress percentages', () => {
  assert.equal(calculateAverageProgress([]), 0);
  const tasks: Task[] = [
    { ...baseTask, progress: 100 },
    { ...baseTask, progress: 50 },
    { ...baseTask, progress: 0 },
  ];
  assert.equal(calculateAverageProgress(tasks), 50);
});

test('calculateHabitStreak calculates unbroken streaks from today or yesterday', () => {
  const today = '2026-10-25';
  const yesterday = '2026-10-24';
  const twoDaysAgo = '2026-10-23';
  const threeDaysAgo = '2026-10-22';
  const lastWeek = '2026-10-18';

  assert.equal(calculateHabitStreak([], today, yesterday), 0);
  assert.equal(calculateHabitStreak([today, yesterday, twoDaysAgo], today, yesterday), 3);
  assert.equal(calculateHabitStreak([yesterday, twoDaysAgo, threeDaysAgo], today, yesterday), 3);
  // Broken streak (ended 3 days ago)
  assert.equal(calculateHabitStreak([threeDaysAgo, lastWeek], today, yesterday), 0);
});

test('isTaskOverdue returns true only for uncompleted past tasks', () => {
  const today = '2026-10-25';
  assert.equal(isTaskOverdue({ ...baseTask, scheduledDate: '2026-10-24', status: 'pending' }, today), true);
  assert.equal(isTaskOverdue({ ...baseTask, scheduledDate: '2026-10-24', status: 'in_progress' }, today), true);
  assert.equal(isTaskOverdue({ ...baseTask, scheduledDate: '2026-10-24', status: 'completed' }, today), false);
  assert.equal(isTaskOverdue({ ...baseTask, scheduledDate: '2026-10-24', status: 'failed' }, today), false);
  assert.equal(isTaskOverdue({ ...baseTask, scheduledDate: '2026-10-24', status: 'skipped' }, today), false);
  assert.equal(isTaskOverdue({ ...baseTask, scheduledDate: '2026-10-25', status: 'pending' }, today), false);
});

test('matchesTaskFilters filters by query, category, priority, and status', () => {
  const task: Task = {
    ...baseTask,
    title: 'Learn German Grammar',
    description: 'Konjunktiv II exercises',
    categoryId: 'cat-ger',
    priority: 'high',
    status: 'in_progress'
  };

  assert.equal(matchesTaskFilters(task, 'german', 'all', 'all', 'all'), true);
  assert.equal(matchesTaskFilters(task, 'konjunktiv', 'all', 'all', 'all'), true);
  assert.equal(matchesTaskFilters(task, 'math', 'all', 'all', 'all'), false);
  assert.equal(matchesTaskFilters(task, '', 'cat-ger', 'high', 'in_progress'), true);
  assert.equal(matchesTaskFilters(task, '', 'cat-uni', 'all', 'all'), false);
});
