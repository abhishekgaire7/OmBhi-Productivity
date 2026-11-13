import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDaySchedulePlan } from './dayPlanner';
import { Task } from '../types';

test('generateDaySchedulePlan preserves fixed commitments and schedules flexible tasks around them', () => {
  const sampleTasks: Task[] = [
    {
      id: 'task-lecture',
      title: 'University Computer Science Lecture',
      scheduledDate: '2026-10-28',
      startTime: '10:00',
      endTime: '11:30',
      categoryId: 'cat-studies',
      priority: 'high',
      status: 'pending',
      progress: 0,
      subtasks: [],
      createdAt: '2026-10-28T08:00:00Z',
      updatedAt: '2026-10-28T08:00:00Z',
    },
    {
      id: 'task-german',
      title: 'German Grammar Drill',
      scheduledDate: '2026-10-28',
      categoryId: 'cat-studies',
      priority: 'high',
      status: 'pending',
      progress: 0,
      subtasks: [],
      createdAt: '2026-10-28T08:00:00Z',
      updatedAt: '2026-10-28T08:00:00Z',
    },
    {
      id: 'task-gym',
      title: 'Gym Workout',
      scheduledDate: '2026-10-28',
      categoryId: 'cat-fitness',
      priority: 'medium',
      status: 'pending',
      progress: 0,
      subtasks: [],
      createdAt: '2026-10-28T08:00:00Z',
      updatedAt: '2026-10-28T08:00:00Z',
    },
  ];

  const plan = generateDaySchedulePlan({
    date: '2026-10-28',
    tasks: sampleTasks,
    workStart: '09:00',
    workEnd: '18:00',
    defaultDurationMinutes: 45,
    bufferMinutes: 15,
  });

  assert.equal(plan.items.length, 3);

  // Verify fixed lecture is preserved exactly at 10:00 to 11:30
  const lectureItem = plan.items.find((i) => i.taskId === 'task-lecture');
  assert.ok(lectureItem);
  assert.equal(lectureItem?.startTime, '10:00');
  assert.equal(lectureItem?.endTime, '11:30');
  assert.equal(lectureItem?.isFixed, true);

  // Verify German (high priority) was placed at 09:00 (before 10:00 lecture)
  const germanItem = plan.items.find((i) => i.taskId === 'task-german');
  assert.ok(germanItem);
  assert.equal(germanItem?.startTime, '09:00');
  assert.equal(germanItem?.endTime, '09:45');

  // Verify Gym was placed after the lecture + buffer (after 11:45)
  const gymItem = plan.items.find((i) => i.taskId === 'task-gym');
  assert.ok(gymItem);
  assert.ok(gymItem?.startTime && gymItem.startTime >= '11:45');
});
