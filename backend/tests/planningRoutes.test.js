/**
 * Category budgets, income and reports against the real Express app and the
 * in-memory Supabase fake.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startTestApp } = require('./helpers/testApp');
const appTime = require('../lib/appTime');
const { periodRange, buildReport } = require('../lib/reports');

let t;
test.before(async () => { t = await startTestApp(); });
test.after(async () => { await t.close(); });
test.beforeEach(async () => { await t.resetRateLimits(); t.db.failures.length = 0; });

function addExpense(userId, amount, category, occurredAt = new Date()) {
    const at = occurredAt.toISOString();
    t.db.tables.expenses = [...(t.db.tables.expenses || []), {
        id: crypto.randomUUID(), user_id: userId, amount, category, description: category, roundup_chillar: 0, source: 'manual', occurred_at: at, created_at: at,
    }];
}

test('a period covers exactly its calendar span in app time', () => {
    const now = new Date('2026-03-18T06:00:00Z'); // a Wednesday
    const month = periodRange('month', 0, now);
    assert.equal(appTime.localDateKey(month.start), '2026-03-01');
    assert.equal(appTime.localDateKey(month.end), '2026-04-01');
    const january = periodRange('month', 2, now);
    assert.equal(appTime.localDateKey(january.start), '2026-01-01');
    const december = periodRange('month', 3, now);
    assert.equal(appTime.localDateKey(december.start), '2025-12-01');
    assert.equal(appTime.localDateKey(december.end), '2026-01-01');
    const week = periodRange('week', 0, now);
    assert.equal(appTime.localDateKey(week.start), '2026-03-16');
    assert.equal(appTime.localDateKey(week.end), '2026-03-23');
    assert.equal(appTime.localDateKey(periodRange('year', 1, now).start), '2025-01-01');
});

test('report totals add up in paise, and no income is not zero income', () => {
    const r = buildReport({
        period: 'month', label: 'x',
        expenses: [{ amount: 0.1, category: 'Food' }, { amount: 0.2, category: 'Food' }, { amount: 100, category: 'Rent' }],
        income: [], categoryBudgets: [{ category: 'Food', limit_inr: 1 }, { category: 'Other', limit_inr: 50 }], monthlyBudget: 5000,
    });
    assert.equal(r.totalSpent, 100.3);
    assert.equal(r.net, null);
    assert.equal(r.categories[0].category, 'Rent');
    const food = r.categories.find((c) => c.category === 'Food');
    assert.equal(food.amount, 0.3);
    assert.equal(food.over, false);
    assert.equal(r.categories.find((c) => c.category === 'Other').amount, 0);
});

test('monthly limits are not applied to a week or year', () => {
    const r = buildReport({ period: 'year', label: 'x', expenses: [{ amount: 900, category: 'Food' }], income: [], categoryBudgets: [{ category: 'Food', limit_inr: 1 }], monthlyBudget: 5000 });
    assert.equal(r.categories[0].limit, null);
    assert.equal(r.categories[0].over, false);
    assert.equal(r.monthlyBudget, null);
});

test('budgets: set, replace, list and remove; bad input is refused', async () => {
    const u = t.db.addUser({ monthly_budget: 5000 });
    assert.equal((await t.request('PUT', '/api/planning/category-budgets/Food', { token: u.token, body: { limit_inr: 2000 } })).status, 200);
    assert.equal((await t.request('PUT', '/api/planning/category-budgets/Food', { token: u.token, body: { limit_inr: 2500 } })).status, 200);
    const list = await t.request('GET', '/api/planning/category-budgets', { token: u.token });
    assert.deepEqual(list.body.budgets.map((b) => [b.category, b.limit_inr]), [['Food', 2500]]);
    assert.equal((await t.request('PUT', '/api/planning/category-budgets/Nope', { token: u.token, body: { limit_inr: 1 } })).status, 400);
    assert.equal((await t.request('PUT', '/api/planning/category-budgets/Food', { token: u.token, body: { limit_inr: 0 } })).status, 400);
    assert.equal((await t.request('DELETE', '/api/planning/category-budgets/Food', { token: u.token })).status, 200);
    assert.equal((await t.request('GET', '/api/planning/category-budgets', { token: u.token })).body.budgets.length, 0);
});

test('income: dates must be real and not in the future', async () => {
    const u = t.db.addUser({});
    const today = appTime.localDateKey();
    const ok = await t.request('POST', '/api/planning/income', { token: u.token, body: { amount_inr: 30000, source: 'Salary', received_on: today } });
    assert.equal(ok.status, 201);
    assert.equal((await t.request('POST', '/api/planning/income', { token: u.token, body: { amount_inr: 1, received_on: '2026-02-31' } })).status, 400);
    assert.equal((await t.request('POST', '/api/planning/income', { token: u.token, body: { amount_inr: 1, received_on: '2999-01-01' } })).status, 400);
    assert.equal((await t.request('POST', '/api/planning/income', { token: u.token, body: { amount_inr: 1, received_on: today, user_id: 'x' } })).status, 400);
});

test('a user can neither see nor remove another user\'s records', async () => {
    const a = t.db.addUser({});
    const b = t.db.addUser({});
    const entry = await t.request('POST', '/api/planning/income', { token: a.token, body: { amount_inr: 500, received_on: appTime.localDateKey() } });
    await t.request('PUT', '/api/planning/category-budgets/Food', { token: a.token, body: { limit_inr: 500 } });
    addExpense(a.id, 999, 'Food');
    assert.equal((await t.request('GET', '/api/planning/income', { token: b.token })).body.income.length, 0);
    assert.equal((await t.request('GET', '/api/planning/category-budgets', { token: b.token })).body.budgets.length, 0);
    assert.equal((await t.request('DELETE', `/api/planning/income/${entry.body.entry.id}`, { token: b.token })).status, 404);
    assert.equal((await t.request('GET', '/api/planning/report', { token: b.token })).body.report.totalSpent, 0);
    assert.equal((await t.request('GET', '/api/planning/income', { token: a.token })).body.income.length, 1);
});

test('report uses this month\'s rows only and includes income', async () => {
    const u = t.db.addUser({ monthly_budget: 5000 });
    addExpense(u.id, 1200, 'Food');
    addExpense(u.id, 777, 'Food', new Date(periodRange('month', 0).start.getTime() - 3600_000));
    await t.request('POST', '/api/planning/income', { token: u.token, body: { amount_inr: 2000, received_on: appTime.localDateKey() } });
    const { body } = await t.request('GET', '/api/planning/report?period=month', { token: u.token });
    assert.equal(body.report.totalSpent, 1200);
    assert.equal(body.report.totalIncome, 2000);
    assert.equal(body.report.net, 800);
    assert.equal(body.report.monthlyBudget, 5000);
    assert.equal((await t.request('GET', '/api/planning/report?period=decade', { token: u.token })).status, 400);
});

test('all routes need sign-in', async () => {
    for (const [m, p] of [['GET', '/report'], ['GET', '/report.csv'], ['GET', '/income'], ['GET', '/category-budgets'], ['PUT', '/category-budgets/Food']]) {
        assert.equal((await t.request(m, `/api/planning${p}`, {})).status, 401, p);
    }
});
