/** Money alerts, the PDF report, subcategories and the public offer switch. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers/testApp');
const { buildAlerts } = require('../lib/moneyAlerts');

let t;
test.before(async () => { t = await startTestApp(); });
test.after(async () => { await t.close(); delete process.env.LIMITED_OFFER_ENABLED; });
test.beforeEach(async () => { await t.resetRateLimits(); t.db.failures.length = 0; });

const NOW = new Date('2026-03-18T06:00:00Z'); // Wednesday, 11:30 IST
const base = { now: NOW, month: '2026-03', monthlyBudget: 0, categoryBudgets: [], monthExpenses: [], recentExpenses: [], bills: [], goals: [] };
const food = (amount) => ({ amount, category: 'Food', occurred_at: NOW.toISOString() });

test('budget alerts at 80% and 100%, stable per month, with no amounts', () => {
    const under = buildAlerts({ ...base, categoryBudgets: [{ category: 'Food', limit_inr: 1000 }], monthExpenses: [food(790)] });
    assert.equal(under.filter((a) => a.kind === 'budget').length, 0);
    const near = buildAlerts({ ...base, categoryBudgets: [{ category: 'Food', limit_inr: 1000 }], monthExpenses: [food(800)] }).find((a) => a.kind === 'budget');
    assert.equal(near.id, 'budget:Food:2026-03:80');
    const over = buildAlerts({ ...base, categoryBudgets: [{ category: 'Food', limit_inr: 1000 }], monthExpenses: [food(1000)] }).find((a) => a.kind === 'budget');
    assert.equal(over.id, 'budget:Food:2026-03:100');
    assert.doesNotMatch(JSON.stringify([near, over]), /₹|Rs\.|\b800\b/);
});

test('unusual spending needs history and a clear gap', () => {
    const old = Array.from({ length: 10 }, () => ({ amount: 100, category: 'Food', occurred_at: '2026-03-10T06:00:00Z' }));
    assert.ok(!buildAlerts({ ...base, recentExpenses: [food(5000)] }).some((a) => a.kind === 'unusual'));
    assert.ok(!buildAlerts({ ...base, recentExpenses: [...old, food(300)] }).some((a) => a.kind === 'unusual'));
    assert.ok(buildAlerts({ ...base, recentExpenses: [...old, food(301)] }).some((a) => a.kind === 'unusual'));
});

test('bills: the day before, never for a due date already gone, and paused bills stay quiet', () => {
    const alerts = buildAlerts({ ...base, bills: [{ name: 'Rent', due_day: 25, is_active: true }, { name: 'Old', due_day: 5, is_active: true }, { name: 'Off', due_day: 28, is_active: false }] });
    const bills = alerts.filter((a) => a.kind === 'bill');
    assert.deepEqual(bills.map((a) => a.body), ['Rent is due tomorrow.']);
    assert.equal(bills[0].notifyAt, '2026-03-24T03:30:00.000Z');
});

test('weekly summary is the coming Sunday at 6 pm, then the next one', () => {
    assert.equal(buildAlerts(base).find((a) => a.kind === 'weekly').notifyAt, '2026-03-22T12:30:00.000Z');
    const sundayNight = buildAlerts({ ...base, now: new Date('2026-03-22T14:00:00Z') }).find((a) => a.kind === 'weekly');
    assert.equal(sundayNight.notifyAt, '2026-03-29T12:30:00.000Z');
});

test('PDF report is Pro only and is a real PDF', async () => {
    const free = t.db.addUser({});
    assert.equal((await t.request('GET', '/api/planning/report.pdf', { token: free.token })).status, 403);
    const pro = t.db.addUser({ is_pro: true, monthly_budget: 5000 });
    const res = await t.request('GET', '/api/planning/report.pdf', { token: pro.token });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    assert.ok(res.text.startsWith('%PDF'));
});

test('a subcategory is saved, edited, and optional', async () => {
    const u = t.db.addUser({ monthly_budget: 5000 });
    const made = await t.request('POST', '/api/expenses', { token: u.token, body: { amount: 50, category: 'Food', description: 'Milk', subcategory: 'Groceries' } });
    assert.equal(made.status, 201);
    assert.equal(made.body.expense.subcategory, 'Groceries');
    const edited = await t.request('PATCH', `/api/expenses/${made.body.expense.id}`, { token: u.token, body: { subcategory: 'Dairy' } });
    assert.equal(edited.body.expense.subcategory, 'Dairy');
    const plain = await t.request('POST', '/api/expenses', { token: u.token, body: { amount: 50 } });
    assert.equal(plain.status, 201);
    assert.equal((await t.request('POST', '/api/expenses', { token: u.token, body: { amount: 50, subcategory: 'x'.repeat(41) } })).status, 400);
});

test('the public config names the offer only while it is on', async () => {
    delete process.env.LIMITED_OFFER_ENABLED;
    assert.equal((await t.request('GET', '/api/app-config', {})).body.launchOffer, false);
    process.env.LIMITED_OFFER_ENABLED = 'true';
    assert.equal((await t.request('GET', '/api/app-config', {})).body.launchOffer, true);
});
