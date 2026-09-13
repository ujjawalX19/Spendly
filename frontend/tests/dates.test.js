import test from 'node:test';
import assert from 'node:assert/strict';
import { lastNDays, localDateKey, startOfLocalMonth } from '../src/lib/dates.js';

test('lastNDays returns 7 consecutive calendar days ending today, oldest first', () => {
  const now = new Date(2026, 8, 13, 23, 30); // 13 Sept 2026, 23:30 local
  const days = lastNDays(7, now);
  assert.deepEqual(days.map((d) => d.key), [
    '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13',
  ]);
});

test('lastNDays crosses month and year boundaries', () => {
  const days = lastNDays(3, new Date(2027, 0, 1, 8, 0));
  assert.deepEqual(days.map((d) => d.key), ['2026-12-30', '2026-12-31', '2027-01-01']);
});

test('same weekday from an earlier week is a different key (chart bucket bug)', () => {
  const thisMonday = localDateKey(new Date(2026, 8, 7, 10));
  const lastMonday = localDateKey(new Date(2026, 7, 31, 10));
  assert.notEqual(thisMonday, lastMonday);
  const keys = lastNDays(7, new Date(2026, 8, 13, 12)).map((d) => d.key);
  assert.ok(!keys.includes(lastMonday));
});

test('startOfLocalMonth is local midnight on the 1st', () => {
  const start = startOfLocalMonth(new Date(2026, 8, 13, 15));
  assert.equal(start.getDate(), 1);
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMonth(), 8);
});
