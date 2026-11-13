import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendRescheduleSlots, rescheduleSingleOccurrence } from './rescheduling';
import { Task } from '../types';

test('recommendRescheduleSlots finds conflict-free alternatives in upcoming days', () => {
  const taskToReschedule: Task = {
    id: 'task-missed',
    title: 'German Vocabulary Review',
    scheduledDate: '2026-10-28',
    startTime: '10:00',
    endTime: '11:00',
    categoryId: 'cat-studies',
    priority: 'high',
    status: 'failed',
    progress: 0,
    subtasks: [],
    createdAt: '2026-10-28T08:00:00Z',
    updatedAt: '2026-10-28T08:00:00Z',
  };

  const existingCalendarTasks: Task[] = [
    // Tomorrow (2026-10-29) has a task at 09:30 - 10:30
    {
      id: 'task-existing',
      title: 'Math Lecture',
      scheduledDate: '2026-10-29',
      startTime: '09:30',
      endTime: '10:30',
      categoryId: 'cat-studies',
      priority: 'high',
      status: 'pending',
      progress: 0,
      subtasks: [],
      createdAt: '2026-10-28T08:00:00Z',
      updatedAt: '2026-10-28T08:00:00Z',
    },
  ];

  const recommendations = recommendRescheduleSlots(
    taskToReschedule,
    existingCalendarTasks,
    '2026-10-28'
  );

  assert.ok(recommendations.length > 0);
  assert.equal(recommendations[0].conflictFree, true);

  // If recommendation is for tomorrow 2026-10-29, verify it doesn't conflict with Math Lecture (09:30 - 10:30)
  const tomorrowRec = recommendations.find((r) => r.date === '2026-10-29');
  if (tomorrowRec) {
    assert.notEqual(tomorrowRec.startTime, '09:30');
    assert.notEqual(tomorrowRec.startTime, '10:00');
  }
});

test('rescheduleSingleOccurrence only updates target occurrence and resets status to pending', () => {
  const recurringTaskOccurrence: Task = {
    id: 'occ-wednesday',
    seriesId: 'series-gym',
    title: 'Gym Workout',
    scheduledDate: '2026-10-28',
    startTime: '17:00',
    endTime: '18:15',
    categoryId: 'cat-fitness',
    priority: 'medium',
    status: 'skipped',
    progress: 0,
    subtasks: [],
    createdAt: '2026-10-20T08:00:00Z',
    updatedAt: '2026-10-28T18:00:00Z',
  };

  const rescheduled = rescheduleSingleOccurrence(
    recurringTaskOccurrence,
    '2026-10-29',
    '18:00',
    '19:15'
  );

  // Verified: ID and seriesId are preserved, date moved to tomorrow, status reset to pending
  assert.equal(rescheduled.id, 'occ-wednesday');
  assert.equal(rescheduled.seriesId, 'series-gym');
  assert.equal(rescheduled.scheduledDate, '2026-10-29');
  assert.equal(rescheduled.startTime, '18:00');
  assert.equal(rescheduled.status, 'pending');
  assert.equal(rescheduled.isDetached, true);
});
