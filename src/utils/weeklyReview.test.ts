import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getWeekInfo,
  calculateWeeklyMetrics,
  generateDeterministicReview,
} from './weeklyReview';
import { Category, Habit, Task } from '../types';

test('getWeekInfo returns 7 valid ISO days and weekKey', () => {
  const date = new Date(2026, 9, 28); // Wed Oct 28, 2026
  const weekInfo = getWeekInfo(date, true);

  assert.equal(weekInfo.days.length, 7);
  assert.equal(weekInfo.days[0], '2026-10-26'); // Monday
  assert.equal(weekInfo.days[6], '2026-11-01'); // Sunday
  assert.equal(weekInfo.startDate, '2026-10-26');
  assert.equal(weekInfo.endDate, '2026-11-01');
  assert.ok(weekInfo.weekKey.startsWith('2026-W'));
  assert.ok(weekInfo.weekLabel.includes('Oct'));
});

test('calculateWeeklyMetrics correctly calculates prompt example numbers (25 planned, 19 completed, 3 skipped)', () => {
  const weekDays = [
    '2026-10-26', // Mon
    '2026-10-27', // Tue
    '2026-10-28', // Wed
    '2026-10-29', // Thu
    '2026-10-30', // Fri
    '2026-10-31', // Sat
    '2026-11-01', // Sun
  ];

  const categories: Category[] = [
    { id: 'cat-work', name: 'Work', color: '#16A34A' },
  ];

  const habits: Habit[] = [];

  // Create 25 tasks: 19 completed, 3 skipped, 2 failed, 1 in_progress
  // Put high success on Tuesday (2026-10-27) and Saturday (2026-10-31)
  const tasks: Task[] = [];
  let id = 1;

  for (let i = 0; i < 25; i++) {
    let status: Task['status'] = 'completed';
    let date = weekDays[i % 7];

    if (i < 19) {
      status = 'completed';
      // Put lots on Tuesday and Saturday
      if (i % 2 === 0) date = '2026-10-27'; // Tue
      else date = '2026-10-31'; // Sat
    } else if (i < 22) {
      status = 'skipped';
      date = '2026-10-29'; // Thu
    } else if (i < 24) {
      status = 'failed';
      date = '2026-10-29'; // Thu
    } else {
      status = 'in_progress';
      date = '2026-10-28'; // Wed
    }

    tasks.push({
      id: `task-${id++}`,
      title: `Task ${i + 1}`,
      scheduledDate: date,
      categoryId: 'cat-work',
      priority: 'medium',
      status,
      progress: status === 'completed' ? 100 : 0,
      subtasks: [],
      createdAt: '2026-10-26T00:00:00Z',
      updatedAt: '2026-10-26T00:00:00Z',
    });
  }

  const metrics = calculateWeeklyMetrics(tasks, categories, habits, weekDays);

  assert.equal(metrics.totalPlanned, 25);
  assert.equal(metrics.completed, 19);
  assert.equal(metrics.skipped, 3);
  assert.equal(metrics.failed, 2);
  assert.equal(metrics.inProgress, 1);
  assert.equal(metrics.completionRate, 76); // 19 / 25 = 76%

  // Strongest days should include Tuesday and Saturday
  assert.ok(metrics.strongestDays.includes('Tuesday'));
  assert.ok(metrics.strongestDays.includes('Saturday'));

  const weekInfo = getWeekInfo(new Date(2026, 9, 28));
  const review = generateDeterministicReview(metrics, weekInfo);

  // Assert headline format
  assert.ok(review.headline.includes('You planned 25 tasks, completed 19, and skipped 3'));
  assert.ok(review.headline.includes('Tuesday and Saturday'));
  assert.equal(review.completionRate, 76);
  assert.ok(review.whatWorked.length >= 2);
  assert.ok(review.whatWasMissed.length >= 1);
  assert.ok(review.whatToChange.length >= 2);
});
