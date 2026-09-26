// v1.1 display helpers: how typed amounts are read, and how API results are
// labelled. No money is calculated on the client.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAmount, verdictBadge, stateBadge, quotaLine, compactInr, dayDot, missionStatus } from '../src/lib/moneyDisplay.js';

const here = dirname(fileURLToPath(import.meta.url));

test('amounts are read the way people type them', () => {
  assert.deepEqual(parseAmount('2499'), { amount: 2499 });
  assert.deepEqual(parseAmount('2,499'), { amount: 2499 });
  assert.deepEqual(parseAmount('₹2,499.50'), { amount: 2499.5 });
  assert.deepEqual(parseAmount(' 2.5k '), { amount: 2500 });
  assert.deepEqual(parseAmount('1.2 lakh'), { amount: 120000 });
  assert.deepEqual(parseAmount('Rs. 300'), { amount: 300 });
});

test('zero, negative, junk and huge amounts are refused with a sentence', () => {
  for (const bad of ['', '0', '-500', 'abc', '12abc', '1e9', '200 lakh']) {
    const r = parseAmount(bad);
    assert.ok(r.error && !('amount' in r), `${bad} → ${JSON.stringify(r)}`);
    assert.match(r.error, /^[A-Z].*\.$/);
  }
});

test('verdicts and states map to calm labels, never shaming ones', () => {
  assert.equal(verdictBadge('can_afford').label, 'Comfortable');
  assert.equal(verdictBadge('wait').label, 'Wait');
  assert.equal(verdictBadge('not_comfortable').label, 'Too tight');
  assert.equal(verdictBadge('unknown').label, 'Wait');
  assert.equal(stateBadge('tight').label, 'Tight');
  assert.equal(stateBadge('watch').label, 'Watch spending');
  const all = [verdictBadge('not_comfortable'), stateBadge('tight'), missionStatus('missed')].map((b) => b.label).join(' ');
  assert.doesNotMatch(all, /bad|irresponsible|fail|wasted/i);
});

test('quota line shows free checks left, and nothing for unlimited', () => {
  assert.equal(quotaLine({ limit: 5, remaining: 4 }), '4 of 5 free checks left today');
  assert.equal(quotaLine({ limit: 5, remaining: -2 }), '0 of 5 free checks left today');
  assert.equal(quotaLine(null), null);
  assert.equal(quotaLine({ limit: null }), null);
});

test('chart axis labels never repeat for different values (₹1.5k vs ₹2k)', () => {
  assert.deepEqual([0, 500, 1000, 1500, 2000, 2500].map(compactInr), ['₹0', '₹500', '₹1k', '₹1.5k', '₹2k', '₹2.5k']);
  assert.equal(compactInr(150000), '₹1.5L');
  assert.equal(compactInr(200000), '₹2L');
});

test('streak dots and mission states have accessible labels', () => {
  for (const s of ['kept', 'missed', 'today', 'upcoming', 'not_started']) assert.ok(dayDot(s).label);
  assert.equal(missionStatus('on_track').label, 'On track');
});

test('the client never computes Safe-to-Spend, Afford-It or XP itself', () => {
  for (const file of ['components/AffordItCard.jsx', 'components/MoneyStreakCard.jsx', 'components/MoneyDecisionCards.jsx', 'lib/moneyDisplay.js']) {
    const text = readFileSync(join(here, '..', 'src', file), 'utf8');
    assert.doesNotMatch(text, /monthly_budget\s*-|investment_target|is_pro\s*=|xp\s*\+=/i, file);
  }
});
