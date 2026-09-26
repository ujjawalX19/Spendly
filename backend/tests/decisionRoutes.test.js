/**
 * /api/decisions — Afford-It, SIP Stress Test, Month Shape, Safe-to-Invest —
 * against the real Express app and the in-memory Supabase fake.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startTestApp } = require('./helpers/testApp');

let t;
test.before(async () => { t = await startTestApp(); });
test.after(async () => { await t.close(); });
test.beforeEach(async () => { await t.resetRateLimits(); t.db.failures.length = 0; });

function addExpense(userId, amount, overrides = {}) {
    t.db.tables.expenses = t.db.tables.expenses || [];
    t.db.tables.expenses.push({
        id: crypto.randomUUID(), user_id: userId, amount, category: 'Food', description: 'Lunch',
        roundup_chillar: 0, source: 'manual', occurred_at: new Date().toISOString(), created_at: new Date().toISOString(),
        ...overrides,
    });
}

test('decision endpoints require a signed-in user', async () => {
    for (const [method, url, body] of [
        ['POST', '/api/decisions/afford', { amount: 100 }],
        ['POST', '/api/decisions/sip-stress-test', { monthlyAmount: 100 }],
        ['GET', '/api/decisions/month-shape'],
        ['GET', '/api/decisions/safe-to-invest'],
    ]) {
        assert.equal((await t.request(method, url, { body })).status, 401, url);
        assert.equal((await t.request(method, url, { body, token: 'forged-token' })).status, 401, url);
    }
});

test('Afford-It uses the same Safe-to-Spend the dashboard shows', async () => {
    const u = t.db.addUser({ monthly_budget: 10000 });
    addExpense(u.id, 2500);
    const dashboard = await t.request('GET', '/api/safe-to-spend', { token: u.token });
    const check = await t.request('POST', '/api/decisions/afford', { token: u.token, body: { amount: 1200, label: 'Headphones' } });
    assert.equal(check.status, 200);
    assert.equal(check.body.check.safeToSpendRemaining, dashboard.body.safeToSpend.remaining);
    assert.equal(check.body.check.label, 'Headphones');
    assert.ok(['can_afford', 'wait', 'not_comfortable'].includes(check.body.check.verdict));
    assert.equal(check.body.quota.remaining, 4);
});

test('Afford-It and SIP inputs are validated; invalid input costs no quota', async () => {
    const u = t.db.addUser();
    const bad = [
        ['/api/decisions/afford', { amount: 0 }],
        ['/api/decisions/afford', { amount: -500 }],
        ['/api/decisions/afford', { amount: 'lots' }],
        ['/api/decisions/afford', { amount: 10_000_001 }],
        ['/api/decisions/afford', {}],
        ['/api/decisions/afford', { amount: 100, label: 'x'.repeat(61) }],
        ['/api/decisions/sip-stress-test', { monthlyAmount: 0 }],
        ['/api/decisions/sip-stress-test', { monthlyAmount: -1 }],
    ];
    for (const [url, body] of bad) {
        const res = await t.request('POST', url, { token: u.token, body });
        assert.equal(res.status, 400, `${url} ${JSON.stringify(body)}`);
        assert.equal(res.body.code, 'VALIDATION_FAILED');
    }
    assert.equal(t.db.profile(u.id).money_checks_today, 0);
});

test('API manipulation: server-owned fields and another user id in the body are refused', async () => {
    const u = t.db.addUser();
    const other = t.db.addUser();
    for (const body of [
        { amount: 100, is_pro: true },
        { amount: 100, userId: other.id },
        { amount: 100, user_id: other.id },
        { amount: 100, monthlyBudget: 99999999 },
    ]) {
        const res = await t.request('POST', '/api/decisions/afford', { token: u.token, body });
        assert.equal(res.status, 400, JSON.stringify(body));
    }
    assert.equal(t.db.profile(u.id).is_pro, false);
});

test('a user only ever sees their own numbers (no cross-user access)', async () => {
    const a = t.db.addUser({ monthly_budget: 20000 });
    const b = t.db.addUser({ monthly_budget: 20000 });
    addExpense(b.id, 15000);
    t.db.tables.recurring_bills = [...(t.db.tables.recurring_bills || []), { id: crypto.randomUUID(), user_id: b.id, name: 'B rent', amount: 3000, due_day: 31, is_active: true }];

    const aShape = await t.request('GET', '/api/decisions/month-shape', { token: a.token });
    assert.equal(aShape.status, 200);
    assert.equal(aShape.body.monthShape.spent, 0);
    assert.equal(aShape.body.monthShape.upcomingBills, 0);
    assert.ok(!JSON.stringify(aShape.body).includes('B rent'));

    const bShape = await t.request('GET', '/api/decisions/month-shape', { token: b.token });
    assert.equal(bShape.body.monthShape.spent, 15000);
});

test('Free users get 5 money checks a day across Afford-It and SIP; the 6th is refused', async () => {
    const u = t.db.addUser();
    for (let i = 0; i < 3; i++) assert.equal((await t.request('POST', '/api/decisions/afford', { token: u.token, body: { amount: 100 + i } })).status, 200);
    for (let i = 0; i < 2; i++) assert.equal((await t.request('POST', '/api/decisions/sip-stress-test', { token: u.token, body: { monthlyAmount: 500 } })).status, 200);
    const sixth = await t.request('POST', '/api/decisions/afford', { token: u.token, body: { amount: 100 } });
    assert.equal(sixth.status, 429);
    assert.equal(sixth.body.code, 'QUOTA_EXCEEDED');
    assert.match(sixth.body.message, /5 free money checks/);
    assert.doesNotMatch(sixth.body.message, /buy|upgrade|purchase/i);

    // Read-only views never use the quota.
    assert.equal((await t.request('GET', '/api/decisions/month-shape', { token: u.token })).status, 200);
    assert.equal((await t.request('GET', '/api/decisions/safe-to-invest', { token: u.token })).status, 200);

    const status = await t.request('GET', '/api/pro/status', { token: u.token });
    assert.equal(status.body.limits.moneyChecksUsed, 5);
    assert.equal(status.body.limits.moneyChecksLimit, 5);
});

test('Pro entitlement: only a server-side Pro flag lifts the limit, and an expired one does not', async () => {
    const pro = t.db.addUser({ is_pro: true, pro_expires_at: new Date(Date.now() + 86400000).toISOString() });
    for (let i = 0; i < 8; i++) assert.equal((await t.request('POST', '/api/decisions/afford', { token: pro.token, body: { amount: 100 } })).status, 200);

    const expired = t.db.addUser({ is_pro: true, pro_expires_at: new Date(Date.now() - 1000).toISOString() });
    for (let i = 0; i < 5; i++) await t.request('POST', '/api/decisions/afford', { token: expired.token, body: { amount: 100 } });
    assert.equal((await t.request('POST', '/api/decisions/afford', { token: expired.token, body: { amount: 100 } })).status, 429);

    // A client header or body claiming Pro changes nothing.
    const free = t.db.addUser();
    for (let i = 0; i < 5; i++) await t.request('POST', '/api/decisions/afford', { token: free.token, body: { amount: 100 }, headers: { 'X-Is-Pro': 'true' } });
    assert.equal((await t.request('POST', '/api/decisions/afford', { token: free.token, body: { amount: 100 }, headers: { 'X-Is-Pro': 'true' } })).status, 429);
});

test('Safe-to-Invest and SIP answers are education-only and never name a product', async () => {
    const u = t.db.addUser({ monthly_budget: 30000, investment_target: 2000 });
    addExpense(u.id, 4000);
    const sti = await t.request('GET', '/api/decisions/safe-to-invest', { token: u.token });
    assert.equal(sti.status, 200);
    assert.match(sti.body.safeToInvest.note, /not investment advice/);
    const sip = await t.request('POST', '/api/decisions/sip-stress-test', { token: u.token, body: { monthlyAmount: 3000 } });
    assert.equal(sip.status, 200);
    assert.ok(['comfortable', 'watch', 'tight'].includes(sip.body.test.state));
    assert.doesNotMatch(JSON.stringify([sti.body, sip.body]), /\b(nifty|sensex|zerodha|groww|guaranteed return)\b/i);
});

test('a data outage returns a friendly 503 and refunds the check', async () => {
    const u = t.db.addUser();
    t.db.failures.push({ table: 'expenses', op: 'select' });
    const res = await t.request('POST', '/api/decisions/afford', { token: u.token, body: { amount: 100 } });
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'DATA_UNAVAILABLE');
    assert.equal(t.db.profile(u.id).money_checks_today, 0);
});

test('a profile-less account gets PROFILE_NOT_FOUND from the read-only views', async () => {
    const u = t.db.addUser();
    t.db.tables.profiles = t.db.tables.profiles.filter((p) => p.id !== u.id);
    const res = await t.request('GET', '/api/decisions/month-shape', { token: u.token });
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'PROFILE_NOT_FOUND');
});
