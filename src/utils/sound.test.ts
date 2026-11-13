import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldPlayNotificationSound, playNotificationChime } from './sound';

test('shouldPlayNotificationSound returns false when sound is disabled', () => {
  const known = new Set<string>();
  assert.equal(shouldPlayNotificationSound('notif-1', known, false), false);
});

test('shouldPlayNotificationSound returns false when notification is already known/duplicate', () => {
  const known = new Set<string>(['notif-1', 'notif-2']);
  assert.equal(shouldPlayNotificationSound('notif-1', known, true), false);
  assert.equal(shouldPlayNotificationSound('notif-2', known, true), false);
});

test('shouldPlayNotificationSound returns true for genuinely new notification when sound is enabled', () => {
  const known = new Set<string>(['notif-1']);
  assert.equal(shouldPlayNotificationSound('notif-fresh-3', known, true), true);
});

test('shouldPlayNotificationSound returns false for empty or falsy notification IDs', () => {
  const known = new Set<string>();
  assert.equal(shouldPlayNotificationSound('', known, true), false);
});

test('playNotificationChime runs without throwing in Node environment without Web Audio', () => {
  assert.doesNotThrow(() => {
    playNotificationChime();
  });
});
