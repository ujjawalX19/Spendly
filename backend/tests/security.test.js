/**
 * Security regression tests: privilege escalation, cross-user access, quotas,
 * validation, rate limiting and account deletion, against the real Express app.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startTestApp } = require('./helpers/testApp');

const appTime = require('../lib/appTime');

let t;
test.before(async () => { t = await startTestApp(); });
test.after(async () => { await t.close(); });
test.beforeEach(async () => { await t.resetRateLimits(); t.gemini.calls = []; t.gemini.configured = true; });

const addExpense = (userId, overrides = {}) => {
    const row = {
        id: crypto.randomUUID(), user_id: userId, amount: 250, category: 'Food', description: 'Lunch',
        roundup_chillar: 0, source: 'manual', occurred_at: new Date().toISOString(), created_at: new Date().toISOString(),
        ...overrides,
    };
    t.db.tables.expenses = t.db.tables.expenses || [];
    t.db.tables.expenses.push(row);
    return row;
};

// ─── Premium entitlement ────────────────────────────────────────────────────

test('a normal user cannot make themselves Pro through any purchase endpoint', async () => {
    const a = t.db.addUser();
    for (const url of ['/api/pro/activate', '/api/pro/add-freezes']) {
        const res = await t.request('POST', url, { token: a.token, body: { productId: 'spendly_pro_monthly', is_pro: true, purchaseToken: 'fake' } });
        assert.equal(res.status, 501, url);
        assert.equal(res.body.code, 'BILLING_NOT_AVAILABLE');
    }
    assert.equal(t.db.profile(a.id).is_pro, false);

    const status = await t.request('GET', '/api/pro/status', { token: a.token });
    assert.equal(status.body.pro.isPro, false);
    assert.equal(status.body.purchasesAvailable, false);
});

test('profile-editing endpoints reject is_pro, role and server-owned fields', async () => {
    const a = t.db.addUser();
    const attempts = [
        ['PUT', '/api/account/budget', { monthly_budget: 6000, is_pro: true }],
        ['PUT', '/api/account/budget', { monthly_budget: 6000, role: 'admin' }],
        ['PUT', '/api/account/investment-target', { investment_target: 100, total_chillar: 99999 }],
        ['PUT', '/api/account/investment-target', { investment_target: 100, streak_current: 500 }],
    ];
    for (const [method, url, body] of attempts) {
        const res = await t.request(method, url, { token: a.token, body });
        assert.equal(res.status, 400, `${url} ${JSON.stringify(body)}`);
    }
    const p = t.db.profile(a.id);
    assert.equal(p.is_pro, false);
    assert.equal(p.role, 'user');
    assert.equal(p.total_chillar, 0);
    assert.equal(p.streak_current, 0);
    assert.equal(p.monthly_budget, 10000, 'rejected request must not partially apply');
});

test('an expired Pro flag does not grant Pro features', async () => {
    const a = t.db.addUser({ is_pro: true, pro_expires_at: new Date(Date.now() - 1000).toISOString() });
    const status = await t.request('GET', '/api/pro/status', { token: a.token });
    assert.equal(status.body.pro.isPro, false);
    const pdf = await t.request('POST', '/api/pdf-import', { token: a.token });
    assert.equal(pdf.status, 403);
    assert.equal(pdf.body.code, 'PRO_REQUIRED');
});

test("a user cannot change another user's Pro status or suspend them", async () => {
    const a = t.db.addUser();
    const b = t.db.addUser({ is_pro: true });
    const body = { reason: 'trying it' };
    assert.equal((await t.request('POST', `/api/admin/users/${b.id}/suspend`, { token: a.token, body })).status, 404);
    assert.equal((await t.request('DELETE', `/api/admin/users/${b.id}/pro`, { token: a.token, body })).status, 404);
    assert.equal(t.db.profile(b.id).is_banned, false);
    assert.equal(t.db.profile(b.id).is_pro, true);
});

// ─── Admin (owner-only; detailed coverage in admin.test.js) ─────────────────

test('a normal user cannot use admin endpoints', async () => {
    const a = t.db.addUser();
    for (const url of ['/api/admin/me', '/api/admin/users', '/api/admin/overview', '/api/admin/health', '/api/admin/audit-log']) {
        assert.equal((await t.request('GET', url, { token: a.token })).status, 404, url);
    }
});

test('requests without a valid token are rejected', async () => {
    assert.equal((await t.request('GET', '/api/expenses')).status, 401);
    assert.equal((await t.request('GET', '/api/expenses', { token: 'forged' })).status, 401);
});

// ─── Cross-user data access ─────────────────────────────────────────────────

test("a user cannot read, edit, delete or export another user's expenses", async () => {
    const a = t.db.addUser();
    const b = t.db.addUser();
    const mine = addExpense(a.id, { description: 'Mine' });
    const theirs = addExpense(b.id, { description: 'Theirs', amount: 999 });

    const list = await t.request('GET', '/api/expenses', { token: a.token });
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.expenses.map((e) => e.id), [mine.id]);

    const patch = await t.request('PATCH', `/api/expenses/${theirs.id}`, { token: a.token, body: { amount: 1 } });
    assert.equal(patch.status, 404);
    const del = await t.request('DELETE', `/api/expenses/${theirs.id}`, { token: a.token });
    assert.equal(del.status, 404);
    const stored = t.db.tables.expenses.find((e) => e.id === theirs.id);
    assert.equal(stored.amount, 999);

    const csv = await t.request('GET', '/api/expenses/export.csv', { token: a.token });
    assert.equal(csv.status, 200);
    assert.ok(csv.text.includes('Mine'));
    assert.ok(!csv.text.includes('Theirs'));
});

test("a user cannot read another user's AI chat history", async () => {
    const a = t.db.addUser();
    const b = t.db.addUser();
    t.db.tables.ai_chat_history = [
        { id: crypto.randomUUID(), user_id: a.id, role: 'user', content: 'my question', created_at: '2026-09-01T00:00:00Z' },
        { id: crypto.randomUUID(), user_id: b.id, role: 'user', content: 'secret of B', created_at: '2026-09-01T00:00:01Z' },
    ];
    const res = await t.request('GET', '/api/ai/history', { token: a.token });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.history.map((h) => h.content), ['my question']);
});

// ─── Groups ─────────────────────────────────────────────────────────────────

test('a non-member cannot read or write a group, or add members', async () => {
    const owner = t.db.addUser();
    const outsider = t.db.addUser();
    const created = await t.request('POST', '/api/groups', { token: owner.token, body: { name: 'Flat 4B' } });
    assert.equal(created.status, 201);
    const groupId = created.body.group.id;

    assert.equal((await t.request('GET', `/api/groups/${groupId}`, { token: outsider.token })).status, 403);
    assert.equal((await t.request('POST', `/api/groups/${groupId}/expenses`, { token: outsider.token, body: { description: 'x', amount: 10 } })).status, 403);
    assert.equal((await t.request('POST', `/api/groups/${groupId}/settle`, { token: outsider.token, body: { toUserId: owner.id, amount: 10 } })).status, 403);

    // Nobody can add another user directly — people join with the invite code.
    const add = await t.request('POST', `/api/groups/${groupId}/members`, { token: owner.token, body: { userId: outsider.id } });
    assert.equal(add.status, 400);
    assert.ok(!t.db.tables.group_members.some((m) => m.user_id === outsider.id));

    const outsiderGroups = await t.request('GET', '/api/groups', { token: outsider.token });
    assert.deepEqual(outsiderGroups.body.groups, []);
});

test('group listings do not expose member email addresses', async () => {
    const owner = t.db.addUser({ email: 'owner-private@example.com' });
    await t.request('POST', '/api/groups', { token: owner.token, body: { name: 'Trip' } });
    const res = await t.request('GET', '/api/groups', { token: owner.token });
    assert.equal(res.status, 200);
    assert.ok(!JSON.stringify(res.body).includes('owner-private@example.com'));
});

test('settling up does not award farmable karma', async () => {
    const owner = t.db.addUser();
    const created = await t.request('POST', '/api/groups', { token: owner.token, body: { name: 'Pair' } });
    const friend = t.db.addUser();
    t.db.tables.group_members.push({ group_id: created.body.group.id, user_id: friend.id, role: 'member' });
    for (let i = 0; i < 3; i++) {
        const res = await t.request('POST', `/api/groups/${created.body.group.id}/settle`, { token: owner.token, body: { toUserId: friend.id, amount: 1 } });
        assert.equal(res.status, 201);
    }
    assert.equal(t.db.profile(owner.id).karma_score, 100);
});

// ─── Validation ─────────────────────────────────────────────────────────────

test('invalid expense input returns 400, never 500', async () => {
    const a = t.db.addUser();
    const bad = [
        { amount: -5 },
        { amount: 'abc' },
        { amount: 0 },
        { amount: 10.123 },
        { amount: 100, category: 'Crypto' },
        { amount: 100, description: 'x'.repeat(201) },
        { amount: 100, source: 'pdf_import' },
        { amount: 100, user_id: crypto.randomUUID() },
        { amount: 100, occurred_at: new Date(Date.now() + 86400000).toISOString() },
    ];
    for (const body of bad) {
        const res = await t.request('POST', '/api/expenses', { token: a.token, body });
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.equal(res.body.success, false);
    }
    assert.equal((t.db.tables.expenses || []).filter((e) => e.user_id === a.id).length, 0);
    assert.equal(t.db.profile(a.id).expenses_today, 0, 'failed requests must not consume the daily quota');
});

test('malformed JSON bodies are a 4xx, not a 500', async () => {
    const a = t.db.addUser();
    const res = await fetch(`${t.base}/api/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.token}` },
        body: '{"amount": ',
    });
    assert.equal(res.status, 400);

    const huge = await fetch(`${t.base}/api/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.token}` },
        body: JSON.stringify({ amount: 1, description: 'x'.repeat(200 * 1024) }),
    });
    assert.equal(huge.status, 413);
});

test('a valid expense is saved with server-computed round-up and stats', async () => {
    const a = t.db.addUser();
    const res = await t.request('POST', '/api/expenses', { token: a.token, body: { amount: 123, category: 'Food', description: 'Dosa' } });
    assert.equal(res.status, 201);
    assert.equal(res.body.roundupChillar, 2);
    assert.equal(t.db.profile(a.id).total_chillar, 2);
    assert.equal(t.db.profile(a.id).streak_current, 1);
});

test('a confirmed UPI detection keeps its original payment time and source', async () => {
    const a = t.db.addUser();
    const when = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const res = await t.request('POST', '/api/expenses', { token: a.token, body: { amount: 80, description: 'Chai Point', source: 'upi_auto', occurred_at: when } });
    assert.equal(res.status, 201);
    assert.equal(res.body.expense.source, 'upi_auto');
    assert.equal(new Date(res.body.expense.occurred_at).toISOString(), when);
});

// ─── AI quota, length and cost ──────────────────────────────────────────────

test('the free AI quota is enforced server-side with 429', async () => {
    const today = appTime.localDateKey();
    const a = t.db.addUser({ chat_messages_today: 9, chat_messages_reset_at: today });

    const ok = await t.request('POST', '/api/ai/invest-advice', { token: a.token, body: { query: 'Why did I spend so much?' } });
    assert.equal(ok.status, 200);
    assert.equal(t.db.profile(a.id).chat_messages_today, 10);

    const blocked = await t.request('POST', '/api/ai/invest-advice', { token: a.token, body: { query: 'And now?' } });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.code, 'QUOTA_EXCEEDED');
    assert.equal(blocked.body.limit, 10);
    assert.ok(blocked.body.resetsAt);
    assert.equal(t.gemini.calls.length, 1, 'no AI call once the quota is exhausted');
});

test('parallel AI requests cannot overshoot the quota', async () => {
    const today = appTime.localDateKey();
    const a = t.db.addUser({ chat_messages_today: 8, chat_messages_reset_at: today });
    const results = await Promise.all([1, 2, 3, 4].map(() =>
        t.request('POST', '/api/ai/invest-advice', { token: a.token, body: { query: 'hello' } })));
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [200, 200, 429, 429]);
    assert.equal(t.db.profile(a.id).chat_messages_today, 10);
});

test('the daily AI quota resets on a new IST day', async () => {
    const a = t.db.addUser({ chat_messages_today: 10, chat_messages_reset_at: '2020-01-01' });
    const res = await t.request('POST', '/api/ai/invest-advice', { token: a.token, body: { query: 'hello' } });
    assert.equal(res.status, 200);
    assert.equal(t.db.profile(a.id).chat_messages_today, 1);
});

test('AI questions are length-limited and a rejected question costs no quota', async () => {
    const a = t.db.addUser();
    const tooLong = await t.request('POST', '/api/ai/invest-advice', { token: a.token, body: { query: 'x'.repeat(501) } });
    assert.equal(tooLong.status, 400);
    const empty = await t.request('POST', '/api/ai/invest-advice', { token: a.token, body: { query: '   ' } });
    assert.equal(empty.status, 400);
    assert.equal(t.db.profile(a.id).chat_messages_today, 0);
    assert.equal(t.gemini.calls.length, 0);
});

test('AI output budget is capped and links are stripped from replies', async () => {
    const a = t.db.addUser();
    t.gemini.reply = 'Try this https://broker.example/?ref=SPENDLY today.';
    const res = await t.request('POST', '/api/ai/invest-advice', { token: a.token, body: { query: 'where to invest my savings' } });
    t.gemini.reply = 'Here is a general explanation.';
    assert.equal(res.status, 200);
    assert.ok(!/https?:\/\//.test(res.body.reply));
    assert.ok(res.body.reply.includes('not investment advice'));
    assert.ok(t.gemini.calls[0].options.maxOutputTokens <= 1000);
});

test('AI bursts are rate limited per user with standard headers', async () => {
    const a = t.db.addUser({ is_pro: true });
    let last;
    for (let i = 0; i < 6; i++) {
        last = await t.request('POST', '/api/ai/invest-advice', { token: a.token, body: { query: `q${i}` } });
    }
    assert.equal(last.status, 429);
    assert.equal(last.body.code, 'RATE_LIMITED');
    assert.ok(last.headers.get('retry-after'));
    assert.ok(last.headers.get('ratelimit-policy'));

    // A different user is unaffected.
    const b = t.db.addUser({ is_pro: true });
    const other = await t.request('POST', '/api/ai/invest-advice', { token: b.token, body: { query: 'hi' } });
    assert.equal(other.status, 200);
});

test('AI endpoints fail closed when usage cannot be verified', async () => {
    const a = t.db.addUser();
    t.db.failures.push({ table: 'profiles', op: 'select' });
    // `protect` also reads profiles; it must report the outage rather than allow access.
    const res = await t.request('POST', '/api/ai/invest-advice', { token: a.token, body: { query: 'hello' } });
    t.db.failures.length = 0;
    assert.equal(res.status, 503);
    assert.equal(t.gemini.calls.length, 0);
});

test('the burn-rate AI tip is cached rather than generated on every dashboard load', async () => {
    const a = t.db.addUser({ monthly_budget: 1000 });
    addExpense(a.id, { amount: 5000, category: 'Food' });
    for (let i = 0; i < 5; i++) {
        const res = await t.request('GET', '/api/burn-rate', { token: a.token });
        assert.equal(res.status, 200);
        assert.equal(res.body.burnRate.willGoBroke, true);
    }
    assert.equal(t.gemini.calls.length, 1);
});

// ─── Bans and deletion ──────────────────────────────────────────────────────

test('a banned user is refused', async () => {
    const a = t.db.addUser({ is_banned: true });
    const res = await t.request('GET', '/api/expenses', { token: a.token });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'ACCOUNT_SUSPENDED');
});

test('account deletion removes the login and all data, and the old token stops working', async () => {
    const a = t.db.addUser();
    const b = t.db.addUser();
    addExpense(a.id);
    addExpense(b.id);
    t.db.tables.ai_chat_history = [{ id: crypto.randomUUID(), user_id: a.id, role: 'user', content: 'x' }];

    const wrong = await t.request('DELETE', '/api/account', { token: a.token, body: { confirmation: 'yes' } });
    assert.equal(wrong.status, 400);
    assert.ok(t.db.profile(a.id));

    const res = await t.request('DELETE', '/api/account', { token: a.token, body: { confirmation: 'DELETE_MY_ACCOUNT' } });
    assert.equal(res.status, 200);
    assert.equal(t.db.calls.filter((c) => c[0] === 'deleteUser')[0][1], a.id);
    assert.equal(t.db.profile(a.id), undefined);
    assert.equal(t.db.tables.expenses.filter((e) => e.user_id === a.id).length, 0);
    assert.equal(t.db.tables.ai_chat_history.filter((e) => e.user_id === a.id).length, 0);
    assert.equal(t.db.tables.expenses.filter((e) => e.user_id === b.id).length, 1, 'other users untouched');

    const after = await t.request('GET', '/api/expenses', { token: a.token });
    assert.equal(after.status, 401);
});

test('account deletion reports failure, and deletes nothing, if the auth user cannot be removed', async () => {
    const a = t.db.addUser();
    addExpense(a.id);
    t.db.authUsers.delete(a.id);
    t.db.authUsers.set(a.id, { id: a.id, email: a.email });
    const original = t.db.client.auth.admin.deleteUser;
    t.db.client.auth.admin.deleteUser = async () => ({ data: null, error: { message: 'boom' } });
    const res = await t.request('DELETE', '/api/account', { token: a.token, body: { confirmation: 'DELETE_MY_ACCOUNT' } });
    t.db.client.auth.admin.deleteUser = original;
    assert.equal(res.status, 500);
    assert.ok(t.db.profile(a.id));
    assert.equal(t.db.tables.expenses.filter((e) => e.user_id === a.id).length, 1);
});

// ─── Misc ───────────────────────────────────────────────────────────────────

test('GET /api/pro/status does not modify the profile', async () => {
    const a = t.db.addUser({ is_pro: true, pro_expires_at: new Date(Date.now() - 1000).toISOString(), chat_messages_today: 4, chat_messages_reset_at: '2020-01-01' });
    // last_active_at is activity telemetry written by `protect`, not entitlement state.
    const snapshot = () => JSON.stringify({ ...t.db.profile(a.id), last_active_at: undefined });
    const before = snapshot();
    const res = await t.request('GET', '/api/pro/status', { token: a.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.limits.chatMessagesUsed, 0);
    assert.equal(snapshot(), before);
});

test('unknown API routes return JSON 404', async () => {
    const res = await t.request('GET', '/api/does-not-exist');
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
});

// ─── Missing profile self-repair ────────────────────────────────────────────

test('a signed-in account without a profile row gets one, and only with default values', async () => {
    const a = t.db.addUser({ full_name: 'Legacy User' });
    t.db.tables.profiles = t.db.tables.profiles.filter((p) => p.id !== a.id);

    assert.equal((await t.request('GET', '/api/auth/me', { token: a.token })).status, 404);

    const created = await t.request('POST', '/api/auth/profile', {
        token: a.token,
        body: { is_pro: true, role: 'admin', is_banned: false, pro_expires_at: '2099-01-01T00:00:00Z' },
    });
    assert.equal(created.status, 201, created.text);
    assert.equal(created.body.created, true);
    assert.equal(created.body.user.id, a.id);

    const row = t.db.profile(a.id);
    assert.ok(row, 'profile row created');
    assert.notEqual(row.is_pro, true);
    assert.notEqual(row.role, 'admin');
    assert.equal(row.pro_expires_at ?? null, null);
    assert.equal(row.email, a.email);

    const again = await t.request('POST', '/api/auth/profile', { token: a.token });
    assert.equal(again.status, 200);
    assert.equal(again.body.created, false);
    assert.equal(t.db.tables.profiles.filter((p) => p.id === a.id).length, 1);

    assert.equal((await t.request('POST', '/api/auth/profile')).status, 401);
});
