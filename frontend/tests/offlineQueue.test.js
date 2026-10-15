// Mission actions without signal (v1.14): kept on the phone with their own id,
// sent once, in order, when the connection is back; a day-bound action that
// arrives after its day is marked expired; nothing survives into another
// account; the cached mission is only ever today's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueue, requestFor, istDateKey, newEventId, cacheMissionState, cachedMissionState, isRetryable } from '../src/lib/offlineQueue.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}
const T = Date.parse('2026-10-15T14:00:00+05:30');

test('India-time day keys and unique event ids', () => {
  assert.equal(istDateKey(new Date('2026-10-15T20:00:00Z')), '2026-10-16', '01:30 IST is the next day');
  assert.equal(istDateKey(new Date('2026-10-15T18:00:00Z')), '2026-10-15');
  const ids = new Set(Array.from({ length: 200 }, () => newEventId()));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('an action is queued with only what the user did, never a reward', () => {
  const q = createQueue('u1', { storage: memoryStorage(), now: () => T });
  const ns = q.enqueue('no_spend', { xp: 500, points: 99 });
  assert.deepEqual(Object.keys(ns.body).sort(), ['dateKey', 'eventId']);
  assert.equal(ns.body.dateKey, '2026-10-15');
  const ci = q.enqueue('checkin', { mission: 'bill_ready', points: 1000 });
  assert.deepEqual(Object.keys(ci.body).sort(), ['dateKey', 'eventId', 'mission']);
  const gc = q.enqueue('goal_contribution', { amountInr: 500, xp: 50 }, { goalId: 'g1' });
  assert.deepEqual(Object.keys(gc.body).sort(), ['amountInr', 'clientRef', 'contributedOn']);
  assert.equal(gc.body.contributedOn, '2026-10-15', 'counts on the day it was made, whenever it syncs');
  assert.deepEqual(requestFor(gc), { path: '/goals/g1/contributions', method: 'POST', body: gc.body });
  assert.deepEqual(requestFor(ns).path, '/money-streak/no-spend');
  assert.throws(() => q.enqueue('give_points', {}));
});

test('the same action twice on a day is one item', () => {
  const q = createQueue('u1', { storage: memoryStorage(), now: () => T });
  const a = q.enqueue('no_spend', {});
  const b = q.enqueue('no_spend', {});
  assert.equal(a.id, b.id);
  q.enqueue('checkin', { mission: 'bill_ready' });
  q.enqueue('checkin', { mission: 'bill_ready' });
  q.enqueue('goal_contribution', { amountInr: 100 }, { goalId: 'g' });
  q.enqueue('goal_contribution', { amountInr: 100 }, { goalId: 'g' }); // a second, deliberate entry
  assert.equal(q.pending().length, 4);
});

test('offline: items wait, in order, and survive an app restart', async () => {
  const storage = memoryStorage();
  const q = createQueue('u1', { storage, now: () => T });
  q.enqueue('no_spend', {});
  q.enqueue('goal_contribution', { amountInr: 300 }, { goalId: 'g' });
  const sent = [];
  const r1 = await q.flush(async (item) => { sent.push(item.kind); return { ok: false, offline: true }; });
  assert.deepEqual(r1, { sent: 0, expired: 0, failed: 0, waiting: 2 });
  assert.deepEqual(sent, ['no_spend'], 'later items wait behind the first');

  const restarted = createQueue('u1', { storage, now: () => T + 3600000 });
  assert.equal(restarted.pending().length, 2);
  assert.equal(restarted.pending()[0].attempts, 1);
  const order = [];
  const r2 = await restarted.flush(async (item) => { order.push(item.kind); return { ok: true }; });
  assert.deepEqual(order, ['no_spend', 'goal_contribution']);
  assert.equal(r2.sent, 2);
  assert.equal(restarted.pending().length, 0);
});

test('a retried send carries the same event id, so the server can count it once', async () => {
  const q = createQueue('u1', { storage: memoryStorage(), now: () => T });
  q.enqueue('checkin', { mission: 'review_recurring' });
  const ids = [];
  await q.flush(async (item) => { ids.push(item.body.eventId); return { ok: false, status: 503 }; });
  await q.flush(async (item) => { ids.push(item.body.eventId); return { ok: true }; });
  assert.equal(ids.length, 2);
  assert.equal(ids[0], ids[1]);
});

test('a day that ended before syncing: expired, not counted; refusals are final', async () => {
  const q = createQueue('u1', { storage: memoryStorage(), now: () => T });
  q.enqueue('no_spend', {});
  q.enqueue('checkin', { mission: 'bill_ready' });
  const r = await q.flush(async (item) => (item.kind === 'no_spend'
    ? { ok: false, status: 409, code: 'DAY_ENDED' }
    : { ok: false, status: 409, code: 'NOT_TODAYS_MISSION', message: "That isn't today's mission any more." }));
  assert.deepEqual(r, { sent: 0, expired: 1, failed: 1, waiting: 0 });
  const items = q.items();
  assert.equal(items.find((i) => i.kind === 'no_spend').status, 'expired');
  assert.match(items.find((i) => i.kind === 'no_spend').lastError, /did not count/);
  assert.equal(items.find((i) => i.kind === 'checkin').status, 'failed');
});

test('what counts as worth retrying', () => {
  assert.ok(isRetryable({ offline: true }));
  for (const s of [undefined, 0, 408, 429, 500, 502, 503, 504]) assert.ok(isRetryable({ status: s }), String(s));
  for (const s of [400, 401, 403, 404, 409]) assert.ok(!isRetryable({ status: s }), String(s));
});

test("one account's queue is never sent by another", () => {
  const storage = memoryStorage();
  createQueue('alice', { storage, now: () => T }).enqueue('no_spend', {});
  assert.equal(createQueue('bob', { storage, now: () => T }).pending().length, 0);
  createQueue('alice', { storage, now: () => T }).clear();
  assert.equal(createQueue('alice', { storage, now: () => T }).pending().length, 0);
});

test("the cached mission is shown only for its own account and only on its own day", () => {
  const storage = memoryStorage();
  const streak = { current: 3, today: { dateKey: '2026-10-15', mission: { title: 'Log today' } } };
  cacheMissionState('u1', streak, { storage, now: () => T });
  const c = cachedMissionState('u1', { storage, now: () => T + 3600000 });
  assert.equal(c.offline, true);
  assert.equal(c.current, 3);
  assert.equal(cachedMissionState('u2', { storage, now: () => T }), null);
  assert.equal(cachedMissionState('u1', { storage, now: () => Date.parse('2026-10-16T00:30:00+05:30') }), null, "yesterday's mission is never today's");
});
