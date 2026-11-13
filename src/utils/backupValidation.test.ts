import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_BACKUP_FILE_BYTES,
  parseAndValidateBackupJson,
  stripPrototypeKeys,
  validateBackupFileMeta,
} from './backupValidation.js';
import { DEFAULT_SETTINGS } from './sampleData.js';

describe('Backup File Upload Validation', () => {
  test('validateBackupFileMeta accepts valid .json files and rejects dangerous files', () => {
    assert.equal(
      validateBackupFileMeta({ name: 'ombhi_backup.json', size: 1024, type: 'application/json' }).valid,
      true
    );
    assert.equal(
      validateBackupFileMeta({ name: 'payload.html', size: 1024, type: 'text/html' }).valid,
      false
    );
    assert.equal(
      validateBackupFileMeta({ name: 'backup.json', size: 1024, type: 'application/javascript' }).valid,
      false
    );
    assert.equal(
      validateBackupFileMeta({ name: 'empty.json', size: 0, type: 'application/json' }).valid,
      false
    );
    assert.equal(
      validateBackupFileMeta({
        name: 'huge.json',
        size: MAX_BACKUP_FILE_BYTES + 1,
        type: 'application/json',
      }).valid,
      false
    );
  });

  test('stripPrototypeKeys eliminates prototype-pollution keys', () => {
    const payload = JSON.parse('{"a":1,"__proto__":{"polluted":true},"nested":{"constructor":{"x":1}}}');
    const clean = stripPrototypeKeys(payload) as any;
    assert.equal(clean.a, 1);
    assert.equal(Object.prototype.hasOwnProperty.call(clean, '__proto__'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(clean.nested, 'constructor'), false);
    assert.equal(({} as any).polluted, undefined);
  });

  test('parseAndValidateBackupJson rejects malformed or non-backup JSON payloads', () => {
    assert.equal(parseAndValidateBackupJson('{not-json', [], DEFAULT_SETTINGS).valid, false);
    assert.equal(parseAndValidateBackupJson('{"foo":[]}', [], DEFAULT_SETTINGS).valid, false);
    assert.equal(parseAndValidateBackupJson('[]', [], DEFAULT_SETTINGS).valid, false);
  });

  test('parseAndValidateBackupJson sanitizes valid OmBhi backup payloads cleanly', () => {
    const raw = JSON.stringify({
      app: 'OmBhi',
      categories: [{ id: 'cat-1', name: 'Deep Work', color: '#6657E8' }],
      tasks: [
        {
          id: 'task-1',
          title: 'Write unit tests',
          scheduledDate: '2026-11-15',
          startTime: '09:00',
          endTime: '10:00',
          categoryId: 'cat-1',
          priority: 'high',
          status: 'pending',
          progress: 500, // clamped to 100
          subtasks: [{ id: 'st-1', title: 'Subtask A', completed: true }],
        },
      ],
      habits: [
        {
          id: 'hab-1',
          name: 'Hydrate',
          categoryId: 'cat-1',
          frequency: 'daily',
          targetDaysPerWeek: 7,
          completedDates: ['2026-11-14', 'invalid-date'],
          streak: 3,
        },
      ],
      reminders: [
        {
          id: 'rem-1',
          userId: 'spoofed-other-user',
          title: 'Standup',
          date: '2026-11-15',
          time: '10:30',
          categoryId: 'cat-1',
          priority: 'medium',
          repeat: 'weekdays-invalid',
          completed: false,
        },
      ],
      settings: {
        theme: 'dark',
        timeFormat24h: false,
        dailyFocusGoal: 99, // clamped to 25
      },
    });

    const res = parseAndValidateBackupJson(raw, [], DEFAULT_SETTINGS);
    assert.equal(res.valid, true);
    if (res.valid) {
      assert.equal(res.data.tasks.length, 1);
      assert.equal(res.data.tasks[0].progress, 100);
      assert.deepEqual(res.data.habits[0].completedDates, ['2026-11-14']);
      assert.equal(res.data.reminders[0].userId, '');
      assert.equal(res.data.reminders[0].repeat, 'never');
      assert.equal(res.data.settings.theme, 'dark');
      assert.equal(res.data.settings.dailyFocusGoal, 25);
    }
  });
});
