import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  timeToMinutes,
  minutesToTime,
  generateAutoChunks,
  calculateTotalDurationMinutes,
  formatDurationHuman,
} from './timetable';

describe('Timetable Division Logic', () => {
  test('timeToMinutes and minutesToTime bidirectionally convert accurately', () => {
    assert.equal(timeToMinutes('00:00'), 0);
    assert.equal(timeToMinutes('08:30'), 510);
    assert.equal(timeToMinutes('10:00'), 600);
    assert.equal(timeToMinutes('12:00'), 720);
    assert.equal(timeToMinutes('23:59'), 1439);

    assert.equal(minutesToTime(0), '00:00');
    assert.equal(minutesToTime(510), '08:30');
    assert.equal(minutesToTime(600), '10:00');
    assert.equal(minutesToTime(720), '12:00');
  });

  test('Auto-division: 10:00 to 12:00 with 30m chunk divides into exactly 4 chunks of 30 mins', () => {
    const slots = generateAutoChunks({
      startTime: '10:00',
      endTime: '12:00',
      chunkMinutes: 30,
      breakMinutes: 0,
    });

    assert.equal(slots.length, 4, 'Must create 4 distinct blocks');
    assert.equal(slots[0].startTime, '10:00');
    assert.equal(slots[0].endTime, '10:30');

    assert.equal(slots[1].startTime, '10:30');
    assert.equal(slots[1].endTime, '11:00');

    assert.equal(slots[2].startTime, '11:00');
    assert.equal(slots[2].endTime, '11:30');

    assert.equal(slots[3].startTime, '11:30');
    assert.equal(slots[3].endTime, '12:00');
  });

  test('Auto-division: 08:00 to 12:00 with 60m chunk divides into exactly 4 hourly blocks', () => {
    const slots = generateAutoChunks({
      startTime: '08:00',
      endTime: '12:00',
      chunkMinutes: 60,
      breakMinutes: 0,
    });

    assert.equal(slots.length, 4, 'Must create 4 hourly blocks');
    assert.equal(slots[0].startTime, '08:00');
    assert.equal(slots[0].endTime, '09:00');

    assert.equal(slots[1].startTime, '09:00');
    assert.equal(slots[1].endTime, '10:00');

    assert.equal(slots[2].startTime, '10:00');
    assert.equal(slots[2].endTime, '11:00');

    assert.equal(slots[3].startTime, '11:00');
    assert.equal(slots[3].endTime, '12:00');
  });

  test('Auto-division with break buffer: 09:00 to 11:00 with 50m chunk and 10m break', () => {
    const slots = generateAutoChunks({
      startTime: '09:00',
      endTime: '11:00',
      chunkMinutes: 50,
      breakMinutes: 10,
    });

    assert.equal(slots.length, 2);
    assert.equal(slots[0].startTime, '09:00');
    assert.equal(slots[0].endTime, '09:50');
    // 10m break -> 10:00 start
    assert.equal(slots[1].startTime, '10:00');
    assert.equal(slots[1].endTime, '10:50');
  });

  test('Total duration and human formatting', () => {
    const slots = [
      { id: '1', title: 'A', startTime: '08:00', endTime: '09:30', priority: 'medium' as const },
      { id: '2', title: 'B', startTime: '10:00', endTime: '11:00', priority: 'medium' as const },
    ];
    const total = calculateTotalDurationMinutes(slots);
    assert.equal(total, 150); // 90 + 60
    assert.equal(formatDurationHuman(total), '2h 30m');
  });
});
