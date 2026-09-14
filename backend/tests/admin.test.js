/**
 * Owner admin API: authorization (every factor), data minimisation, audited
 * mutations, dashboard metrics and health checks, against the real app.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startTestApp } = require('./helpers/testApp');

const OWNER_EMAIL = 'owner@spendly.test';

let t;
test.before(async () => { t = await startTestApp({ env: { ADMIN_EMAIL: OWNER_EMAIL } }); });
test.after(async () => { await t.close(); });
test.beforeEach(async () => {
    await t.resetRateLimits();
    process.env.ADMIN_EMAIL = OWNER_EMAIL;
    t.db.failures = [];
    require('../middleware/requireOwner').resetDenialLog();
});

/** The owner account; created once per test with a unique id. */
const addOwner = (overrides = {}) => {
    const existing = (t.db.tables.profiles || []).find((p) => p.email === OWNER_EMAIL);
    if (existing) {
        t.db.tables.profiles = t.db.tables.profiles.filter((p) => p !== existing);
        t.db.authUsers.delete(existing.id);
    }
    return t.db.addUser({ email: OWNER_EMAIL, role: 'admin', ...overrides });
};

const audits = (action) => (t.db.tables.admin_audit_log || []).filter((a) => !action || a.action === action);

// ─── Authorization ──────────────────────────────────────────────────────────

test('the owner (matching confirmed email + admin role) can use the admin API', async () => {
    const owner = addOwner();
    const me = await t.request('GET', '/api/admin/me', { token: owner.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.owner.email, OWNER_EMAIL);
    assert.equal(me.headers.get('cache-control'), 'no-store');
});

test('email matching is case-insensitive', async () => {
    const owner = addOwner();
    process.env.ADMIN_EMAIL = '  OWNER@Spendly.TEST ';
    assert.equal((await t.request('GET', '/api/admin/me', { token: owner.token })).status, 200);
});

test('admin role without the owner email is refused', async () => {
    const impostor = t.db.addUser({ role: 'admin' });
    const res = await t.request('GET', '/api/admin/users', { token: impostor.token });
    assert.equal(res.status, 404);
    assert.equal(res.body.message, 'Not found');
});

test('owner email without the admin role is refused', async () => {
    const owner = addOwner({ role: 'user' });
    assert.equal((await t.request('GET', '/api/admin/users', { token: owner.token })).status, 404);
});

test('owner email that is not confirmed is refused', async () => {
    const owner = addOwner({ emailConfirmed: false });
    assert.equal((await t.request('GET', '/api/admin/users', { token: owner.token })).status, 404);
});

test('a profile email that no longer matches ADMIN_EMAIL is refused', async () => {
    const owner = addOwner();
    t.db.profile(owner.id).email = 'changed@example.com';
    assert.equal((await t.request('GET', '/api/admin/me', { token: owner.token })).status, 404);
});

test('the admin API is closed to everyone when ADMIN_EMAIL is missing or not a single address', async () => {
    const owner = addOwner();
    for (const value of ['', 'not-an-email', `${OWNER_EMAIL},other@example.com`]) {
        process.env.ADMIN_EMAIL = value;
        assert.equal((await t.request('GET', '/api/admin/me', { token: owner.token })).status, 404, JSON.stringify(value));
    }
});

test('client-supplied admin hints are ignored', async () => {
    const user = t.db.addUser();
    const res = await t.request('GET', '/api/admin/users?isAdmin=true', {
        token: user.token,
        headers: { 'X-Admin': 'true', 'X-User-Role': 'admin', 'X-User-Email': OWNER_EMAIL },
    });
    assert.equal(res.status, 404);
    const post = await t.request('POST', `/api/admin/users/${user.id}/pro`, { token: user.token, body: { reason: 'self grant', expiresAt: null, isAdmin: true, role: 'admin' } });
    assert.equal(post.status, 404);
    assert.equal(t.db.profile(user.id).is_pro, false);
});

test('unauthenticated requests get 401 and never reach admin handlers', async () => {
    assert.equal((await t.request('GET', '/api/admin/overview')).status, 401);
    assert.equal((await t.request('GET', '/api/admin/overview', { token: 'forged' })).status, 401);
});

test('refused access attempts are audited, throttled per user', async () => {
    const before = audits('admin_access_denied').length;
    const user = t.db.addUser();
    await t.request('GET', '/api/admin/users', { token: user.token });
    await t.request('GET', '/api/admin/overview', { token: user.token });
    await new Promise((r) => setTimeout(r, 20));
    const entries = audits('admin_access_denied').slice(before);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].actor_id, user.id);
});

test('the removed cross-user expense endpoints no longer exist', async () => {
    const owner = addOwner();
    assert.equal((await t.request('GET', '/api/admin/expenses/recent', { token: owner.token })).status, 404);
    assert.equal((await t.request('DELETE', `/api/admin/expenses/${crypto.randomUUID()}`, { token: owner.token })).status, 404);
});

// ─── Users ──────────────────────────────────────────────────────────────────

test('user list is searchable and exposes no financial fields', async () => {
    const owner = addOwner();
    const target = t.db.addUser({ email: 'riya.search@example.com', full_name: 'Riya Search', total_chillar: 999, monthly_budget: 42000 });
    const res = await t.request('GET', '/api/admin/users?q=riya.search', { token: owner.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.users.length, 1);
    const u = res.body.users[0];
    assert.equal(u.id, target.id);
    const json = JSON.stringify(res.body);
    for (const leaked of ['total_chillar', 'monthly_budget', '42000', '999', 'receipt']) assert.ok(!json.includes(leaked), leaked);
});

test('search input cannot inject PostgREST filter syntax', async () => {
    const owner = addOwner();
    t.db.addUser({ email: 'someone@example.com' });
    const res = await t.request('GET', `/api/admin/users?q=${encodeURIComponent('x%,role.eq.admin')}`, { token: owner.token });
    assert.equal(res.status, 200);
    assert.ok(res.body.users.every((u) => u.role !== 'admin' || u.email.includes('x')), 'injected or-term must not match admins');
});

test('user list rejects unknown query parameters', async () => {
    const owner = addOwner();
    assert.equal((await t.request('GET', '/api/admin/users?select=*', { token: owner.token })).status, 400);
});

test('user detail returns counts, not transactions, and is audited', async () => {
    const owner = addOwner();
    const target = t.db.addUser();
    t.db.tables.expenses = [...(t.db.tables.expenses || []), {
        id: crypto.randomUUID(), user_id: target.id, amount: 777.77, description: 'Secret Merchant', category: 'Food',
        source: 'upi_auto', created_at: new Date().toISOString(), occurred_at: new Date().toISOString(),
    }];
    const res = await t.request('GET', `/api/admin/users/${target.id}`, { token: owner.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.usage.expensesTotal, 1);
    assert.equal(res.body.usage.upiConfirmations30d, 1);
    const json = JSON.stringify(res.body);
    assert.ok(!json.includes('Secret Merchant') && !json.includes('777.77'));
    assert.ok(audits('user_viewed').some((a) => a.target_user_id === target.id && a.actor_id === owner.id));
});

test('user detail validates the id and 404s unknown users', async () => {
    const owner = addOwner();
    assert.equal((await t.request('GET', '/api/admin/users/not-a-uuid', { token: owner.token })).status, 400);
    assert.equal((await t.request('GET', `/api/admin/users/${crypto.randomUUID()}`, { token: owner.token })).status, 404);
});

// ─── Mutations ──────────────────────────────────────────────────────────────

test('suspend and reinstate require a reason, are audited, and block the account', async () => {
    const owner = addOwner();
    const target = t.db.addUser();

    assert.equal((await t.request('POST', `/api/admin/users/${target.id}/suspend`, { token: owner.token, body: {} })).status, 400);
    assert.equal(t.db.profile(target.id).is_banned, false);

    const res = await t.request('POST', `/api/admin/users/${target.id}/suspend`, { token: owner.token, body: { reason: 'fraud report #12' } });
    assert.equal(res.status, 200);
    assert.equal(t.db.profile(target.id).is_banned, true);
    const entry = audits('user_suspended').find((a) => a.target_user_id === target.id);
    assert.equal(entry.details.reason, 'fraud report #12');
    assert.equal((await t.request('GET', '/api/expenses', { token: target.token })).status, 403);

    const back = await t.request('POST', `/api/admin/users/${target.id}/reinstate`, { token: owner.token, body: { reason: 'resolved' } });
    assert.equal(back.status, 200);
    assert.equal(t.db.profile(target.id).is_banned, false);
});

test('the owner cannot suspend themselves or another admin', async () => {
    const owner = addOwner();
    const otherAdmin = t.db.addUser({ role: 'admin' });
    assert.equal((await t.request('POST', `/api/admin/users/${owner.id}/suspend`, { token: owner.token, body: { reason: 'oops' } })).status, 400);
    assert.equal((await t.request('POST', `/api/admin/users/${otherAdmin.id}/suspend`, { token: owner.token, body: { reason: 'nope' } })).status, 400);
});

test('Pro grant and revoke are validated and audited with previous state', async () => {
    const owner = addOwner();
    const target = t.db.addUser();
    const url = `/api/admin/users/${target.id}/pro`;

    assert.equal((await t.request('POST', url, { token: owner.token, body: { reason: 'beta', expiresAt: new Date(Date.now() - 1000).toISOString() } })).status, 400);
    assert.equal((await t.request('POST', url, { token: owner.token, body: { reason: 'beta', expiresAt: '2099-01-01T00:00:00Z' } })).status, 400);
    assert.equal((await t.request('POST', url, { token: owner.token, body: { reason: 'beta', expiresAt: null, is_pro: true } })).status, 400);

    const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
    const grant = await t.request('POST', url, { token: owner.token, body: { reason: 'beta tester', expiresAt } });
    assert.equal(grant.status, 200);
    assert.equal(grant.body.user.pro.active, true);
    assert.equal(t.db.profile(target.id).is_pro, true);
    const g = audits('pro_granted').find((a) => a.target_user_id === target.id);
    assert.deepEqual(g.details.previous, { isPro: false, expiresAt: null });

    const status = await t.request('GET', '/api/pro/status', { token: target.token });
    assert.equal(status.body.pro.isPro, true);

    const revoke = await t.request('DELETE', url, { token: owner.token, body: { reason: 'beta ended' } });
    assert.equal(revoke.status, 200);
    assert.equal(t.db.profile(target.id).is_pro, false);
    assert.ok(audits('pro_revoked').some((a) => a.target_user_id === target.id));
});

test('a mutation is refused when it cannot be audited', async () => {
    const owner = addOwner();
    const target = t.db.addUser();
    t.db.failures.push({ table: 'admin_audit_log', op: 'insert' });
    const res = await t.request('POST', `/api/admin/users/${target.id}/pro`, { token: owner.token, body: { reason: 'no audit', expiresAt: null } });
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'AUDIT_UNAVAILABLE');
    assert.equal(t.db.profile(target.id).is_pro, false);
});

// ─── Dashboard and health ───────────────────────────────────────────────────

test('overview reports real counts and never invents revenue', async () => {
    const owner = addOwner();
    const now = new Date().toISOString();
    t.db.addUser({ is_pro: true, pro_expires_at: new Date(Date.now() + 3 * 86400000).toISOString(), last_active_at: now });
    const res = await t.request('GET', '/api/admin/overview', { token: owner.token });
    assert.equal(res.status, 200);

    const profiles = t.db.tables.profiles.length;
    assert.equal(res.body.users.total.value, profiles);
    assert.ok(res.body.pro.active.value >= 1);
    assert.ok(res.body.pro.expiringSoon.value >= 1);
    assert.equal(res.body.pro.revenue.value, null);
    assert.equal(res.body.pro.revenue.note, 'Billing not connected');
    assert.equal(res.body.billing.connected, false);
    assert.equal(res.body.usage.upi.detections.value, null);
    assert.equal(res.body.usage.imports.csv.value, null);
});

test('overview degrades a failing table to an explained null instead of failing', async () => {
    const owner = addOwner();
    t.db.failures.push({ table: 'ops_events' });
    const res = await t.request('GET', '/api/admin/overview', { token: owner.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.usage.ai.errors24h.value, null);
    assert.match(res.body.usage.ai.errors24h.note, /v1_4_admin_ops/);
});

test('health runs real checks and reports failures as ERROR', async () => {
    const owner = addOwner();
    const ok = await t.request('GET', '/api/admin/health', { token: owner.token });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.components.database.status, 'HEALTHY');
    assert.equal(ok.body.components.auth.status, 'HEALTHY');
    assert.equal(ok.body.components.background.status, 'DISABLED');
    assert.ok(['HEALTHY', 'NO_DATA', 'WARNING'].includes(ok.body.components.ai.status));

    t.db.failures.push({ table: 'auth' });
    const bad = await t.request('GET', '/api/admin/health', { token: owner.token });
    assert.equal(bad.body.components.auth.status, 'ERROR');

    t.gemini.configured = false;
    const noAi = await t.request('GET', '/api/admin/health', { token: owner.token });
    assert.equal(noAi.body.components.ai.status, 'ERROR');
    t.gemini.configured = true;
});

test('audit log is readable by the owner only', async () => {
    const owner = addOwner();
    const user = t.db.addUser();
    const res = await t.request('GET', '/api/admin/audit-log', { token: owner.token });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.entries));
    assert.equal((await t.request('GET', '/api/admin/audit-log', { token: user.token })).status, 404);
});
