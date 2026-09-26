/**
 * /api/money-streak and Money XP, against the real Express app and the
 * in-memory Supabase fake. Days are real IST calendar days relative to today.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startTestApp } = require('./helpers/testApp');
const appTime = require('../lib/appTime');
const ms = require('../lib/moneyStreak');

let t;
test.before(async () => { t = await startTestApp(); });
test.after(async () => { await t.close(); });
test.beforeEach(async () => { await t.resetRateLimits(); t.db.failures.length = 0; });

const today = () => appTime.localDateKey(new Date());
const noonOf = (key) => new Date(ms.dayStart(key).getTime() + 12 * 3600 * 1000).toISOString();
const RICH = { monthly_budget: 3_000_000 }; // every daily limit is far above ₹100

function addExpense(userId, dateKey, amount = 100, category = 'Food') {
    const row = { id: crypto.randomUUID(), user_id: userId, amount, category, description: category, roundup_chillar: 0, source: 'manual', occurred_at: noonOf(dateKey), created_at: new Date().toISOString() };
    t.db.tables.expenses = [...(t.db.tables.expenses || []), row];
    return row;
}
const ledger = (userId) => (t.db.tables.money_xp_ledger || []).filter((r) => r.user_id === userId);
const get = (u) => t.request('GET', '/api/money-streak', { token: u.token });

test('Money Streak requires sign-in', async () => {
    assert.equal((await t.request('GET', '/api/money-streak')).status, 401);
    assert.equal((await t.request('POST', '/api/money-streak/no-spend')).status, 401);
    assert.equal((await t.request('GET', '/api/money-streak', { token: 'forged' })).status, 401);
});

test('first visit starts the streak today with no backlog of XP', async () => {
    const u = t.db.addUser(RICH);
    for (let i = 1; i <= 5; i++) addExpense(u.id, ms.addDays(today(), -i)); // history before v1.1
    const res = await get(u);
    assert.equal(res.status, 200);
    const s = res.body.moneyStreak;
    assert.equal(s.startedOn, today());
    assert.equal(t.db.profile(u.id).money_streak_started_on, today());
    assert.equal(s.current, 0);
    assert.equal(s.xp.total, 0);
    assert.equal(s.xp.levelName, 'Money Starter');
    assert.ok(['under_limit', 'log_today', 'no_impulse', 'no_spend'].includes(s.today.mission.id));
    assert.equal(s.week.length, 7);
    assert.equal(ledger(u.id).length, 0);
});

test('logging expenses earns +5 XP at most 3 times a day; delete and re-create earns nothing', async () => {
    const u = t.db.addUser(RICH);
    const earned = [];
    for (let i = 0; i < 4; i++) {
        const r = await t.request('POST', '/api/expenses', { token: u.token, body: { amount: 50, category: 'Food', description: `Tea ${i}` } });
        assert.equal(r.status, 201);
        earned.push(r.body.xpEarned);
    }
    assert.deepEqual(earned, [5, 5, 5, 0]);

    const ids = (t.db.tables.expenses || []).filter((e) => e.user_id === u.id).map((e) => e.id);
    for (const id of ids) assert.equal((await t.request('DELETE', `/api/expenses/${id}`, { token: u.token })).status, 200);
    const again = await t.request('POST', '/api/expenses', { token: u.token, body: { amount: 50, category: 'Food', description: 'Tea again' } });
    assert.equal(again.body.xpEarned, 0);
    assert.equal(ledger(u.id).filter((l) => l.reason === 'expense_logged').length, 3);
});

test('parallel expense logging cannot beat the daily XP cap', async () => {
    const u = t.db.addUser(RICH);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => t.request('POST', '/api/expenses', { token: u.token, body: { amount: 10, category: 'Food', description: `Snack ${i}` } })));
    const total = results.reduce((s, r) => s + (r.body.xpEarned || 0), 0);
    assert.equal(total, 15);
    assert.equal(ledger(u.id).filter((l) => l.reason === 'expense_logged').length, 3);
});

test('a run of kept days builds the streak, pays daily XP once, and a 7-day milestone once', async () => {
    const u = t.db.addUser({ ...RICH, money_streak_started_on: ms.addDays(today(), -9) });
    for (let i = 9; i >= 0; i--) addExpense(u.id, ms.addDays(today(), -i));
    const first = (await get(u)).body.moneyStreak;
    assert.equal(first.current, 10);
    assert.equal(first.longest, 10);

    const rows = ledger(u.id);
    assert.equal(rows.filter((l) => l.reason === 'daily_mission').length, 9); // ended days; today pays when it ends
    assert.equal(rows.filter((l) => l.reason === 'streak_milestone').length, 1);

    // Duplicate completion: opening again (or in parallel) pays nothing new.
    const before = ledger(u.id).length;
    await Promise.all([get(u), get(u), get(u)]);
    assert.equal(ledger(u.id).length, before);
    assert.equal((await get(u)).body.moneyStreak.xp.total, first.xp.total);
});

test('a missed day restarts the streak', async () => {
    const u = t.db.addUser({ ...RICH, money_streak_started_on: ms.addDays(today(), -6) });
    for (const i of [6, 5, 4, 2, 1, 0]) addExpense(u.id, ms.addDays(today(), -i)); // nothing 3 days ago
    const s = (await get(u)).body.moneyStreak;
    assert.equal(s.current, 3);
    assert.equal(s.longest, 3);
});

test('old days are locked: deleting or back-dating expenses later cannot rewrite them', async () => {
    const u = t.db.addUser({ ...RICH, money_streak_started_on: ms.addDays(today(), -5) });
    const rows = [5, 4, 3, 2, 1, 0].map((i) => addExpense(u.id, ms.addDays(today(), -i)));
    const first = (await get(u)).body.moneyStreak;
    assert.equal(first.current, 6);

    // Remove the expense from 4 days ago (locked) and add one to a locked missed day: no change.
    t.db.tables.expenses = t.db.tables.expenses.filter((e) => e.id !== rows[1].id);
    const second = (await get(u)).body.moneyStreak;
    assert.equal(second.current, 6);
    const locked = (t.db.tables.money_streak_days || []).filter((d) => d.user_id === u.id);
    assert.ok(locked.length >= 4);
    assert.ok(locked.every((d) => d.kept === true));
});

test('yesterday stays open for late logging during its grace day', async () => {
    const u = t.db.addUser({ ...RICH, money_streak_started_on: ms.addDays(today(), -2) });
    addExpense(u.id, ms.addDays(today(), -2));
    const before = (await get(u)).body.moneyStreak;
    assert.equal(before.current, 0); // yesterday empty, today empty
    addExpense(u.id, ms.addDays(today(), -1)); // logged late
    const after = (await get(u)).body.moneyStreak;
    assert.equal(after.current, 2);
});

test('no-spend day: only today, only with nothing logged, once', async () => {
    const u = t.db.addUser(RICH);
    const first = await t.request('POST', '/api/money-streak/no-spend', { token: u.token });
    assert.equal(first.status, 201);
    assert.equal(first.body.dateKey, today());
    const again = await t.request('POST', '/api/money-streak/no-spend', { token: u.token });
    assert.equal(again.body.alreadyDone, true);
    // A date in the body is ignored: past days cannot be marked.
    await t.request('POST', '/api/money-streak/no-spend', { token: u.token, body: { date: ms.addDays(today(), -3) } });
    const marks = (t.db.tables.streak_activities || []).filter((a) => a.user_id === u.id && a.activity === 'no_spend_day');
    assert.deepEqual(marks.map((m) => m.activity_date), [today()]);

    const s = (await get(u)).body.moneyStreak;
    assert.equal(s.today.noSpendMarked, true);

    const spender = t.db.addUser(RICH);
    addExpense(spender.id, today());
    const refused = await t.request('POST', '/api/money-streak/no-spend', { token: spender.token });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.code, 'SPENDING_LOGGED_TODAY');
});

test('XP cannot be set by the client: there is no write route and the ledger is server-only', async () => {
    const u = t.db.addUser(RICH);
    for (const [method, url, body] of [
        ['POST', '/api/money-streak', { xp: 5000 }],
        ['PATCH', '/api/money-streak', { current: 365 }],
        ['POST', '/api/money-streak/xp', { reason: 'daily_mission', ref_key: 'x', xp: 100 }],
    ]) {
        const res = await t.request(method, url, { token: u.token, body });
        assert.equal(res.status, 404, `${method} ${url}`);
    }
    const res = await t.request('POST', '/api/auth/profile', { token: u.token, body: { money_streak_started_on: '2020-01-01' } });
    assert.ok(res.status === 400 || t.db.profile(u.id).money_streak_started_on !== '2020-01-01');
    assert.equal(ledger(u.id).length, 0);
});

test('one user never sees another user\'s streak or XP', async () => {
    const a = t.db.addUser({ ...RICH, money_streak_started_on: ms.addDays(today(), -8) });
    for (let i = 8; i >= 0; i--) addExpense(a.id, ms.addDays(today(), -i));
    const b = t.db.addUser(RICH);
    const aRes = (await get(a)).body.moneyStreak;
    const bRes = (await get(b)).body.moneyStreak;
    assert.ok(aRes.xp.total > 0);
    assert.equal(bRes.xp.total, 0);
    assert.equal(bRes.current, 0);
});

test('a database outage returns a friendly 503', async () => {
    const u = t.db.addUser(RICH);
    t.db.failures.push({ table: 'money_xp_ledger', op: 'select' });
    const res = await get(u);
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'STREAK_UNAVAILABLE');
});
