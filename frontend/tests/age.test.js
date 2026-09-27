// The app's age rule must match the server's (backend/lib/ageAccess.js) exactly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ageFrom, toBirthYearMonth, yearOptions } from '../src/lib/age.js';

const require = createRequire(import.meta.url);
const server = require('../../backend/lib/ageAccess.js');

test('app and server compute the same age for every month of a sample range', () => {
  const now = new Date('2026-09-27T12:00:00+05:30');
  for (let y = 2005; y <= 2012; y++) {
    for (let m = 1; m <= 12; m++) {
      const v = toBirthYearMonth(y, m);
      assert.equal(ageFrom(v, now), server.ageFrom(v, now), v);
    }
  }
});

test('the picker has no default and offers 101 years, newest first', () => {
  const years = yearOptions(new Date('2026-09-27'));
  assert.equal(years.length, 101);
  assert.equal(years[0], 2026);
  assert.equal(toBirthYearMonth('', 3), null);
  assert.equal(toBirthYearMonth(2001, ''), null);
  assert.equal(toBirthYearMonth(2001, 3), '2001-03');
});
