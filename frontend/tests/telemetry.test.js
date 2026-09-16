// App telemetry sends an anonymous install id, allow-listed events and
// enum-like properties only, counts a first launch once, and never throws.
import test from 'node:test';
import assert from 'node:assert/strict';
import { INSTALL_KEY, authFailureCode, createTelemetry, sanitizeProps } from '../src/lib/telemetryCore.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
}

function harness({ storage = memoryStorage(), ok = true, now = 1_800_000_000_000 } = {}) {
  const sent = [];
  let clock = now;
  const t = createTelemetry({
    storage,
    platform: 'android',
    appVersion: async () => '1.0.0',
    now: () => clock,
    schedule: () => 1, // flush manually in tests
    send: async (batch) => { sent.push(batch); return typeof ok === 'function' ? ok() : ok; },
  });
  return { t, sent, storage, advance: (ms) => { clock += ms; } };
}

test('first launch creates a random install id and is reported once', async () => {
  const { t, sent, storage } = harness();
  assert.match(t.installId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  t.recordOpen();
  await t.flush();
  assert.deepEqual(sent[0].events.map((e) => e.name), ['first_launch', 'app_open']);
  assert.equal(sent[0].installId, t.installId);
  assert.equal(sent[0].platform, 'android');
  assert.equal(sent[0].appVersion, '1.0.0');

  // Next cold start on the same install: no second first_launch.
  const again = harness({ storage });
  assert.equal(again.t.installId, t.installId);
  again.t.recordOpen();
  await again.t.flush();
  assert.equal(again.sent.length, 0, 'app_open is throttled to once per 30 minutes');
  assert.equal(storage.data.get(INSTALL_KEY), t.installId);
});

test('app_open is recorded again after 30 minutes', async () => {
  const { t, sent, advance } = harness();
  t.recordOpen();
  await t.flush();
  advance(31 * 60 * 1000);
  t.recordOpen();
  await t.flush();
  assert.deepEqual(sent[1].events.map((e) => e.name), ['app_open']);
});

test('unknown events and properties are dropped before anything is sent', async () => {
  const { t, sent } = harness({ storage: memoryStorage({ [INSTALL_KEY]: '11111111-1111-4111-8111-111111111111', [`${INSTALL_KEY}.reported`]: '1', 'vittova.lastOpenAt.v1': String(1_800_000_000_000) }) });
  assert.equal(t.track('expense_amount', { amount: 5000 }), false);
  t.track('login_failed', { method: 'email', code: 'invalid_credentials', email: 'a@b.com', message: 'Invalid login for a@b.com' });
  await t.flush();
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].events[0].props, { method: 'email', code: 'invalid_credentials' });
  assert.ok(!JSON.stringify(sent).includes('a@b.com'));
});

test('a sign-in is counted once per real Supabase sign-in, not per page load', async () => {
  const { t, sent } = harness();
  const user = { id: 'u1', last_sign_in_at: '2026-09-16T10:00:00Z', app_metadata: { provider: 'google' } };
  assert.equal(t.recordLogin(user), true);
  assert.equal(t.recordLogin(user), false);
  assert.equal(t.recordLogin({ ...user, last_sign_in_at: '2026-09-17T10:00:00Z', app_metadata: { provider: 'email' } }), true);
  await t.flush();
  assert.deepEqual(sent[0].events.map((e) => e.props.method), ['google', 'email']);
});

test('undelivered events are kept for the next attempt, and failures never throw', async () => {
  let online = false;
  const { t, sent } = harness({ ok: () => online });
  t.track('logout');
  assert.equal(await t.flush(), false);
  assert.equal(t.pending, 1);
  online = true;
  assert.equal(await t.flush(), true);
  assert.equal(t.pending, 0);
  assert.equal(sent.length, 2);

  const broken = createTelemetry({ storage: null, platform: 'web', send: async () => { throw new Error('offline'); }, schedule: () => 1 });
  broken.track('app_open');
  assert.equal(await broken.flush(), false);
});

test('auth failures are reduced to a category, never the raw message', () => {
  assert.equal(authFailureCode({ message: 'Invalid login credentials' }), 'invalid_credentials');
  assert.equal(authFailureCode({ status: 429, message: 'x' }), 'rate_limited');
  assert.equal(authFailureCode({ message: 'Email not confirmed' }), 'email_not_confirmed');
  assert.equal(authFailureCode({ message: 'User already registered' }), 'user_exists');
  assert.equal(authFailureCode({ message: 'Failed to fetch' }), 'network');
  assert.equal(authFailureCode({ message: 'Something odd for someone@example.com' }), 'other');
  assert.deepEqual(sanitizeProps({ kind: 'TypeError', code: 'Has Spaces' }), { kind: 'TypeError' });
});
