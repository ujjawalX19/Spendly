import test from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicate } from '../src/lib/duplicates.js';

const NOW = Date.parse('2026-03-18T10:00:00Z');
const ago = (min) => new Date(NOW - min * 60000).toISOString();

test('same amount and name within a day is flagged, any case', () => {
  const list = [{ amount: 120, category: 'Food', description: 'Zomato', occurred_at: ago(300) }];
  assert.ok(findDuplicate(list, { amount: 120, category: 'Shopping', description: ' zomato ' }, NOW));
  assert.equal(findDuplicate(list, { amount: 121, category: 'Food', description: 'Zomato' }, NOW), null);
});

test('same amount and category only counts within ten minutes', () => {
  const list = [{ amount: 50, category: 'Food', description: 'Tea', occurred_at: ago(5) }];
  assert.ok(findDuplicate(list, { amount: 50, category: 'Food', description: 'Coffee' }, NOW));
  assert.equal(findDuplicate([{ ...list[0], occurred_at: ago(11) }], { amount: 50, category: 'Food', description: 'Coffee' }, NOW), null);
});

test('old repeats, empty lists and bad dates are not flagged', () => {
  assert.equal(findDuplicate([{ amount: 120, category: 'Food', description: 'Zomato', occurred_at: ago(1500) }], { amount: 120, category: 'Food', description: 'Zomato' }, NOW), null);
  assert.equal(findDuplicate(undefined, { amount: 1 }, NOW), null);
  assert.equal(findDuplicate([{ amount: 1, category: 'Food', occurred_at: 'x' }], { amount: 1, category: 'Food' }, NOW), null);
});
