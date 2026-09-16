/**
 * Owner Console v1.6: every new admin endpoint is owner-only, install and
 * product telemetry is allow-listed and privacy-scoped, dashboard figures
 * match the rows they are counted from, AI health and the Error Center judge
 * real data, and nothing secret is ever returned.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startTestApp } = require('./helpers/testApp');

const OWNER_EMAIL = 'owner@vittova.test';
const DAY = 86400000;

let t;
let owner;
test.before(async () => {
    t = await startTestApp({ env: { ADMIN_EMAIL: OWNER_EMAIL, GEMINI_API_KEY: 'test-gemini-secret-value' } });
    owner = t.db.addUser({ email: OWNER_EMAIL, role: 'admin' });
});
test.after(async () => { await t.close(); });
test.beforeEach(async () => {
    await t.resetRateLimits();
    t.db.failures = [];
    t.gemini.configured = true;
    t.gemini.reply = 'Here is a general explanation of your spending this month.';
});

const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const seed = (table, rows) => { t.db.tables[table] = [...(t.db.tables[table] || []), ...rows]; };
const rows = (table, where = () => true) => (t.db.tables[table] || []).filter(where);
const get = (url, token = owner.token) => t.request('GET', url, { token });
const post = (url, body, token = owner.token) => t.request('POST', url, { token, body });
/** Telemetry is written after the response is sent. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
const uuid = () => crypto.randomUUID();

const ADMIN_GETS = ['/me', '/overview', '/dashboard', '/activity', '/installs', '/engagement', '/ai', '/errors', '/settings', '/health', '/users', '/pro', '/audit', '/audit-log'];

// ─── Authorization ──────────────────────────────────────────────────────────

test('a normal user gets 404 from every admin endpoint, reads and writes alike', async () => {
    const user = t.db.addUser();
    for (const path of ADMIN_GETS) {
        const res = await get(`/api/admin${path}`, user.token);
        assert.equal(res.status, 404, path);
        assert.equal(res.body.message, 'Not found', path);
    }
    const fingerprint = 'http_5xx|POST /api/expenses|-|500';
    assert.equal((await post('/api/admin/errors/resolve', { fingerprint }, user.token)).status, 404);
    assert.equal((await post('/api/admin/errors/reopen', { fingerprint, reason: 'nope' }, user.token)).status, 404);
    assert.equal(rows('ops_issue_states').length, 0);
});

test('unauthenticated and forged-token requests never reach admin data', async () => {
    for (const path of ADMIN_GETS) {
        assert.equal((await t.request('GET', `/api/admin${path}`)).status, 401, path);
        assert.equal((await t.request('GET', `/api/admin${path}`, { token: 'forged.jwt.token' })).status, 401, path);
    }
});

test('a client cannot make itself admin through any request field', async () => {
    const user = t.db.addUser();
    for (const headers of [{ 'X-Admin': 'true' }, { 'X-Role': 'admin' }]) {
        assert.equal((await t.request('GET', '/api/admin/dashboard?role=admin', { token: user.token, headers })).status, 404);
    }
    // No API accepts `role`: the profile row is unchanged after trying.
    await t.request('PUT', '/api/account/budget', { token: user.token, body: { monthly_budget: 5000, role: 'admin' } });
    await t.request('POST', '/api/auth/profile', { token: user.token, body: { role: 'admin' } });
    assert.equal(t.db.profile(user.id).role, 'user');
});

test('the owner can open every section, and opening the console is audited once per window', async () => {
    const before = rows('admin_audit_log', (a) => a.action === 'admin_login').length;
    for (const path of ADMIN_GETS) {
        const res = await get(`/api/admin${path}`);
        assert.equal(res.status, 200, `${path}: ${JSON.stringify(res.body)}`);
        assert.equal(res.headers.get('cache-control'), 'no-store', path);
    }
    await get('/api/admin/me');
    const logins = rows('admin_audit_log', (a) => a.action === 'admin_login');
    assert.equal(logins.length, before + (before === 0 ? 1 : 0));
    assert.equal(logins.at(-1).actor_email, OWNER_EMAIL);
});

// ─── Telemetry ingestion ────────────────────────────────────────────────────

const batch = (overrides = {}) => ({ installId: uuid(), platform: 'android', appVersion: '1.0.0', events: [{ name: 'first_launch' }], ...overrides });

test('an anonymous first launch creates one install, counted once however often it is replayed', async () => {
    const body = batch();
    const res = await t.request('POST', '/api/telemetry/events', { body });
    assert.equal(res.status, 202);
    assert.equal(res.body.accepted, 1);
    await t.request('POST', '/api/telemetry/events', { body: { ...body, events: [{ name: 'first_launch' }, { name: 'app_open' }] } });

    const install = rows('app_installs', (r) => r.install_id === body.installId);
    assert.equal(install.length, 1);
    assert.equal(install[0].platform, 'android');
    assert.equal(install[0].user_id, undefined);
    const events = rows('app_events', (r) => r.install_id === body.installId);
    assert.deepEqual(events.map((e) => e.name).sort(), ['app_open', 'first_launch']);
    assert.ok(events.every((e) => e.source === 'client' && e.user_id === null));
});

test('only allow-listed events and properties are stored; nothing personal gets through', async () => {
    const body = batch({
        events: [
            { name: 'login', props: { method: 'google', email: 'someone@example.com', token: 'eyJhbGci', amount: 5000 } },
            { name: 'expense_created', props: { source: 'manual' } }, // server-only event: dropped
            { name: 'totally_made_up' },
            { name: 'login_failed', props: { method: 'email', code: 'Invalid login credentials' } }, // not a code: dropped prop
            { name: 'app_crash', props: { kind: 'TypeError' } },
        ],
    });
    const res = await t.request('POST', '/api/telemetry/events', { body });
    assert.equal(res.status, 202);
    const stored = rows('app_events', (r) => r.install_id === body.installId);
    assert.deepEqual(stored.map((e) => e.name), ['login', 'login_failed', 'app_crash']);
    assert.deepEqual(stored[0].props, { method: 'google' });
    assert.deepEqual(stored[1].props, { method: 'email' });
    assert.deepEqual(stored[2].props, { kind: 'TypeError' });
    const json = JSON.stringify(stored);
    for (const leaked of ['someone@example.com', 'eyJhbGci', '5000', 'Invalid login']) assert.ok(!json.includes(leaked), leaked);
});

test('malformed telemetry is rejected', async () => {
    const bad = [
        batch({ installId: 'not-a-uuid' }),
        batch({ platform: 'windows' }),
        batch({ appVersion: '1.0; drop table' }),
        batch({ events: [] }),
        batch({ events: Array.from({ length: 26 }, () => ({ name: 'app_open' })) }),
        { ...batch(), deviceId: 'IMEI123' },
    ];
    for (const body of bad) {
        assert.equal((await t.request('POST', '/api/telemetry/events', { body })).status, 400, JSON.stringify(body).slice(0, 80));
    }
});

test('a signed-in batch links the install to the account; a bad token is ignored, not rejected', async () => {
    const user = t.db.addUser();
    const body = batch({ events: [{ name: 'login', props: { method: 'email' } }] });
    assert.equal((await t.request('POST', '/api/telemetry/events', { body, token: user.token })).status, 202);
    assert.equal(rows('app_installs', (r) => r.install_id === body.installId)[0].user_id, user.id);
    assert.equal(rows('app_events', (r) => r.install_id === body.installId)[0].user_id, user.id);

    // A later anonymous batch (signed out) does not unlink the install.
    assert.equal((await t.request('POST', '/api/telemetry/events', { body: { ...body, events: [{ name: 'app_open' }] }, token: 'expired-token' })).status, 202);
    assert.equal(rows('app_installs', (r) => r.install_id === body.installId)[0].user_id, user.id);
});

test('telemetry never fails the app when the tables are missing', async () => {
    t.db.failures.push({ table: 'app_installs' }, { table: 'app_events' });
    const res = await t.request('POST', '/api/telemetry/events', { body: batch() });
    assert.equal(res.status, 202);
    assert.equal(res.body.accepted, 0);
});

// ─── Server-side events ─────────────────────────────────────────────────────

test('API outcomes are recorded as product events without financial details', async () => {
    const user = t.db.addUser();
    const created = await t.request('POST', '/api/expenses', { token: user.token, body: { amount: 4321, category: 'Food', description: 'Secret dinner', source: 'manual' } });
    assert.equal(created.status, 201);
    const id = created.body.expense.id;
    await t.request('PATCH', `/api/expenses/${id}`, { token: user.token, body: { description: 'Still secret' } });
    await t.request('DELETE', `/api/expenses/${id}`, { token: user.token });
    await t.request('GET', '/api/expenses/export.csv', { token: user.token });
    await settle();

    const mine = rows('app_events', (e) => e.user_id === user.id).map((e) => e.name);
    assert.deepEqual(mine.sort(), ['csv_exported', 'expense_created', 'expense_deleted', 'expense_edited']);
    const createdEvent = rows('app_events', (e) => e.user_id === user.id && e.name === 'expense_created')[0];
    assert.equal(createdEvent.source, 'server');
    assert.deepEqual(createdEvent.props, { source: 'manual' });
    const json = JSON.stringify(rows('app_events', (e) => e.user_id === user.id));
    for (const leaked of ['4321', 'Secret dinner', 'Still secret']) assert.ok(!json.includes(leaked), leaked);
});

test('AI Mentor answers record their outcome (Gemini, fallback) and never the question or answer', async () => {
    const user = t.db.addUser({ monthly_budget: 20000 });
    const ai = await t.request('POST', '/api/ai/invest-advice', { token: user.token, body: { query: 'How is my private spending doing?' } });
    assert.equal(ai.status, 200);
    t.gemini.reply = Object.assign(new Error('boom'), { code: 'AI_TIMEOUT' });
    const fallback = await t.request('POST', '/api/ai/invest-advice', { token: user.token, body: { query: 'Second private question' } });
    assert.equal(fallback.status, 200);
    assert.equal(fallback.body.aiFallback, true);
    await settle();

    const events = rows('app_events', (e) => e.user_id === user.id && e.name === 'ai_question_answered');
    assert.deepEqual(events.map((e) => e.props.outcome), [ai.body.source === 'ai' ? 'ai' : 'fallback', 'fallback']);
    assert.ok(events.every((e) => Number.isFinite(e.duration_ms)));
    const json = JSON.stringify(events);
    for (const leaked of ['private', 'general explanation']) assert.ok(!json.includes(leaked), leaked);
});

test('unauthenticated probes are not counted as product usage', async () => {
    const before = rows('app_events').length;
    await t.request('POST', '/api/expenses', { body: { amount: 1 } });
    await settle();
    assert.equal(rows('app_events').length, before);
});

test('an account deletion is counted without the deleted user\'s id', async () => {
    const user = t.db.addUser();
    const res = await t.request('DELETE', '/api/account', { token: user.token, body: { confirmation: 'DELETE_MY_ACCOUNT' } });
    assert.equal(res.status, 200);
    await settle();
    const deleted = rows('app_events', (e) => e.name === 'account_deleted');
    assert.ok(deleted.length >= 1);
    assert.ok(deleted.every((e) => e.user_id === null));
});

// ─── Dashboard figures match the rows ───────────────────────────────────────

test('dashboard installs and totals are exact counts of the underlying rows', async () => {
    const before = (await get('/api/admin/dashboard')).body;
    seed('app_installs', [
        { install_id: uuid(), platform: 'android', app_version: '1.0.0', user_id: null, first_seen_at: iso(1000), last_seen_at: iso(1000) },
        { install_id: uuid(), platform: 'android', app_version: '0.9.0', user_id: null, first_seen_at: iso(40 * DAY), last_seen_at: iso(35 * DAY) },
        { install_id: uuid(), platform: 'web', app_version: '1.0.0', user_id: null, first_seen_at: iso(1000), last_seen_at: iso(1000) },
    ]);
    const user = t.db.addUser();
    seed('expenses', [
        { id: uuid(), user_id: user.id, amount: 1, source: 'ai_scan', created_at: iso(1000) },
        { id: uuid(), user_id: user.id, amount: 1, source: 'manual', created_at: iso(1000) },
    ]);

    const res = await get('/api/admin/dashboard');
    assert.equal(res.status, 200);
    const d = res.body;
    assert.equal(d.installs.available, true);
    assert.equal(d.installs.totals.all, before.installs.totals.all + 3);
    assert.equal(d.installs.totals.byPlatform.android, (before.installs.totals.byPlatform.android || 0) + 2);
    assert.equal(d.installs.totals.today - before.installs.totals.today, 2);
    assert.equal(d.installs.playStore.connected, false);
    assert.equal(d.totals.expenses.value, rows('expenses').length);
    assert.equal(d.totals.receiptScans.value, rows('expenses', (e) => e.source === 'ai_scan').length);
    assert.equal(d.users.total.value, rows('profiles').length);
    assert.equal(d.pro.revenue.value, null);
    assert.equal(typeof d.api.totalRequests, 'number');
});

test('without the v1.6 tables the dashboard says "telemetry not configured" instead of zero', async () => {
    t.db.failures.push({ table: 'app_installs' }, { table: 'app_events' });
    const d = (await get('/api/admin/dashboard')).body;
    assert.equal(d.installs.available, false);
    assert.match(d.installs.note, /telemetry not configured/);
    assert.equal(d.totals.aiFallback7d.value, null);
    assert.match(d.totals.aiFallback7d.note, /telemetry not configured/);

    const activity = (await get('/api/admin/activity')).body;
    assert.equal(activity.available, false);
    assert.match(activity.note, /telemetry not configured/);
});

test('installs report version distribution and flag outdated versions', async () => {
    seed('app_installs', [
        { install_id: uuid(), platform: 'android', app_version: '1.10.0', user_id: owner.id, first_seen_at: iso(DAY), last_seen_at: iso(1000) },
        { install_id: uuid(), platform: 'android', app_version: '1.9.2', user_id: null, first_seen_at: iso(2 * DAY), last_seen_at: iso(1000) },
    ]);
    const res = await get('/api/admin/installs?days=7');
    assert.equal(res.status, 200);
    assert.equal(res.body.newestVersion.android, '1.10.0');
    const old = res.body.versions.find((v) => v.platform === 'android' && v.version === '1.9.2');
    assert.equal(old.outdated, true);
    assert.equal(res.body.versions.find((v) => v.version === '1.10.0').newest, true);
    assert.equal(res.body.uninstalls.value, null);
    assert.equal((await get('/api/admin/installs?days=5')).status, 400);
});

test('activity reports counts, trends and failure rates from recorded events only', async () => {
    const user = t.db.addUser();
    seed('app_events', [
        { name: 'receipt_scanned', source: 'server', user_id: user.id, props: {}, status_code: 201, created_at: iso(1000) },
        { name: 'receipt_scan_failed', source: 'server', user_id: user.id, props: { status: 502 }, status_code: 502, created_at: iso(2000) },
        { name: 'receipt_scan_failed', source: 'server', user_id: user.id, props: { status: 429 }, status_code: 429, created_at: iso(3000) },
    ]);
    const res = await get('/api/admin/activity?days=7');
    assert.equal(res.status, 200);
    assert.equal(res.body.available, true);
    const scans = res.body.failureRates.find((f) => f.label === 'Receipt scan');
    assert.ok(scans.success >= 1 && scans.failed >= 2);
    assert.ok(scans.breakdown.error >= 1 && scans.breakdown.limited >= 1);
    assert.equal(res.body.daily.length, 7);
    assert.ok(res.body.byName.some((e) => e.name === 'receipt_scanned'));
    assert.ok(res.body.notTracked.length > 0);
});

test('engagement computes retention from real signup and activity dates, and says when a cohort is empty', async () => {
    const res = await get('/api/admin/engagement');
    assert.equal(res.status, 200);
    assert.equal(res.body.available, true);
    assert.equal(res.body.totalUsers, rows('profiles').length);
    assert.equal(res.body.retention30d.value, null); // every test user signed up just now
    assert.match(res.body.retention30d.note, /No users signed up 30\+ days ago/);

    const returned = t.db.addUser({ created_at: iso(10 * DAY), last_active_at: iso(DAY) });
    t.db.addUser({ created_at: iso(9 * DAY), last_active_at: iso(9 * DAY) });
    const after = (await get('/api/admin/engagement')).body;
    assert.ok(returned.id);
    assert.equal(after.retention7d.cohort, 2);
    assert.equal(after.retention7d.returned, 1);
    assert.equal(after.retention7d.value, 0.5);
    assert.equal(after.retention7d.lowerBound, true);
});

// ─── AI Mentor monitoring ───────────────────────────────────────────────────

test('AI monitoring shows outcomes, quota usage and error codes, never content', async () => {
    const heavy = t.db.addUser({ chat_messages_today: 9, chat_messages_reset_at: require('../lib/appTime').localDateKey() });
    seed('ai_chat_history', [{ id: uuid(), user_id: heavy.id, role: 'user', content: 'very private question', created_at: iso(1000) }]);
    seed('ops_events', [
        { id: uuid(), type: 'ai_error', severity: 'error', route: null, code: 'AI_TIMEOUT', status_code: null, created_at: iso(1000) },
        { id: uuid(), type: 'ai_error', severity: 'error', route: null, code: '429:RESOURCE_EXHAUSTED', status_code: null, created_at: iso(2000) },
        { id: uuid(), type: 'ai_self_check', severity: 'info', route: null, code: 'ok:gemini-3.5-flash@render', status_code: null, created_at: iso(3000) },
    ]);
    const res = await get('/api/admin/ai');
    assert.equal(res.status, 200);
    assert.ok(['GREEN', 'YELLOW', 'RED', 'UNKNOWN'].includes(res.body.health.state));
    assert.ok(res.body.failures.timeouts30d >= 1);
    assert.ok(res.body.failures.httpErrors30d >= 1);
    assert.ok(res.body.quota.usersNearLimit >= 1);
    assert.deepEqual({ ...res.body.failures.lastSelfCheck, at: undefined }, { ok: true, code: 'ok:gemini-3.5-flash@render', at: undefined });
    assert.equal(res.body.quota.dailyFreeLimit, 10);
    assert.ok(res.body.questions.total.value >= 1);
    const json = JSON.stringify(res.body);
    assert.ok(!json.includes('very private question'));
    assert.ok(!json.includes('test-gemini-secret-value'));
});

test('AI health is GREEN, YELLOW, RED or UNKNOWN from the data, never assumed', () => {
    const { aiHealth } = require('../lib/adminAnalytics');
    const memory = { calls: 0, failures: 0, lastSuccessAt: null, lastFailureAt: null };
    const day = (over) => ({ outcomes: { last24h: { requests: 10, geminiAnswers: 10, fallbackAnswers: 0, calculatedAnswers: 0, fallbackRate: 0, failedBreakdown: {}, ...over } }, failures: { geminiErrors24h: 0 }, memory });

    assert.equal(aiHealth(day({})).state, 'GREEN');
    assert.equal(aiHealth(day({ geminiAnswers: 7, fallbackAnswers: 3, fallbackRate: 0.3 })).state, 'YELLOW');
    assert.equal(aiHealth(day({ geminiAnswers: 0, fallbackAnswers: 10, fallbackRate: 1 })).state, 'RED');
    assert.equal(aiHealth({ outcomes: null, failures: null, memory }).state, 'UNKNOWN');
    assert.equal(aiHealth({ outcomes: null, failures: null, memory: { calls: 4, failures: 4, lastFailureAt: '2026-09-16T10:00:00Z', lastSuccessAt: null, lastFailureCode: 'AI_TIMEOUT' } }).state, 'RED');
    const failedCheck = { outcomes: null, failures: { geminiErrors24h: 1, lastSelfCheck: { ok: false, code: '400:API_KEY_INVALID', at: '2026-09-16T09:00:00Z' } }, memory };
    assert.equal(aiHealth(failedCheck).state, 'RED');
    t.gemini.configured = false;
    assert.equal(aiHealth(day({})).state, 'RED');
});

// ─── Error Center ───────────────────────────────────────────────────────────

test('errors are grouped, filterable, resolvable with an audit entry, and re-open on recurrence', async () => {
    const route = `POST /api/groups/join-${Date.now()}`;
    seed('ops_events', [
        { id: uuid(), type: 'http_5xx', severity: 'error', route, code: null, status_code: 500, created_at: iso(3 * 3600000) },
        { id: uuid(), type: 'http_5xx', severity: 'error', route, code: null, status_code: 500, created_at: iso(2 * 3600000) },
    ]);
    const list = await get(`/api/admin/errors?route=${encodeURIComponent(route)}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.issues.length, 1);
    const issue = list.body.issues[0];
    assert.equal(issue.count, 2);
    assert.equal(issue.category, 'backend');
    assert.equal(issue.status, 'open');
    assert.ok(issue.firstSeenAt < issue.lastSeenAt);

    assert.equal((await post('/api/admin/errors/resolve', { fingerprint: 'http_5xx|POST /nope|-|500' })).status, 404);
    assert.equal((await post('/api/admin/errors/resolve', { fingerprint: 'bad fingerprint' })).status, 400);

    const resolved = await post('/api/admin/errors/resolve', { fingerprint: issue.fingerprint, note: 'Fixed in deploy' });
    assert.equal(resolved.status, 200);
    assert.ok(rows('admin_audit_log', (a) => a.action === 'error_resolved' && a.details.fingerprint === issue.fingerprint).length === 1);
    assert.equal((await get(`/api/admin/errors?route=${encodeURIComponent(route)}`)).body.issues.length, 0, 'resolved issues leave the open list');
    const all = await get(`/api/admin/errors?state=resolved&route=${encodeURIComponent(route)}`);
    assert.equal(all.body.issues[0].resolution.note, 'Fixed in deploy');

    // Resolution does not touch the recorded events.
    assert.equal(rows('ops_events', (e) => e.route === route).length, 2);

    seed('ops_events', [{ id: uuid(), type: 'http_5xx', severity: 'error', route, code: null, status_code: 500, created_at: new Date(Date.now() + 1000).toISOString() }]);
    const again = await get(`/api/admin/errors?route=${encodeURIComponent(route)}`);
    assert.equal(again.body.issues[0].status, 'regressed');

    assert.equal((await post('/api/admin/errors/reopen', { fingerprint: issue.fingerprint })).status, 400, 'reason required');
    assert.equal((await post('/api/admin/errors/reopen', { fingerprint: issue.fingerprint, reason: 'Still happening' })).status, 200);
    assert.equal(rows('ops_issue_states', (s) => s.fingerprint === issue.fingerprint).length, 0);
});

test('resolving is refused when it cannot be audited', async () => {
    const route = `GET /api/audit-refused-${Date.now()}`;
    seed('ops_events', [{ id: uuid(), type: 'http_5xx', severity: 'error', route, code: null, status_code: 503, created_at: iso(1000) }]);
    t.db.failures.push({ table: 'admin_audit_log', op: 'insert' });
    const res = await post('/api/admin/errors/resolve', { fingerprint: `http_5xx|${route}|-|503` });
    assert.equal(res.status, 503);
    assert.equal(rows('ops_issue_states', (s) => s.fingerprint.includes(route)).length, 0);
});

test('error filters are validated', async () => {
    for (const q of ['severity=critical', 'state=deleted', 'days=365', 'from=2026-09-10&to=2026-09-01', 'type=DROP%20TABLE', 'unknown=1']) {
        assert.equal((await get(`/api/admin/errors?${q}`)).status, 400, q);
    }
});

// ─── Users, Pro, settings ───────────────────────────────────────────────────

test('user list shows the app version and platform a user last reported', async () => {
    const user = t.db.addUser({ email: `device.${Date.now()}@example.com` });
    seed('app_installs', [
        { install_id: uuid(), platform: 'android', app_version: '1.0.0', user_id: user.id, first_seen_at: iso(5 * DAY), last_seen_at: iso(5 * DAY) },
        { install_id: uuid(), platform: 'android', app_version: '1.1.0', user_id: user.id, first_seen_at: iso(DAY), last_seen_at: iso(1000) },
    ]);
    const res = await get(`/api/admin/users?q=${encodeURIComponent(user.email)}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.deviceTracking, true);
    assert.deepEqual({ ...res.body.users[0].device, lastSeenAt: undefined }, { platform: 'android', appVersion: '1.1.0', lastSeenAt: undefined });

    const detail = await get(`/api/admin/users/${user.id}`);
    assert.equal(detail.body.devices.length, 2);
    assert.match(detail.body.devices[0].installId, /^[0-9a-f]{8}…$/);
});

test('Pro section reports billing as not enabled, quota pressure, and no revenue', async () => {
    t.db.addUser({ email: `quota.${Date.now()}@example.com`, receipt_scans_this_month: 3, receipt_scans_reset_month: require('../lib/appTime').localMonthKey() });
    const res = await get('/api/admin/pro');
    assert.equal(res.status, 200);
    assert.equal(res.body.billing.status, 'not_enabled');
    assert.equal(res.body.revenue.value, null);
    assert.ok(res.body.quotas.receipt_scan.atLimit >= 1);
    assert.equal(res.body.quotas.chat_message.limit, 10);
    assert.equal(typeof res.body.purchaseAttempts30d.value, 'number');
});

test('settings expose configuration status but never a secret', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role';
    const res = await get('/api/admin/settings');
    assert.equal(res.status, 200);
    assert.equal(res.body.owner.adminEmailConfigured, true);
    assert.notEqual(res.body.owner.adminEmail, OWNER_EMAIL);
    assert.match(res.body.owner.adminEmail, /^ow•+@vittova\.test$/);
    assert.equal(res.body.features.billing.enabled, false);
    assert.equal(res.body.migrations.v1_6_owner_console.applied, true);
    const json = JSON.stringify(res.body);
    for (const secret of ['fake-service-role', 'test-gemini-secret-value', OWNER_EMAIL]) assert.ok(!json.includes(secret), secret);
});

test('no admin code path updates or deletes audit log rows', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const files = ['routes', 'lib', 'middleware'].flatMap((dir) => fs.readdirSync(path.join(__dirname, '..', dir)).map((f) => path.join(__dirname, '..', dir, f)));
    for (const file of files) {
        const text = fs.readFileSync(file, 'utf8');
        assert.ok(!/from\('admin_audit_log'\)\s*\.(update|delete|upsert)\(/.test(text), file);
    }
});
