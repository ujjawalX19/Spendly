/**
 * Month Calendar, Money Wrapped, Money-Saved and receipt splits, against the
 * real Express app and the in-memory Supabase fake.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startTestApp } = require('./helpers/testApp');
const appTime = require('../lib/appTime');
const { allocateReceipt, ReceiptSplitError } = require('../lib/receiptSplit');
const { buildCalendar, buildWrapped } = require('../lib/moneyViews');

let t;
test.before(async () => { t = await startTestApp(); });
test.after(async () => { await t.close(); });
test.beforeEach(async () => { await t.resetRateLimits(); t.db.failures.length = 0; });

const PRO = { is_pro: true, pro_expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), monthly_budget: 5000 };
const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);

test('receipt shares always add up to the total, with tax shared by items', () => {
    const shares = allocateReceipt([
        { name: 'Pizza', pricePaise: 30000, participants: ['a', 'b', 'c'] },
        { name: 'Juice', pricePaise: 10000, participants: ['a'] },
    ], 44000);
    assert.equal(sum(shares), 44000);
    assert.equal(shares.get('a'), 22000); // 200 of 400 items, half of the 40 tax
    assert.equal(shares.get('b'), 11000);
    for (const [items, total] of [[[{ name: 'x', pricePaise: 100, participants: ['a', 'b', 'c'] }], 107], [[{ name: 'x', pricePaise: 1000, participants: ['a', 'b', 'c'] }], 901]]) {
        assert.equal(sum(allocateReceipt(items, total)), total);
    }
});

test('a discount lowers shares; impossible totals are refused', () => {
    const shares = allocateReceipt([{ name: 'x', pricePaise: 1000, participants: ['a', 'b'] }], 800);
    assert.equal(sum(shares), 800);
    assert.throws(() => allocateReceipt([{ name: 'x', pricePaise: 1000, participants: ['a'] }], 5000), ReceiptSplitError);
    assert.throws(() => allocateReceipt([], 100), ReceiptSplitError);
});

test('calendar: every day present, bills clamp to the month end, totals reconcile', () => {
    const c = buildCalendar({
        month: '2028-02',
        expenses: [{ amount: 10.1, occurred_at: '2028-02-29T10:00:00+05:30' }, { amount: 0.2, occurred_at: '2028-02-29T11:00:00+05:30' }],
        bills: [{ name: 'Rent', amount: 100, due_day: 31, is_active: true }, { name: 'Old', amount: 5, due_day: 1, is_active: false }],
        goals: [{ name: 'Bike', target_date: '2028-02-10' }, { name: 'Later', target_date: '2028-03-10' }],
    });
    assert.equal(c.days.length, 29);
    assert.equal(c.days[28].spent, 10.3);
    assert.equal(c.days[28].bills[0].name, 'Rent');
    assert.equal(c.totalSpent, 10.3);
    assert.equal(c.totalBills, 100);
    assert.deepEqual(c.days[9].goals, ['Bike']);
});

test('calendar needs Pro; a free user is told, not shown an empty month', async () => {
    const free = t.db.addUser({ monthly_budget: 5000 });
    const res = await t.request('GET', '/api/planning/calendar', { token: free.token });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'PRO_REQUIRED');
    const pro = t.db.addUser(PRO);
    const ok = await t.request('GET', `/api/planning/calendar?month=${appTime.localMonthKey()}`, { token: pro.token });
    assert.equal(ok.status, 200);
    assert.equal((await t.request('GET', '/api/planning/calendar?month=2026-13', { token: pro.token })).status, 400);
});

test('wrapped waits for enough data, and its share object has no amounts or names', () => {
    const e = (i) => ({ amount: 100 + i, category: i < 3 ? 'Food' : 'Rent', description: 'Cafe', occurred_at: `2026-03-0${i + 1}T10:00:00+05:30` });
    assert.equal(buildWrapped({ label: 'x', expenses: [e(0)], elapsedDays: 31 }).eligible, false);
    const w = buildWrapped({ label: 'March', expenses: [0, 1, 2, 3, 4].map(e), elapsedDays: 31 });
    assert.equal(w.eligible, true);
    assert.equal(w.activeDays, 5);
    assert.equal(w.noSpendDays, 26);
    assert.equal(w.regular.name, 'Cafe');
    assert.deepEqual(Object.keys(w.share).sort(), ['activeDays', 'expenseCount', 'label', 'noSpendDays']);
    assert.doesNotMatch(JSON.stringify(w.share), /Cafe|Food|Rent/);
});

test('only a skipped purchase counts as saved', async () => {
    const u = t.db.addUser({});
    for (const [decision, amount] of [['bought', 100], ['deferred', 200], ['skipped', 300]]) {
        assert.equal((await t.request('POST', '/api/planning/purchases', { token: u.token, body: { amount, decision } })).status, 201);
    }
    const ledger = await t.request('GET', '/api/planning/savings-ledger', { token: u.token });
    assert.equal(ledger.body.total, 300);
    assert.equal((await t.request('POST', '/api/planning/purchases', { token: u.token, body: { amount: 1, decision: 'maybe' } })).status, 400);
});

test('price difference: must really be lower; entries stay private', async () => {
    const a = t.db.addUser({});
    const b = t.db.addUser({});
    const bad = await t.request('POST', '/api/planning/savings-ledger/price-difference', { token: a.token, body: { usualPrice: 100, paidPrice: 100, label: 'Shoes' } });
    assert.equal(bad.status, 400);
    await t.request('POST', '/api/planning/savings-ledger/price-difference', { token: a.token, body: { usualPrice: 100.5, paidPrice: 80, label: 'Shoes' } });
    const mine = await t.request('GET', '/api/planning/savings-ledger', { token: a.token });
    assert.equal(mine.body.total, 20.5);
    assert.equal((await t.request('GET', '/api/planning/savings-ledger', { token: b.token })).body.events.length, 0);
    const id = mine.body.events[0].id;
    assert.equal((await t.request('DELETE', `/api/planning/savings-ledger/${id}`, { token: b.token })).status, 404);
    assert.equal((await t.request('DELETE', `/api/planning/savings-ledger/${id}`, { token: a.token })).status, 200);
});

test('receipt split: Pro only, members only, retry-safe', async () => {
    const owner = t.db.addUser(PRO);
    const outsider = t.db.addUser(PRO);
    const free = t.db.addUser({});
    const made = await t.request('POST', '/api/groups', { token: owner.token, body: { name: 'Flat' } });
    assert.equal(made.status, 201);
    const groupId = made.body.group.id;
    const body = { description: 'Dinner', total: 110, clientRef: crypto.randomUUID(), items: [{ name: 'Food', price: 100, participants: [owner.id] }] };
    assert.equal((await t.request('POST', `/api/groups/${groupId}/receipt-split`, { token: free.token, body })).status, 403);
    assert.equal((await t.request('POST', `/api/groups/${groupId}/receipt-split`, { token: outsider.token, body })).status, 403);
    const first = await t.request('POST', `/api/groups/${groupId}/receipt-split`, { token: owner.token, body });
    assert.equal(first.status, 201);
    assert.deepEqual(first.body.shares, [{ id: owner.id, share: 110 }]);
    const retry = await t.request('POST', `/api/groups/${groupId}/receipt-split`, { token: owner.token, body });
    assert.equal(retry.body.duplicate, true);
    assert.equal(t.db.tables.group_expenses.filter((e) => e.group_id === groupId).length, 1);
    const stranger = { ...body, clientRef: crypto.randomUUID(), items: [{ name: 'Food', price: 100, participants: [outsider.id] }] };
    assert.equal((await t.request('POST', `/api/groups/${groupId}/receipt-split`, { token: owner.token, body: stranger })).status, 400);
});
