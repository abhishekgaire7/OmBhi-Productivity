import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldTriggerCelebration,
  canCelebrateTaskTransition,
  CELEBRATION_DURATION_MS,
} from './celebration';
import { UserSettings } from '../types';

test('Celebration duration constant is exactly 3000ms (3 seconds max)', () => {
  assert.equal(CELEBRATION_DURATION_MS, 3000);
});

test('shouldTriggerCelebration returns false when celebratoryAnimations is disabled', () => {
  const settings: Partial<UserSettings> = {
    celebratoryAnimations: false,
    celebrationScope: 'both',
  };
  assert.equal(shouldTriggerCelebration('task', settings, false), false);
  assert.equal(shouldTriggerCelebration('habit', settings, false), false);
  assert.equal(shouldTriggerCelebration('reminder', settings, false), false);
});

test('shouldTriggerCelebration returns false when a celebration is already active (debounce/spam prevention)', () => {
  const settings: Partial<UserSettings> = {
    celebratoryAnimations: true,
    celebrationScope: 'both',
  };
  assert.equal(shouldTriggerCelebration('task', settings, true), false);
  assert.equal(shouldTriggerCelebration('habit', settings, true), false);
});

test('shouldTriggerCelebration triggers for both tasks and habits when scope is "both"', () => {
  const settings: Partial<UserSettings> = {
    celebratoryAnimations: true,
    celebrationScope: 'both',
  };
  assert.equal(shouldTriggerCelebration('task', settings, false), true);
  assert.equal(shouldTriggerCelebration('habit', settings, false), true);
  assert.equal(shouldTriggerCelebration('reminder', settings, false), true);
});

test('shouldTriggerCelebration respects scope "tasks" only', () => {
  const settings: Partial<UserSettings> = {
    celebratoryAnimations: true,
    celebrationScope: 'tasks',
  };
  assert.equal(shouldTriggerCelebration('task', settings, false), true);
  assert.equal(shouldTriggerCelebration('reminder', settings, false), true);
  assert.equal(shouldTriggerCelebration('habit', settings, false), false);
});

test('shouldTriggerCelebration respects scope "habits" only', () => {
  const settings: Partial<UserSettings> = {
    celebratoryAnimations: true,
    celebrationScope: 'habits',
  };
  assert.equal(shouldTriggerCelebration('task', settings, false), false);
  assert.equal(shouldTriggerCelebration('reminder', settings, false), false);
  assert.equal(shouldTriggerCelebration('habit', settings, false), true);
});

test('canCelebrateTaskTransition only triggers when transitioning from incomplete to completed', () => {
  const celebrated = new Set<string>();

  // Incomplete -> Completed: Should celebrate!
  assert.equal(canCelebrateTaskTransition('task-1', false, true, celebrated), true);

  // Already completed -> Still completed (e.g. view, edit modal, refresh): Should NOT celebrate!
  assert.equal(canCelebrateTaskTransition('task-1', true, true, celebrated), false);

  // Completed -> Incomplete (reopening): Should NOT celebrate!
  assert.equal(canCelebrateTaskTransition('task-1', true, false, celebrated), false);

  // Incomplete -> Incomplete (no completion): Should NOT celebrate!
  assert.equal(canCelebrateTaskTransition('task-1', false, false, celebrated), false);
});

test('canCelebrateTaskTransition prevents duplicate celebrations for the same completed task', () => {
  const celebrated = new Set<string>(['task-1']);

  // task-1 already celebrated: Should NOT celebrate again!
  assert.equal(canCelebrateTaskTransition('task-1', false, true, celebrated), false);

  // Completing another task (task-2): Should celebrate!
  assert.equal(canCelebrateTaskTransition('task-2', false, true, celebrated), true);
});
