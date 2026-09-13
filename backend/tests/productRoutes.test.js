/**
 * End-to-end route tests for the product workflows, against the real Express
 * app with the in-memory Supabase fake.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startTestApp } = require('./helpers/testApp');

let t;
test.before(async () => { t = await startTestApp(); });
test.after(async () => { await t.close(); });
test.beforeEach(async () => { await t.resetRateLimits(); t.gemini.calls = []; t.gemini.configured = false; });

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
function addExpense(userId, overrides = {}) {
    const row = {
        id: crypto.randomUUID(), user_id: userId, amount: 100, category: 'Food', description: 'Lunch',
        roundup_chillar: 0, source: 'manual', occurred_at: new Date().toISOString(), created_at: new Date().toISOString(),
        ...overrides,
    };
    t.db.tables.expenses = t.db.tables.expenses || [];
    t.db.tables.expenses.push(row);
    return row;
}

// ─── Group Pool ─────────────────────────────────────────────────────────────

test('group pool: create, join by code, add expense with payer and participants, balances, settle, history', async () => {
    const asha = t.db.addUser({ full_name: 'Asha', email: 'asha-private@example.com' });
    const bala = t.db.addUser({ full_name: 'Bala' });
    const chitra = t.db.addUser({ full_name: 'Chitra' });
    const outsider = t.db.addUser({ full_name: 'Mallory' });

    const created = await t.request('POST', '/api/groups', { token: asha.token, body: { name: 'Flat 4B' } });
    assert.equal(created.status, 201);
    const groupId = created.body.group.id;
    const code = created.body.group.invite_code;
    assert.match(code, /^[A-Z2-9]{8}$/);

    // Direct add is refused; joining requires the code.
    assert.equal((await t.request('POST', `/api/groups/${groupId}/members`, { token: asha.token, body: { userId: bala.id } })).status, 400);
    assert.equal((await t.request('POST', '/api/groups/join', { token: bala.token, body: { code: 'WRONG234' } })).status, 404);
    assert.equal((await t.request('POST', '/api/groups/join', { token: bala.token, body: { code } })).status, 201);
    assert.equal((await t.request('POST', '/api/groups/join', { token: chitra.token, body: { code: code.toLowerCase() } })).status, 201);
    const again = await t.request('POST', '/api/groups/join', { token: chitra.token, body: { code } });
    assert.equal(again.body.alreadyMember, true);

    // Asha pays ₹900 for all three; Bala pays ₹300 for Bala and Chitra.
    const e1 = await t.request('POST', `/api/groups/${groupId}/expenses`, { token: bala.token, body: { description: 'Groceries', amount: 900, paidBy: asha.id } });
    assert.equal(e1.status, 201);
    assert.deepEqual(e1.body.shares.map((s) => s.share), [300, 300, 300]);
    const e2 = await t.request('POST', `/api/groups/${groupId}/expenses`, { token: bala.token, body: { description: 'Cab', amount: 300, participants: [bala.id, chitra.id] } });
    assert.equal(e2.status, 201);

    // A payer or participant outside the group is rejected.
    assert.equal((await t.request('POST', `/api/groups/${groupId}/expenses`, { token: asha.token, body: { description: 'x', amount: 10, paidBy: outsider.id } })).status, 400);
    assert.equal((await t.request('POST', `/api/groups/${groupId}/expenses`, { token: asha.token, body: { description: 'x', amount: 10, participants: [outsider.id] } })).status, 400);

    let detail = await t.request('GET', `/api/groups/${groupId}`, { token: chitra.token });
    assert.equal(detail.status, 200);
    const bal = Object.fromEntries(detail.body.balances.map((b) => [b.name, b.balance]));
    assert.deepEqual(bal, { Asha: 600, Bala: -150, Chitra: -450 });
    assert.deepEqual(detail.body.settleUp.map((s) => [s.from.name, s.to.name, s.amount]), [['Chitra', 'Asha', 450], ['Bala', 'Asha', 150]]);
    assert.equal(detail.body.members.length, 3);
    assert.ok(!JSON.stringify(detail.body).includes('asha-private@example.com'), 'no member emails');

    // Recording a payment between two other people is refused.
    assert.equal((await t.request('POST', `/api/groups/${groupId}/settle`, { token: asha.token, body: { fromUserId: bala.id, toUserId: chitra.id, amount: 10 } })).status, 403);
    // Chitra records paying Asha; Asha records Bala paying her.
    assert.equal((await t.request('POST', `/api/groups/${groupId}/settle`, { token: chitra.token, body: { toUserId: asha.id, amount: 450 } })).status, 201);
    assert.equal((await t.request('POST', `/api/groups/${groupId}/settle`, { token: asha.token, body: { fromUserId: bala.id, toUserId: asha.id, amount: 150 } })).status, 201);

    detail = await t.request('GET', `/api/groups/${groupId}`, { token: asha.token });
    assert.ok(detail.body.balances.every((b) => b.balance === 0));
    assert.deepEqual(detail.body.settleUp, []);
    assert.equal(detail.body.history.length, 4);
    assert.deepEqual(detail.body.history.map((h) => h.type).sort(), ['expense', 'expense', 'settlement', 'settlement']);
    assert.equal(detail.body.totalSpent, 1200);

    const list = await t.request('GET', '/api/groups', { token: bala.token });
    assert.equal(list.body.groups[0].memberCount, 3);
    assert.equal(list.body.groups[0].myBalance, 0);

    // User A (outsider) cannot access the unrelated private group at all.
    assert.equal((await t.request('GET', `/api/groups/${groupId}`, { token: outsider.token })).status, 403);
    assert.equal((await t.request('POST', `/api/groups/${groupId}/expenses`, { token: outsider.token, body: { description: 'x', amount: 10 } })).status, 403);
    assert.equal((await t.request('POST', `/api/groups/${groupId}/settle`, { token: outsider.token, body: { toUserId: asha.id, amount: 1 } })).status, 403);
    assert.equal((await t.request('POST', `/api/groups/${groupId}/invite-code`, { token: outsider.token })).status, 403);
    assert.deepEqual((await t.request('GET', '/api/groups', { token: outsider.token })).body.groups, []);

    // Only the admin can rotate the code; the old code stops working.
    assert.equal((await t.request('POST', `/api/groups/${groupId}/invite-code`, { token: bala.token })).status, 403);
    const rotated = await t.request('POST', `/api/groups/${groupId}/invite-code`, { token: asha.token });
    assert.notEqual(rotated.body.inviteCode, code);
    assert.equal((await t.request('POST', '/api/groups/join', { token: outsider.token, body: { code } })).status, 404);
});

test('group pool: cannot leave with an open balance; can leave once settled', async () => {
    const a = t.db.addUser({ full_name: 'A' });
    const b = t.db.addUser({ full_name: 'B' });
    const g = (await t.request('POST', '/api/groups', { token: a.token, body: { name: 'Trip' } })).body.group;
    await t.request('POST', '/api/groups/join', { token: b.token, body: { code: g.invite_code } });
    await t.request('POST', `/api/groups/${g.id}/expenses`, { token: a.token, body: { description: 'Hotel', amount: 1000 } });

    assert.equal((await t.request('DELETE', `/api/groups/${g.id}/members/me`, { token: b.token })).status, 409);
    await t.request('POST', `/api/groups/${g.id}/settle`, { token: b.token, body: { toUserId: a.id, amount: 500 } });
    assert.equal((await t.request('DELETE', `/api/groups/${g.id}/members/me`, { token: b.token })).status, 200);
});

test('group pool: invite-code guessing is rate limited', async () => {
    const u = t.db.addUser();
    let last;
    for (let i = 0; i < 11; i++) last = await t.request('POST', '/api/groups/join', { token: u.token, body: { code: `GUESS${String(i).padStart(3, '2')}`.slice(0, 8) } });
    assert.equal(last.status, 429);
});

// ─── Subscriptions ──────────────────────────────────────────────────────────

test('subscriptions: detect, mark cancelled once, show savings, undo', async () => {
    const u = t.db.addUser();
    for (const d of [65, 35, 5]) addExpense(u.id, { amount: 649, description: 'NETFLIX.COM', category: 'Entertainment', occurred_at: daysAgo(d) });

    let res = await t.request('GET', '/api/subscriptions/detect', { token: u.token });
    assert.equal(res.status, 200);
    const sub = res.body.subscriptions[0];
    assert.equal(sub.status, 'active');
    assert.equal(sub.annualAmount, 7788);
    assert.equal(res.body.activeAnnualTotal, 7788);
    assert.equal(sub.cancellation.matched, true);
    assert.ok(sub.cancellation.url.startsWith('https://www.netflix.com/'));
    assert.doesNotMatch(sub.cancellation.url, /ref=|refer|signup|utm_/);

    // The amount is taken from detection, not from the request.
    assert.equal((await t.request('POST', '/api/subscriptions/cancelled', { token: u.token, body: { normalizedName: sub.normalizedName, monthlyAmount: 999999 } })).status, 400);
    assert.equal((await t.request('POST', '/api/subscriptions/cancelled', { token: u.token, body: { normalizedName: 'does not exist' } })).status, 404);
    assert.equal((await t.request('POST', '/api/subscriptions/cancelled', { token: u.token, body: { normalizedName: sub.normalizedName } })).status, 201);
    const dup = await t.request('POST', '/api/subscriptions/cancelled', { token: u.token, body: { normalizedName: sub.normalizedName } });
    assert.equal(dup.body.alreadyCancelled, true);
    assert.equal(t.db.tables.cancelled_subscriptions.filter((c) => c.user_id === u.id).length, 1, 'no duplicate records');

    res = await t.request('GET', '/api/subscriptions/detect', { token: u.token });
    assert.equal(res.body.subscriptions[0].status, 'cancelled');
    assert.equal(res.body.activeMonthlyTotal, 0);
    assert.equal(res.body.cancelledMonthlySavings, 649);

    assert.equal((await t.request('DELETE', `/api/subscriptions/cancelled/${encodeURIComponent(sub.normalizedName)}`, { token: u.token })).status, 200);
    res = await t.request('GET', '/api/subscriptions/detect', { token: u.token });
    assert.equal(res.body.subscriptions[0].status, 'active');
});

// ─── Wealth, score, AI ──────────────────────────────────────────────────────

test('wealth endpoint returns real month and history figures', async () => {
    const u = t.db.addUser({ monthly_budget: 20000, investment_target: 2000, total_chillar: 12.5 });
    addExpense(u.id, { amount: 1500 });
    const res = await t.request('GET', '/api/wealth', { token: u.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.wealth.history.length, 6);
    assert.equal(res.body.wealth.month.spent, 1500);
    assert.equal(res.body.wealth.roundUps.total, 12.5);
    assert.equal(res.body.wealth.tracked.investments, false);
    assert.equal((await t.request('GET', '/api/wealth')).status, 401);
});

test('paisa score endpoint withholds the score for a new user', async () => {
    const u = t.db.addUser({ monthly_budget: 0 });
    const res = await t.request('GET', '/api/paisa-score', { token: u.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.paisaScore.total, null);
    assert.equal(res.body.paisaScore.status, 'insufficient_data');
    assert.equal(res.body.paisaScore.change, null);
});

test('AI spending analysis answers with the user\'s real numbers', async () => {
    const u = t.db.addUser({ monthly_budget: 30000 });
    for (let i = 0; i < 12; i++) addExpense(u.id, { amount: 500, category: 'Food', occurred_at: daysAgo(i % 5) });
    const res = await t.request('POST', '/api/ai/invest-advice', { token: u.token, body: { query: 'Give me a monthly summary' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.intent, 'monthly_summary');
    assert.equal(res.body.source, 'calculated');
    assert.match(res.body.reply, /₹6,000/);
});

test('AI replies that invent numbers are replaced by the calculated answer', async () => {
    const u = t.db.addUser({ monthly_budget: 30000 });
    for (let i = 0; i < 12; i++) addExpense(u.id, { amount: 500, category: 'Food', occurred_at: daysAgo(i % 5) });
    t.gemini.configured = true;
    t.gemini.reply = 'You spent ₹98,765 on food, which is 73% of your income.';
    const res = await t.request('POST', '/api/ai/invest-advice', { token: u.token, body: { query: 'Give me a monthly summary' } });
    t.gemini.reply = 'Here is a general explanation.';
    assert.equal(res.status, 200);
    assert.equal(res.body.source, 'calculated');
    assert.ok(!res.body.reply.includes('98,765'));
});

// ─── Expenses search / filter / sort / edit ─────────────────────────────────

test('expense search, filters and sort are applied server-side', async () => {
    const u = t.db.addUser();
    addExpense(u.id, { description: 'Swiggy dinner', amount: 450, category: 'Food', occurred_at: daysAgo(1) });
    addExpense(u.id, { description: 'Uber to office', amount: 220, category: 'Transport', occurred_at: daysAgo(2) });
    addExpense(u.id, { description: 'Swiggy lunch', amount: 180, category: 'Food', occurred_at: daysAgo(3) });

    const q = await t.request('GET', '/api/expenses?q=swiggy', { token: u.token });
    assert.deepEqual(q.body.expenses.map((e) => e.description).sort(), ['Swiggy dinner', 'Swiggy lunch']);
    const cat = await t.request('GET', '/api/expenses?category=Transport', { token: u.token });
    assert.deepEqual(cat.body.expenses.map((e) => e.description), ['Uber to office']);
    const high = await t.request('GET', '/api/expenses?sort=highest', { token: u.token });
    assert.deepEqual(high.body.expenses.map((e) => e.amount), [450, 220, 180]);
    const range = await t.request('GET', '/api/expenses?minAmount=200&maxAmount=300', { token: u.token });
    assert.deepEqual(range.body.expenses.map((e) => e.amount), [220]);
    assert.equal((await t.request('GET', '/api/expenses?sort=random', { token: u.token })).status, 400);

    const target = q.body.expenses[0];
    const patched = await t.request('PATCH', `/api/expenses/${target.id}`, { token: u.token, body: { amount: 499, category: 'Other' } });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.expense.amount, 499);
});
