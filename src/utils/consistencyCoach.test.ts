import test from 'node:test';
import assert from 'node:assert/strict';
import { generateConsistencyCoachAnalysis } from './consistencyCoach';
import { Category, Habit, Task } from '../types';

test('generateConsistencyCoachAnalysis computes real time-of-day and non-shaming recommendations', () => {
  const categories: Category[] = [
    { id: 'cat-studies', name: 'Studies', color: '#6657E8' },
    { id: 'cat-gym', name: 'Fitness', color: '#16A34A' },
  ];

  const habits: Habit[] = [
    {
      id: 'h-german',
      name: 'German Duolingo',
      categoryId: 'cat-studies',
      frequency: 'daily',
      targetDaysPerWeek: 7,
      completedDates: ['2026-10-27', '2026-10-28'],
      streak: 5,
    },
  ];

  const tasks: Task[] = [
    {
      id: 't1',
      title: 'Morning German Study',
      scheduledDate: '2026-10-28',
      startTime: '09:00',
      endTime: '10:00',
      categoryId: 'cat-studies',
      priority: 'high',
      status: 'completed',
      progress: 100,
      subtasks: [],
      createdAt: '2026-10-28T08:00:00Z',
      updatedAt: '2026-10-28T10:00:00Z',
    },
    {
      id: 't2',
      title: 'Morning Gym',
      scheduledDate: '2026-10-28',
      startTime: '10:30',
      endTime: '11:30',
      categoryId: 'cat-gym',
      priority: 'high',
      status: 'completed',
      progress: 100,
      subtasks: [],
      createdAt: '2026-10-28T08:00:00Z',
      updatedAt: '2026-10-28T11:30:00Z',
    },
    {
      id: 't3',
      title: 'Late Evening Reading',
      scheduledDate: '2026-10-28',
      startTime: '21:00',
      endTime: '22:00',
      categoryId: 'cat-studies',
      priority: 'low',
      status: 'skipped',
      progress: 0,
      subtasks: [],
      createdAt: '2026-10-28T08:00:00Z',
      updatedAt: '2026-10-28T22:00:00Z',
    },
    {
      id: 't4',
      title: 'Afternoon Lecture Review',
      scheduledDate: '2026-10-27',
      startTime: '14:00',
      endTime: '15:00',
      categoryId: 'cat-studies',
      priority: 'medium',
      status: 'completed',
      progress: 100,
      subtasks: [],
      createdAt: '2026-10-27T08:00:00Z',
      updatedAt: '2026-10-27T15:00:00Z',
    },
    {
      id: 't5',
      title: 'Evening Coding',
      scheduledDate: '2026-10-27',
      startTime: '19:00',
      endTime: '20:00',
      categoryId: 'cat-studies',
      priority: 'medium',
      status: 'failed',
      progress: 0,
      subtasks: [],
      createdAt: '2026-10-27T08:00:00Z',
      updatedAt: '2026-10-27T20:00:00Z',
    },
  ];

  const analysis = generateConsistencyCoachAnalysis(tasks, habits, categories);

  assert.equal(analysis.totalAnalyzedTasks, 5);
  assert.equal(analysis.hasSufficientData, true);

  // Morning completion rate should be 100% (2 of 2 completed)
  const morning = analysis.timeOfDayRates.find((r) => r.period.includes('Morning'));
  assert.ok(morning);
  assert.equal(morning?.completed, 2);
  assert.equal(morning?.total, 2);
  assert.equal(morning?.rate, 100);

  // Evening completion rate should be 0% (0 of 2 completed)
  const evening = analysis.timeOfDayRates.find((r) => r.period.includes('Evening'));
  assert.ok(evening);
  assert.equal(evening?.completed, 0);
  assert.equal(evening?.rate, 0);

  // Recommendations should be constructive, actionable, and non-shaming
  assert.ok(analysis.recommendations.length >= 3);
  for (const rec of analysis.recommendations) {
    // Avoid shame words
    assert.equal(/\b(lazy|failure|disappointing|shame|guilt)\b/i.test(rec), false);
  }
});

test('calculateConsistencyScore: new users with no completed tasks receive 0 (never arbitrary 60)', async () => {
  const { calculateConsistencyScore } = await import('./consistencyCoach');

  // Test 1: Brand new user with 0 tasks
  const emptyResult = calculateConsistencyScore([], []);
  assert.equal(emptyResult.score, 0, 'Score must be 0 for new user with no tasks');
  assert.equal(emptyResult.hasCompletedTasks, false);
  assert.equal(emptyResult.totalCompleted, 0);

  // Test 2: User with pending or in-progress tasks, but 0 completed
  const pendingTasks: Task[] = [
    {
      id: 'p1',
      title: 'Review Math',
      scheduledDate: '2026-11-03',
      categoryId: 'c1',
      priority: 'high',
      status: 'pending',
      progress: 0,
      subtasks: [],
      createdAt: '2026-11-03T08:00:00Z',
      updatedAt: '2026-11-03T08:00:00Z',
    },
    {
      id: 'p2',
      title: 'Gym Workout',
      scheduledDate: '2026-11-03',
      categoryId: 'c2',
      priority: 'medium',
      status: 'in_progress',
      progress: 30,
      subtasks: [],
      createdAt: '2026-11-03T08:00:00Z',
      updatedAt: '2026-11-03T08:00:00Z',
    },
  ];
  const pendingResult = calculateConsistencyScore(pendingTasks, []);
  assert.equal(pendingResult.score, 0, 'Score must be 0 when 0 tasks are completed');
  assert.equal(pendingResult.hasCompletedTasks, false);

  // Test 3: User completes first task -> score updates immediately
  const withOneCompleted: Task[] = [
    ...pendingTasks,
    {
      id: 'c1',
      title: 'Morning Meditation',
      scheduledDate: '2026-11-03',
      categoryId: 'c1',
      priority: 'medium',
      status: 'completed',
      progress: 100,
      subtasks: [],
      createdAt: '2026-11-03T08:00:00Z',
      updatedAt: '2026-11-03T09:00:00Z',
    },
  ];
  const oneDoneResult = calculateConsistencyScore(withOneCompleted, []);
  assert.ok(oneDoneResult.score > 0, 'Score must be greater than 0 once a task is completed');
  assert.equal(oneDoneResult.hasCompletedTasks, true);
  assert.equal(oneDoneResult.totalCompleted, 1);

  // Test 4: Task is missed/failed vs rescheduled
  const withFailedTask: Task[] = [
    ...withOneCompleted,
    {
      id: 'f1',
      title: 'Missed Assignment',
      scheduledDate: '2026-11-02',
      categoryId: 'c1',
      priority: 'urgent',
      status: 'failed',
      progress: 0,
      subtasks: [],
      createdAt: '2026-11-02T08:00:00Z',
      updatedAt: '2026-11-02T18:00:00Z',
    },
  ];
  const failedResult = calculateConsistencyScore(withFailedTask, []);
  assert.ok(failedResult.score < oneDoneResult.score, 'Failed task must decrease consistency score');
});
