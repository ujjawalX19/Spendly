/**
 * Owner admin API: server-side user list (usage counts, filters, sorting,
 * pagination), the per-user activity timeline, and Pro management.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startTestApp } = require('./helpers/testApp');

const OWNER_EMAIL = 'owner@spendly.test';
const DAY = 86400000;

let t;
let owner;
test.before(async () => {
    t = await startTestApp({ env: { ADMIN_EMAIL: OWNER_EMAIL } });
    owner = t.db.addUser({ email: OWNER_EMAIL, role: 'admin' });
});
test.after(async () => { await t.close(); });
test.beforeEach(async () => {
    await t.resetRateLimits();
    t.db.failures = [];
});

const seed = (table, rows) => { t.db.tables[table] = [...(t.db.tables[table] || []), ...rows]; };
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const audits = (action) => (t.db.tables.admin_audit_log || []).filter((a) => a.action === action);
const get = (url) => t.request('GET', url, { token: owner.token });
const post = (url, body) => t.request('POST', url, { token: owner.token, body });

// ─── User list ──────────────────────────────────────────────────────────────

test('user list returns per-user usage counts and sorts by usage server-side', async () => {
    const heavy = t.db.addUser({ email: 'heavy.usage@example.com', investment_target: 5000 });
    const light = t.db.addUser({ email: 'light.usage@example.com' });
    seed('expenses', Array.from({ length: 5 }, () => ({ id: crypto.randomUUID(), user_id: heavy.id, amount: 1, source: 'manual', created_at: iso(DAY) })));
    seed('expenses', [{ id: crypto.randomUUID(), user_id: light.id, amount: 1, source: 'manual', created_at: iso(DAY) }]);
    seed('ai_chat_history', [{ id: crypto.randomUUID(), user_id: light.id, role: 'user', content: 'private question', created_at: iso(1000) }]);
    seed('recurring_bills', [{ id: crypto.randomUUID(), user_id: heavy.id, name: 'Netflix', amount: 649, created_at: iso(DAY) }]);

    const res = await get('/api/admin/users?q=usage%40example.com&sort=expenses');
    assert.equal(res.status, 200);
    assert.equal(res.body.usageAvailable, true);
    assert.deepEqual(res.body.users.map((u) => u.id), [heavy.id, light.id]);
    const { lastActivityAt, ...counts } = res.body.users[0].usage;
    assert.deepEqual(counts, { expenses: 5, goals: 1, subscriptions: 1, aiQuestions: 0, groupPools: 0 });
    assert.ok(lastActivityAt);
    assert.equal(res.body.users[1].usage.aiQuestions, 1);

    const json = JSON.stringify(res.body);
    for (const secret of ['Netflix', 'private question', '649']) assert.ok(!json.includes(secret), secret);

    const byAi = await get('/api/admin/users?q=usage%40example.com&sort=ai_usage');
    assert.equal(byAi.body.users[0].id, light.id);
});

test('user list filters combine: plan, activity, status and created date', async () => {
    const tag = `f${Date.now()}`;
    const activePro = t.db.addUser({ email: `${tag}.a@example.com`, is_pro: true, pro_expires_at: iso(-10 * DAY), last_active_at: iso(DAY) });
    const expiredPro = t.db.addUser({ email: `${tag}.b@example.com`, is_pro: true, pro_expires_at: iso(DAY), last_active_at: null });
    const suspendedFree = t.db.addUser({ email: `${tag}.c@example.com`, is_banned: true, last_active_at: iso(40 * DAY), created_at: '2026-01-15T06:00:00.000Z' });

    const ids = async (qs) => (await get(`/api/admin/users?q=${tag}&${qs}`)).body.users.map((u) => u.id).sort();

    assert.deepEqual(await ids('plan=pro'), [activePro.id]);
    assert.deepEqual(await ids('plan=free'), [expiredPro.id, suspendedFree.id].sort());
    assert.deepEqual(await ids('activity=active'), [activePro.id]);
    assert.deepEqual(await ids('activity=inactive'), [expiredPro.id, suspendedFree.id].sort());
    assert.deepEqual(await ids('status=suspended'), [suspendedFree.id]);
    assert.deepEqual(await ids('plan=free&status=active'), [expiredPro.id]);
    assert.deepEqual(await ids('createdFrom=2026-01-01&createdTo=2026-01-31'), [suspendedFree.id]);

    assert.equal((await get('/api/admin/users?createdFrom=2026-02-01&createdTo=2026-01-01')).status, 400);
    assert.equal((await get('/api/admin/users?createdFrom=yesterday')).status, 400);
    assert.equal((await get('/api/admin/users?sort=amount_spent')).status, 400);
});

test('user list paginates on the server', async () => {
    const tag = `p${Date.now()}`;
    for (let i = 0; i < 5; i++) t.db.addUser({ email: `${tag}${i}@example.com` });
    const first = await get(`/api/admin/users?q=${tag}&pageSize=2&page=1`);
    const third = await get(`/api/admin/users?q=${tag}&pageSize=2&page=3`);
    assert.equal(first.body.users.length, 2);
    assert.equal(first.body.pagination.total, 5);
    assert.equal(first.body.pagination.hasMore, true);
    assert.equal(third.body.users.length, 1);
    assert.equal(third.body.pagination.hasMore, false);
    assert.equal((await get('/api/admin/users?pageSize=1000')).status, 400);
});

test('user list falls back without the usage view, and refuses usage sorts', async () => {
    t.db.failures.push({ table: 'admin_user_stats' });
    const plain = await get('/api/admin/users');
    assert.equal(plain.status, 200);
    assert.equal(plain.body.usageAvailable, false);
    assert.equal(plain.body.users[0].usage, null);
    const sorted = await get('/api/admin/users?sort=expenses');
    assert.equal(sorted.status, 409);
    assert.equal(sorted.body.code, 'MIGRATION_REQUIRED');
});

test('user detail reports unavailable data as null, not zero', async () => {
    const target = t.db.addUser();
    const res = await get(`/api/admin/users/${target.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.usage.income, null);
    assert.equal(res.body.usage.csvImports, null);
    assert.equal(res.body.usage.upiDetections, null);
    assert.equal(res.body.usage.goals, 0);
});

// ─── Timeline ───────────────────────────────────────────────────────────────

test('timeline groups activity per day and contains no financial details', async () => {
    const target = t.db.addUser();
    const recent = iso(60 * 1000);
    seed('expenses', [
        { id: crypto.randomUUID(), user_id: target.id, amount: 4321.5, description: 'Hidden Cafe', source: 'upi_auto', created_at: recent },
        { id: crypto.randomUUID(), user_id: target.id, amount: 99, description: 'Hidden Shop', source: 'upi_auto', created_at: recent },
        { id: crypto.randomUUID(), user_id: target.id, amount: 10, description: 'Cash', source: 'manual', created_at: recent },
    ]);
    seed('ai_chat_history', [{ id: crypto.randomUUID(), user_id: target.id, role: 'user', content: 'can I afford rent', created_at: recent }]);
    seed('pdf_imports', [{ id: crypto.randomUUID(), user_id: target.id, bank_name: 'Secret Bank', transactions_count: 12, status: 'completed', created_at: recent }]);
    seed('group_members', [{ group_id: crypto.randomUUID(), user_id: target.id, role: 'member', joined_at: recent }]);

    assert.equal((await post(`/api/admin/users/${target.id}/pro`, { reason: 'timeline test', expiresAt: null })).status, 200);

    const res = await get(`/api/admin/users/${target.id}/timeline`);
    assert.equal(res.status, 200);
    const types = res.body.events.map((e) => e.type);
    for (const type of ['signup', 'upi_confirmed', 'expense_created', 'ai_used', 'pdf_imported', 'group_joined', 'pro_changed']) {
        assert.ok(types.includes(type), type);
    }
    assert.equal(res.body.events.find((e) => e.type === 'upi_confirmed').count, 2);
    const json = JSON.stringify(res.body);
    for (const secret of ['Hidden Cafe', '4321', 'can I afford rent', 'Secret Bank']) assert.ok(!json.includes(secret), secret);
    assert.ok(res.body.notTracked.length > 0);
});

test('timeline is owner-only and validates the id', async () => {
    const target = t.db.addUser();
    assert.equal((await t.request('GET', `/api/admin/users/${target.id}/timeline`, { token: target.token })).status, 404);
    assert.equal((await get('/api/admin/users/nope/timeline')).status, 400);
    assert.equal((await get(`/api/admin/users/${crypto.randomUUID()}/timeline`)).status, 404);
});

// ─── Pro management ─────────────────────────────────────────────────────────

test('Pro page summarises entitlements with source and history', async () => {
    const target = t.db.addUser();
    const legacy = t.db.addUser({ is_pro: true, pro_expires_at: null });
    assert.equal((await post(`/api/admin/users/${target.id}/pro`, { reason: 'launch promo', expiresAt: iso(-5 * DAY) })).status, 200);

    const res = await get('/api/admin/pro?state=all&pageSize=100');
    assert.equal(res.status, 200);
    assert.equal(res.body.billing.connected, false);
    assert.match(res.body.billing.note, /Billing not connected/);
    const s = res.body.summary;
    assert.equal(s.freeUsers, s.totalUsers - s.activePro);
    assert.ok(s.expiringSoon >= 1);

    const granted = res.body.users.find((u) => u.id === target.id);
    assert.equal(granted.source, 'manual');
    assert.ok(granted.activatedAt);
    assert.equal(res.body.users.find((u) => u.id === legacy.id).source, 'manual (before audit log)');
    assert.ok(res.body.history.some((h) => h.targetUserId === target.id && h.reason === 'launch promo' && h.action === 'pro_granted'));

    const expiring = await get('/api/admin/pro?state=expiring&pageSize=100');
    assert.ok(expiring.body.users.some((u) => u.id === target.id));
    assert.ok(!expiring.body.users.some((u) => u.id === legacy.id));
    assert.equal((await t.request('GET', '/api/admin/pro', { token: target.token })).status, 404);
});

test('extend Pro adds days to the current expiry and is audited', async () => {
    const expires = new Date(Date.now() + 10 * DAY).toISOString();
    const target = t.db.addUser({ is_pro: true, pro_expires_at: expires });
    const url = `/api/admin/users/${target.id}/pro/extend`;

    assert.equal((await post(url, { days: 30 })).status, 400, 'reason required');
    assert.equal((await post(url, { days: 0, reason: 'bad' })).status, 400);

    const res = await post(url, { days: 30, reason: 'loyalty' });
    assert.equal(res.status, 200);
    assert.equal(new Date(t.db.profile(target.id).pro_expires_at).getTime(), new Date(expires).getTime() + 30 * DAY);
    const entry = audits('pro_extended').find((a) => a.target_user_id === target.id);
    assert.equal(entry.details.days, 30);
    assert.equal(entry.details.previous.expiresAt, expires);

    const expired = t.db.addUser({ is_pro: true, pro_expires_at: iso(5 * DAY) });
    const before = Date.now();
    assert.equal((await post(`/api/admin/users/${expired.id}/pro/extend`, { days: 7, reason: 'renew' })).status, 200);
    assert.ok(new Date(t.db.profile(expired.id).pro_expires_at).getTime() >= before + 7 * DAY - 1000, 'extends from now when already expired');

    const free = t.db.addUser();
    assert.equal((await post(`/api/admin/users/${free.id}/pro/extend`, { days: 7, reason: 'x y z' })).status, 400);
    const forever = t.db.addUser({ is_pro: true, pro_expires_at: null });
    assert.equal((await post(`/api/admin/users/${forever.id}/pro/extend`, { days: 7, reason: 'x y z' })).status, 400);

    const outsider = t.db.addUser();
    assert.equal((await t.request('POST', url, { token: outsider.token, body: { days: 7, reason: 'self' } })).status, 404);
});
