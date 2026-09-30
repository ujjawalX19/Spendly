// Automatic payment tracking, upload half: the truthful state model, the
// automatic/ask-first choice, and whole sync rounds against a simulated phone
// queue and server (offline, retry, duplicates, expired sign-in, review).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACKING, trackingState, stateCopy, resolveMode, planSync, expenseBody, outcomeFor, runSync, summarize,
} from '../src/lib/paymentTracking.js';

const id = (n) => String(n).padStart(32, 'a').slice(-32).replace(/[^0-9a-f]/g, 'a');
const T = Date.UTC(2026, 8, 30, 8, 0, 0);
const payment = (n, overrides = {}) => ({
  id: id(n), kind: 'EXPENSE', amount: 150, merchant: 'Chai Point', app: 'GPay', timestamp: T + n * 1000,
  status: 'PENDING_SYNC', needsConfirmation: false, attempts: 0, lastError: '', ...overrides,
});

// ── State ───────────────────────────────────────────────────────────────────

test('tracking is ON only when Vittova\'s switch AND Android access are both on', () => {
  const on = { granted: true, trackingEnabled: true, listenerConnected: true, listenerChangedAt: T };
  assert.equal(trackingState({ supported: true, info: on }), TRACKING.ENABLED);
  assert.equal(trackingState({ supported: true, info: { ...on, granted: false } }), TRACKING.PERMISSION_REQUIRED);
  assert.equal(trackingState({ supported: true, info: { ...on, trackingEnabled: false } }), TRACKING.DISABLED);
  assert.equal(trackingState({ supported: true, info: { ...on, trackingEnabled: false, granted: false } }), TRACKING.DISABLED);
  assert.equal(trackingState({ supported: true, info: { ...on, listenerConnected: false } }), TRACKING.TEMPORARILY_UNAVAILABLE);
  // No disconnect ever recorded (e.g. just updated): not reported as a problem.
  assert.equal(trackingState({ supported: true, info: { ...on, listenerConnected: false, listenerChangedAt: 0 } }), TRACKING.ENABLED);
  assert.equal(trackingState({ supported: true, info: null, error: true }), TRACKING.ERROR);
  assert.equal(trackingState({ supported: false, info: on }), TRACKING.UNSUPPORTED);
});

test('the app never claims tracking is active unless it is', () => {
  for (const state of Object.values(TRACKING)) {
    const copy = stateCopy(state);
    const claimsActive = /are added|is on|active/i.test(`${copy.label} ${copy.detail}`);
    assert.equal(claimsActive, state === TRACKING.ENABLED, state);
  }
  // Bank SMS is the main source, so a missing permission asks for SMS first.
  assert.equal(stateCopy(TRACKING.PERMISSION_REQUIRED).action, 'allow_sms');
  assert.equal(stateCopy(TRACKING.TEMPORARILY_UNAVAILABLE).action, 'open_app_settings');
  // Manufacturer-specific advice only where it is relevant.
  assert.match(stateCopy(TRACKING.TEMPORARILY_UNAVAILABLE, { manufacturer: 'vivo' }).detail, /auto-start/);
  assert.doesNotMatch(stateCopy(TRACKING.TEMPORARILY_UNAVAILABLE, { manufacturer: 'google' }).detail, /auto-start/);
});

test('bank SMS alone is enough, and it does not depend on the notification listener', () => {
  const sms = { granted: false, smsGranted: true, smsEnabled: true, trackingEnabled: true, listenerConnected: false, listenerChangedAt: T };
  assert.equal(trackingState({ supported: true, info: sms }), TRACKING.ENABLED);
  // Vittova's own SMS switch off and no notifications: nothing can be captured.
  assert.equal(trackingState({ supported: true, info: { ...sms, smsEnabled: false } }), TRACKING.PERMISSION_REQUIRED);
  // Android permission removed: the stored switch alone does not count.
  assert.equal(trackingState({ supported: true, info: { ...sms, smsGranted: false } }), TRACKING.PERMISSION_REQUIRED);
  // The master switch still wins.
  assert.equal(trackingState({ supported: true, info: { ...sms, trackingEnabled: false } }), TRACKING.DISABLED);
  // Both sources: the listener dropping out does not pause tracking.
  assert.equal(trackingState({ supported: true, info: { ...sms, granted: true } }), TRACKING.ENABLED);

  // The "On" wording names only the sources that are really on.
  const smsOnly = stateCopy(TRACKING.ENABLED, { info: sms });
  assert.match(smsOnly.detail, /bank's debit SMS/);
  assert.equal(smsOnly.action, null);
  const both = stateCopy(TRACKING.ENABLED, { info: { ...sms, granted: true } });
  assert.match(both.detail, /bank SMS and supported payment apps/);
  const notifOnly = stateCopy(TRACKING.ENABLED, { info: { granted: true, trackingEnabled: true } });
  assert.doesNotMatch(notifOnly.detail, /from your bank/);
  assert.equal(notifOnly.action, 'allow_sms');
});

test('automatic adding needs a choice made with the automatic wording in front of the user', () => {
  assert.deepEqual(resolveMode('auto'), { mode: 'auto', needsChoice: false });
  assert.deepEqual(resolveMode('review'), { mode: 'review', needsChoice: false });
  // Turned on before automatic adding existed ("ask before adding"): ask once, review meanwhile.
  assert.deepEqual(resolveMode(null), { mode: 'review', needsChoice: true });
  assert.deepEqual(resolveMode('garbage'), { mode: 'review', needsChoice: true });
});

// ── Planning and requests ───────────────────────────────────────────────────

test('clear payments upload automatically; unsure ones and ask-first mode wait for the user', () => {
  const clear = payment(1);
  const unsure = payment(2, { status: 'NEEDS_REVIEW', needsConfirmation: true });
  const auto = planSync([clear, unsure], { mode: 'auto' });
  assert.deepEqual(auto.upload.map((p) => p.id), [clear.id]);
  assert.deepEqual(auto.review.map((p) => p.id), [unsure.id]);
  const ask = planSync([clear, unsure], { mode: 'review' });
  assert.equal(ask.upload.length, 0);
  assert.equal(ask.review.length, 2);
  assert.deepEqual(summarize([clear, unsure], { mode: 'auto' }), { waiting: 1, review: 1 });
});

test('malformed or non-expense entries are never uploaded', () => {
  const bad = [
    payment(3, { id: 'not-an-id' }), payment(4, { amount: 0 }), payment(5, { amount: -20 }),
    payment(6, { kind: 'INCOME' }), null, {},
  ];
  const plan = planSync(bad, { mode: 'auto' });
  assert.equal(plan.upload.length, 0);
});

test('the upload carries only the parsed facts, dated when the payment happened', () => {
  const p = payment(7, { merchant: 'Chai Point', amount: 149.999 });
  const body = expenseBody(p, { idempotent: true });
  assert.deepEqual(Object.keys(body).sort(), ['amount', 'category', 'client_ref', 'description', 'occurred_at', 'source']);
  assert.equal(body.source, 'upi_auto');
  assert.equal(body.client_ref, p.id);
  assert.equal(body.amount, 150);
  assert.equal(body.occurred_at, new Date(p.timestamp).toISOString());
  // An older server rejects unknown fields: no client_ref then.
  assert.equal('client_ref' in expenseBody(p, { idempotent: false }), false);
  // No payee: a neutral description, never "Unknown".
  assert.equal(expenseBody(payment(8, { merchant: 'Unknown' }), { idempotent: true }).description, 'UPI payment');
  // A corrected amount from the review card.
  assert.equal(expenseBody(p, { idempotent: true, amount: 99.5 }).amount, 99.5);
});

test('server answers map to keep / retry / review / stop', () => {
  assert.equal(outcomeFor(201, { success: true }), 'synced');
  assert.equal(outcomeFor(200, { success: true, duplicate: true }), 'synced');
  assert.equal(outcomeFor(401, {}), 'auth');
  assert.equal(outcomeFor(429, { code: 'QUOTA_EXCEEDED' }), 'stop');
  assert.equal(outcomeFor(403, { code: 'AGE_RESTRICTED' }), 'stop');
  assert.equal(outcomeFor(400, {}), 'review');
  assert.equal(outcomeFor(500, {}), 'retry');
  assert.equal(outcomeFor(0, {}), 'retry');
});

// ── Whole rounds ────────────────────────────────────────────────────────────

/** A phone queue and a server that stores each client_ref once. */
function world({ queue = [], serverDown = false, signedIn = true } = {}) {
  const w = { queue: queue.map((p) => ({ ...p })), done: [], server: new Map(), requests: 0, serverDown, signedIn };
  w.io = {
    list: async () => w.queue.map((p) => ({ ...p })),
    post: async (body) => {
      w.requests++;
      if (w.serverDown) throw new TypeError('Failed to fetch');
      if (!w.signedIn) return { status: 401, body: {} };
      if (body.client_ref && w.server.has(body.client_ref)) return { status: 200, body: { success: true, duplicate: true } };
      const key = body.client_ref || `row${w.server.size}`;
      w.server.set(key, body);
      return { status: 201, body: { success: true } };
    },
    resolve: async (pid, outcome) => {
      const i = w.queue.findIndex((p) => p.id === pid);
      if (i >= 0) w.done.push({ ...w.queue.splice(i, 1)[0], outcome });
    },
    markAttempt: async (pid, code) => {
      const p = w.queue.find((q) => q.id === pid);
      if (p) { p.attempts++; p.lastError = code; }
    },
    markForReview: async (pid) => {
      const p = w.queue.find((q) => q.id === pid);
      if (p) p.status = 'NEEDS_REVIEW';
    },
  };
  return w;
}

test('payments captured while the app was closed are uploaded when it opens', async () => {
  const w = world({ queue: [payment(1), payment(2, { merchant: 'Metro', amount: 40 })] });
  const r = await runSync(w.io, { mode: 'auto', idempotent: true });
  assert.deepEqual(r, { synced: 2, review: 0, pending: 0, stoppedBy: null });
  assert.equal(w.queue.length, 0);
  assert.equal(w.server.size, 2);
});

test('offline: nothing is lost, and the next round uploads it', async () => {
  const w = world({ queue: [payment(1), payment(2)], serverDown: true });
  const first = await runSync(w.io, { mode: 'auto', idempotent: true });
  assert.equal(first.stoppedBy, 'retry');
  assert.equal(first.pending, 2);
  assert.equal(w.requests, 1, 'one failed request, not a retry storm');
  assert.equal(w.queue.length, 2);
  assert.equal(w.queue[0].lastError, 'network');

  w.serverDown = false; // network back
  const second = await runSync(w.io, { mode: 'auto', idempotent: true });
  assert.equal(second.synced, 2);
  assert.equal(w.queue.length, 0);
});

test('a lost response and a retry still make exactly one expense', async () => {
  const w = world({ queue: [payment(1)] });
  // The server saved it but the phone never heard back (resolve never ran).
  const realResolve = w.io.resolve;
  w.io.resolve = async () => {};
  await runSync(w.io, { mode: 'auto', idempotent: true });
  assert.equal(w.queue.length, 1, 'still queued on the phone');
  w.io.resolve = realResolve;
  const retry = await runSync(w.io, { mode: 'auto', idempotent: true });
  assert.equal(retry.synced, 1);
  assert.equal(w.server.size, 1, 'the server stored it once');
  assert.equal(w.queue.length, 0);
});

test('signed out or session expired: kept on the phone, nothing uploaded', async () => {
  const w = world({ queue: [payment(1)], signedIn: false });
  const r = await runSync(w.io, { mode: 'auto', idempotent: true });
  assert.equal(r.stoppedBy, 'auth');
  assert.equal(w.queue.length, 1);
  assert.equal(w.server.size, 0);
  w.signedIn = true;
  assert.equal((await runSync(w.io, { mode: 'auto', idempotent: true })).synced, 1);
});

test('a payment the server refuses as automatic goes to the user instead of looping', async () => {
  const w = world({ queue: [payment(1), payment(2)] });
  const post = w.io.post;
  w.io.post = async (body) => (body.client_ref === id(1) ? { status: 400, body: { message: 'too old' } } : post(body));
  const r = await runSync(w.io, { mode: 'auto', idempotent: true });
  assert.equal(r.synced, 1);
  assert.equal(r.review, 1);
  assert.equal(w.queue[0].status, 'NEEDS_REVIEW');
  // Next round: review items are not retried automatically.
  const before = w.requests;
  await runSync(w.io, { mode: 'auto', idempotent: true });
  assert.equal(w.requests, before);
});

test('ask-first mode never uploads on its own', async () => {
  const w = world({ queue: [payment(1)] });
  const r = await runSync(w.io, { mode: 'review', idempotent: true });
  assert.deepEqual(r, { synced: 0, review: 1, pending: 0, stoppedBy: null });
  assert.equal(w.requests, 0);
});

test('the daily free limit pauses uploads without dropping anything', async () => {
  const w = world({ queue: [payment(1), payment(2)] });
  w.io.post = async () => ({ status: 429, body: { code: 'QUOTA_EXCEEDED' } });
  const r = await runSync(w.io, { mode: 'auto', idempotent: true });
  assert.equal(r.stoppedBy, 'stop');
  assert.equal(w.queue.length, 2);
});
