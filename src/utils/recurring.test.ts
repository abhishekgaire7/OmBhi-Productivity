import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateDatesForSchedule,
  formatScheduleSummary,
  syncOccurrencesForSchedules
} from './recurring';
import { RecurringSchedule, Task } from '../types';

const gymSchedule: RecurringSchedule = {
  id: 'series-gym-1',
  title: 'Gym Workout',
  categoryId: 'cat-gym',
  priority: 'high',
  subtasks: [],
  scheduleMode: 'repeat',
  frequency: 'custom_days',
  recurrenceDays: [1, 2, 4, 5, 6], // Mon, Tue, Thu, Fri, Sat
  startDate: '2026-10-26', // Monday
  isPaused: false,
  excludedDates: [],
  createdAt: '2026-10-25T00:00:00Z',
  updatedAt: '2026-10-25T00:00:00Z'
};

test('generateDatesForSchedule generates correct custom weekly schedule', () => {
  // 2026-10-26 is Monday, 2026-10-27 Tue, 2026-10-28 Wed (not in schedule), 2026-10-29 Thu, 2026-10-30 Fri, 2026-10-31 Sat, 2026-11-01 Sun
  const dates = generateDatesForSchedule(gymSchedule, '2026-10-26', '2026-11-01');
  assert.deepEqual(dates, [
    '2026-10-26', // Mon
    '2026-10-27', // Tue
    '2026-10-29', // Thu
    '2026-10-30', // Fri
    '2026-10-31'  // Sat
  ]);
});

test('generateDatesForSchedule respects excludedDates when single occurrence is deleted', () => {
  const scheduleWithExcluded: RecurringSchedule = {
    ...gymSchedule,
    excludedDates: ['2026-10-27'] // Tuesday skipped/deleted
  };
  const dates = generateDatesForSchedule(scheduleWithExcluded, '2026-10-26', '2026-10-31');
  assert.equal(dates.includes('2026-10-27'), false);
  assert.equal(dates.includes('2026-10-26'), true);
});

test('generateDatesForSchedule handles multi_date mode', () => {
  const multiDateSchedule: RecurringSchedule = {
    id: 'series-multi-1',
    title: 'University Exam Review',
    categoryId: 'cat-uni',
    priority: 'urgent',
    subtasks: [],
    scheduleMode: 'multi_date',
    specificDates: ['2026-10-26', '2026-10-28', '2026-11-02'],
    startDate: '2026-10-26',
    isPaused: false,
    excludedDates: [],
    createdAt: '2026-10-25T00:00:00Z',
    updatedAt: '2026-10-25T00:00:00Z'
  };

  const dates = generateDatesForSchedule(multiDateSchedule, '2026-10-25', '2026-10-31');
  assert.deepEqual(dates, ['2026-10-26', '2026-10-28']);
});

test('syncOccurrencesForSchedules enforces strictly independent progress per day', () => {
  const schedules = [gymSchedule];
  // Initial sync creates occurrences for Mon, Tue, Thu, Fri, Sat
  const initialTasks = syncOccurrencesForSchedules(schedules, [], '2026-10-26', '2026-10-31');
  assert.equal(initialTasks.length, 5);

  // User completes Monday's task and sets progress to 100%
  const mondayTask = initialTasks.find(t => t.scheduledDate === '2026-10-26')!;
  mondayTask.status = 'completed';
  mondayTask.progress = 100;

  // User fails Tuesday's task
  const tuesdayTask = initialTasks.find(t => t.scheduledDate === '2026-10-27')!;
  tuesdayTask.status = 'failed';
  tuesdayTask.progress = 0;

  // Next synchronization cycle must preserve these independent states!
  const reSyncedTasks = syncOccurrencesForSchedules(schedules, initialTasks, '2026-10-26', '2026-10-31');
  const reMonday = reSyncedTasks.find(t => t.scheduledDate === '2026-10-26')!;
  const reTuesday = reSyncedTasks.find(t => t.scheduledDate === '2026-10-27')!;
  const reThursday = reSyncedTasks.find(t => t.scheduledDate === '2026-10-29')!;

  assert.equal(reMonday.status, 'completed');
  assert.equal(reMonday.progress, 100);

  assert.equal(reTuesday.status, 'failed');
  assert.equal(reTuesday.progress, 0);

  // Thursday remains unstarted
  assert.equal(reThursday.status, 'pending');
  assert.equal(reThursday.progress, 0);
});

test('formatScheduleSummary generates readable summaries', () => {
  assert.equal(formatScheduleSummary(gymSchedule), 'Every Mon, Tue, Thu, Fri, Sat');
  assert.equal(
    formatScheduleSummary({ scheduleMode: 'repeat', frequency: 'daily', startDate: '2026-10-25' }),
    'Every day'
  );
  assert.equal(
    formatScheduleSummary({ scheduleMode: 'repeat', frequency: 'weekdays', startDate: '2026-10-25' }),
    'Every weekday (Mon–Fri)'
  );
  assert.equal(
    formatScheduleSummary({ scheduleMode: 'multi_date', specificDates: ['2026-10-26', '2026-10-27', '2026-10-28'], startDate: '2026-10-26' }),
    '3 specific dates'
  );
});
