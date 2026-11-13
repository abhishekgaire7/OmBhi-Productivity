import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNaturalLanguageTask } from './naturalLanguageTask';

const sampleCategories = [
  { id: 'cat-studies', name: 'Studies' },
  { id: 'cat-fitness', name: 'Fitness' },
  { id: 'cat-work', name: 'Work' },
  { id: 'cat-personal', name: 'Personal' },
];

test('parseNaturalLanguageTask extracts German study request correctly', () => {
  const result = parseNaturalLanguageTask(
    'Study German for one hour every weekday at 7 pm',
    '2026-10-28',
    sampleCategories
  );

  assert.equal(result.title.toLowerCase().includes('german'), true);
  assert.equal(result.durationMinutes, 60);
  assert.equal(result.preferredTime, '19:00');
  assert.equal(result.endTime, '20:00');
  assert.equal(result.scheduleMode, 'repeat');
  assert.equal(result.recurrenceFrequency, 'weekdays');
  assert.deepEqual(result.recurrenceDays, [1, 2, 3, 4, 5]);
  assert.equal(result.suggestedCategoryId, 'cat-studies');
});

test('parseNaturalLanguageTask extracts gym on Mon, Wed, Fri correctly', () => {
  const result = parseNaturalLanguageTask(
    'Schedule gym on Monday, Wednesday, and Friday',
    '2026-10-28',
    sampleCategories
  );

  assert.equal(result.title.toLowerCase().includes('gym'), true);
  assert.equal(result.scheduleMode, 'repeat');
  assert.deepEqual(result.recurrenceDays, [1, 3, 5]); // Mon, Wed, Fri
  assert.equal(result.suggestedCategoryId, 'cat-fitness');
  // Did not invent a time silently
  assert.equal(result.preferredTime, null);
  assert.ok(result.ambiguitiesOrWarnings.some((w) => w.includes('No time specified')));
});

test('parseNaturalLanguageTask handles urgent single task tomorrow', () => {
  const result = parseNaturalLanguageTask(
    'Submit university assignment tomorrow at 2 pm urgent',
    '2026-10-28',
    sampleCategories
  );

  assert.equal(result.scheduleMode, 'single');
  assert.equal(result.dates[0], '2026-10-29'); // Tomorrow
  assert.equal(result.preferredTime, '14:00');
  assert.equal(result.priority, 'urgent');
});
