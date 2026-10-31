/**
 * v1.14 rewards against the real Express app and the in-memory Supabase
 * fake: personalised missions, replacement, check-ins, difficulty, Vittova
 * Points, savings goals, the Rewards screen, the weekly recap, fallbacks and
 * isolation. Days are real IST calendar days relative to today.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startTestApp } = require('./helpers/testApp');
const appTime = require('../lib/appTime');
const ms = require('../lib/moneyStreak');

let t;
test.before(async () => { t = await startTestApp(); });
test.after(async () => { await t.close(); delete process.env.REWARDS_ENABLED; });
test.beforeEach(async () => { await t.resetRateLimits(); t.db.failures.length = 0; delete process.env.REWARDS_ENABLED; });

const today = () => appTime.localDateKey(new Date());
const noonOf = (key) => new Date(ms.dayStart(key).getTime() + 12 * 3600 * 1000).toISOString();
const RICH = { monthly_budget: 3_000_000 };
const uuid = () => crypto.randomUUID();

function addExpense(userId, dateKey, amount = 100, category = 'Food', description = category) {
    const row = { id: uuid(), user_id: userId, amount, category, description, roundup_chillar: 0, source: 'manual', occurred_at: noonOf(dateKey), created_at: new Date().toISOString() };
    t.db.tables.expenses = [...(t.db.tables.expenses || []), row];
    return row;
}
/** A user who has logged ₹100 of Food on each of the last `days` days (not today). */
function steadyUser(days = 10, profile = RICH) {
    const u = t.db.addUser({ ...profile, money_streak_started_on: ms.addDays(today(), -days) });
    for (let i = days; i >= 1; i--) addExpense(u.id, ms.addDays(today(), -i));
    return u;
}
function assign(userId, day, mission, difficulty = 'balanced', params = {}) {
    const row = { user_id: userId, day, mission, difficulty, params, reason: 'Test', source: 'personalised', replacements: 0, previous: [], assigned_at: noonOf(day) };
    t.db.tables.money_daily_missions = [...(t.db.tables.money_daily_missions || []), row];
    return row;
}
const rows = (table, userId) => (t.db.tables[table] || []).filter((r) => r.user_id === userId);
const get = (u) => t.request('GET', '/api/money-streak', { token: u.token });
const post = (u, url, body) => t.request('POST', url, { token: u.token, body });
const balance = (userId) => rows('money_points_ledger', userId).reduce((s, r) => s + r.points, 0);

// ─── Personalised missions ──────────────────────────────────────────────────

test("today's mission is personalised, explained, and given once", async () => {
    const u = steadyUser();
    const results = await Promise.all([get(u), get(u), get(u)]);
    for (const r of results) assert.equal(r.status, 200);
    const mission = results[0].body.moneyStreak.today.mission;
    assert.equal(mission.personalised, true);
    assert.ok(mission.reason.length > 0);
    assert.ok(mission.criteria.length > 0);
    assert.ok(['easy', 'balanced', 'advanced'].includes(mission.difficulty));
    assert.ok(mission.reward.xp > 0 && mission.reward.points > 0);
    assert.equal(mission.deadline, ms.dayStart(ms.addDays(today(), 1)).toISOString());
    assert.equal(rows('money_daily_missions', u.id).filter((r) => r.day === today()).length, 1, 'one mission row for the day');
    for (const r of results) assert.equal(r.body.moneyStreak.today.mission.id, mission.id, 'every load sees the same mission');
    assert.equal((await get(u)).body.moneyStreak.today.mission.id, mission.id);
    assert.equal(results[0].body.moneyStreak.points.note, 'Vittova Points are an in-app reward. They have no cash value.');
});

test('a brand-new user gets the Easy logging mission as a fallback', async () => {
    const u = t.db.addUser(RICH);
    const m = (await get(u)).body.moneyStreak.today.mission;
    assert.equal(m.id, 'log_today');
    assert.equal(m.source, 'fallback');
    assert.equal(m.difficulty, 'easy');
});

test('a kept personalised day pays its XP and Points once, even with parallel loads', async () => {
    const u = steadyUser(4);
    const d2 = ms.addDays(today(), -2);
    const d1 = ms.addDays(today(), -1);
    assign(u.id, d2, 'under_limit', 'balanced', { limit: 5000, share: 0.9 });
    assign(u.id, d1, 'delivery_cap', 'advanced', { cap: 0 });
    await Promise.all([get(u), get(u), get(u)]);
    const xp = rows('money_xp_ledger', u.id).filter((r) => r.reason === 'daily_mission');
    assert.equal(xp.find((r) => r.ref_key === d2).xp, 25);
    assert.equal(xp.find((r) => r.ref_key === d1).xp, 30);
    const pts = rows('money_points_ledger', u.id).filter((r) => r.reason === 'daily_mission');
    assert.deepEqual(Object.fromEntries(pts.map((r) => [r.ref_key, r.points])), { [d2]: 8, [d1]: 12 });
    // Rotation days before v1.14 pay XP but no Points.
    assert.ok(xp.some((r) => r.ref_key === ms.addDays(today(), -3)));
    assert.ok(!pts.some((r) => r.ref_key === ms.addDays(today(), -3)));
    const before = rows('money_points_ledger', u.id).length;
    await get(u);
    assert.equal(rows('money_points_ledger', u.id).length, before, 'loading again pays nothing new');
    assert.equal(rows('money_points_ledger', u.id).filter((r) => r.reason === 'daily_mission').length, 2);
});

test("a missed personalised day pays nothing; today's reward shows as pending", async () => {
    const u = steadyUser(3);
    const d1 = ms.addDays(today(), -1);
    assign(u.id, d1, 'delivery_cap', 'advanced', { cap: 0 });
    addExpense(u.id, d1, 300, 'Food', 'Zomato');
    const s = (await get(u)).body.moneyStreak;
    assert.ok(!rows('money_xp_ledger', u.id).some((r) => r.reason === 'daily_mission' && r.ref_key === d1));
    assert.ok(!rows('money_points_ledger', u.id).some((r) => r.ref_key === d1));
    addExpense(u.id, today(), 50);
    const after = (await get(u)).body.moneyStreak;
    if (after.today.status === 'on_track' || after.today.status === 'done') assert.equal(after.points.pending, after.today.mission.reward.points);
    assert.equal(s.current, 0);
});

test('Points are never paid for awards earned before v1.14', async () => {
    const u = steadyUser(9);
    // The 7-day milestone was already given (5 days ago) by the old backend.
    const startKey = ms.addDays(today(), -9);
    t.db.tables.money_xp_ledger = [...(t.db.tables.money_xp_ledger || []),
        { id: uuid(), user_id: u.id, reason: 'streak_milestone', ref_key: `${startKey}:7`, xp: 100, created_at: new Date(Date.now() - 5 * 86400000).toISOString() }];
    await get(u);
    assert.ok(!rows('money_points_ledger', u.id).some((r) => r.reason === 'streak_milestone'));

    // The same milestone earned now pays Points with its XP.
    const v = steadyUser(9);
    await get(v);
    assert.ok(rows('money_xp_ledger', v.id).some((r) => r.reason === 'streak_milestone'));
    assert.equal(rows('money_points_ledger', v.id).find((r) => r.reason === 'streak_milestone').points, 25);
});

test('before the migration (tables missing): the fixed rotation, no Points, and nothing fails', async () => {
    const u = steadyUser();
    for (const table of ['money_daily_missions', 'money_points_ledger']) t.db.failures.push({ table, missing: true });
    const res = await get(u);
    assert.equal(res.status, 200);
    assert.equal(res.body.moneyStreak.today.mission.personalised, false);
    assert.equal(res.body.moneyStreak.points, null);
    assert.equal(res.body.moneyStreak.missions, null);
    const rewards = await t.request('GET', '/api/rewards', { token: u.token });
    assert.equal(rewards.status, 200);
    assert.equal(rewards.body.rewards.points, null);
    assert.equal(rewards.body.rewards.pointsAvailable, false);
    t.db.failures.push({ table: 'savings_goals', missing: true });
    assert.equal((await t.request('GET', '/api/goals', { token: u.token })).status, 503);
    assert.equal((await post(u, '/api/money-streak/mission/replace', {})).body.code, 'REWARDS_UNAVAILABLE');
});

test('REWARDS_ENABLED=false: the rotation as before, and the new screens are off', async () => {
    process.env.REWARDS_ENABLED = 'false';
    const u = steadyUser();
    const s = (await get(u)).body.moneyStreak;
    assert.equal(s.today.mission.personalised, false);
    assert.equal(s.points, null);
    assert.equal(rows('money_daily_missions', u.id).length, 0);
    for (const url of ['/api/rewards', '/api/goals', '/api/rewards/recap']) {
        const r = await t.request('GET', url, { token: u.token });
        assert.equal(r.status, 404, url);
        assert.equal(r.body.code, 'FEATURE_DISABLED');
    }
    const features = await t.request('GET', '/api/features', { token: u.token });
    assert.equal(features.body.features?.rewardsEnabled ?? features.body.rewardsEnabled, false);
});

// ─── Replace, check in, difficulty ──────────────────────────────────────────

test('a mission can be swapped twice a day, never to something harder', async () => {
    const u = steadyUser();
    const first = (await get(u)).body.moneyStreak.today.mission;
    assert.equal(first.canReplace, true);
    const r1 = await post(u, '/api/money-streak/mission/replace', {});
    assert.equal(r1.status, 200);
    assert.notEqual(r1.body.mission, first.id);
    const second = (await get(u)).body.moneyStreak.today.mission;
    assert.equal(second.source, 'replacement');
    assert.ok(['easy', 'balanced', 'advanced'].indexOf(second.difficulty) <= ['easy', 'balanced', 'advanced'].indexOf(first.difficulty));
    const r2 = await post(u, '/api/money-streak/mission/replace', {});
    assert.equal(r2.status, 200);
    assert.notEqual(r2.body.mission, first.id, 'an earlier mission does not come back');
    const r3 = await post(u, '/api/money-streak/mission/replace', {});
    assert.equal(r3.status, 409);
    assert.equal(r3.body.code, 'REPLACE_LIMIT');
    const row = rows('money_daily_missions', u.id).find((r) => r.day === today());
    assert.equal(row.replacements, 2);
    assert.equal(row.previous.length, 2);
});

test('two swaps at once count as the swaps that actually happened', async () => {
    const u = steadyUser();
    await get(u);
    const results = await Promise.all([post(u, '/api/money-streak/mission/replace', {}), post(u, '/api/money-streak/mission/replace', {})]);
    const ok = results.filter((r) => r.status === 200).length;
    assert.ok(ok >= 1);
    assert.equal(rows('money_daily_missions', u.id).find((r) => r.day === today()).replacements, ok);
    for (const r of results.filter((x) => x.status !== 200)) assert.equal(r.body.code, 'MISSION_CHANGED');
});

test('a finished mission cannot be swapped, and a queued swap from yesterday is refused', async () => {
    const u = t.db.addUser(RICH);
    await get(u); // log_today
    addExpense(u.id, today(), 40);
    const r = await post(u, '/api/money-streak/mission/replace', {});
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'MISSION_SETTLED');
    const old = await post(u, '/api/money-streak/mission/replace', { dateKey: ms.addDays(today(), -1) });
    assert.equal(old.status, 409);
});

test('check-in: only today, only the mission of the day, once per event', async () => {
    const u = steadyUser();
    const tomorrow = ms.addDays(today(), 1);
    t.db.tables.recurring_bills = [...(t.db.tables.recurring_bills || []), { id: uuid(), user_id: u.id, name: 'Wi-Fi', amount: 799, due_day: Number(tomorrow.slice(8, 10)), is_active: true }];
    const m = (await get(u)).body.moneyStreak.today.mission;
    assert.equal(m.id, 'bill_ready');
    assert.equal(m.selfReported, true);
    assert.match(m.reason, /Wi-Fi/);

    const eventId = uuid();
    const stale = await post(u, '/api/money-streak/checkin', { mission: 'bill_ready', eventId, dateKey: ms.addDays(today(), -1) });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, 'DAY_ENDED');
    assert.equal((await post(u, '/api/money-streak/checkin', { mission: 'review_recurring', eventId })).body.code, 'NOT_TODAYS_MISSION');
    assert.equal((await post(u, '/api/money-streak/checkin', { mission: 'under_limit', eventId })).status, 400, 'verified missions cannot be checked in');
    assert.equal((await post(u, '/api/money-streak/checkin', { mission: 'bill_ready', eventId, xp: 500 })).status, 400, 'no extra fields');

    const ok = await post(u, '/api/money-streak/checkin', { mission: 'bill_ready', eventId, dateKey: today() });
    assert.equal(ok.status, 201);
    const replay = await post(u, '/api/money-streak/checkin', { mission: 'bill_ready', eventId });
    assert.equal(replay.body.alreadyDone, true);
    assert.equal(rows('money_mission_checkins', u.id).length, 1);
    const after = (await get(u)).body.moneyStreak.today;
    assert.equal(after.status, 'done');
    assert.equal(after.mission.checkin.done, true);
    assert.equal(after.mission.canReplace, false);
});

test('no-spend from the offline queue: today counts, an ended day is refused', async () => {
    const u = t.db.addUser(RICH);
    const late = await post(u, '/api/money-streak/no-spend', { dateKey: ms.addDays(today(), -1), eventId: uuid() });
    assert.equal(late.status, 409);
    assert.equal(late.body.code, 'DAY_ENDED');
    const ok = await post(u, '/api/money-streak/no-spend', { dateKey: today(), eventId: uuid() });
    assert.equal(ok.status, 201);
    const again = await post(u, '/api/money-streak/no-spend', { dateKey: today(), eventId: uuid() });
    assert.equal(again.body.alreadyDone, true);
});

test('difficulty: chosen by the user; easier applies today, harder only from tomorrow', async () => {
    const u = steadyUser();
    assign(u.id, today(), 'under_limit', 'balanced', { limit: 90000, share: 0.9 });
    assert.equal((await t.request('PUT', '/api/money-streak/preferences', { token: u.token, body: { difficulty: 'extreme' } })).status, 400);
    assert.equal((await t.request('PUT', '/api/money-streak/preferences', { token: u.token, body: { difficulty: 'easy', xp: 1 } })).status, 400);

    const easier = await t.request('PUT', '/api/money-streak/preferences', { token: u.token, body: { difficulty: 'easy' } });
    assert.equal(easier.status, 200);
    assert.equal(easier.body.appliesFrom, 'today');
    const row = rows('money_daily_missions', u.id).find((r) => r.day === today());
    assert.equal(row.difficulty, 'easy');
    assert.equal(row.params.share, 1);

    const harder = await t.request('PUT', '/api/money-streak/preferences', { token: u.token, body: { difficulty: 'advanced' } });
    assert.equal(harder.body.appliesFrom, 'tomorrow');
    assert.equal(rows('money_daily_missions', u.id).find((r) => r.day === today()).difficulty, 'easy', 'never harder after the day started');
    assert.equal(t.db.profile(u.id).mission_difficulty, 'advanced');
    assert.equal((await get(u)).body.moneyStreak.missions.preference, 'advanced');
});

test('a goal step mission is set by a stale goal and done by adding to it', async () => {
    const u = steadyUser();
    const goalId = uuid();
    t.db.tables.savings_goals = [...(t.db.tables.savings_goals || []), { id: goalId, user_id: u.id, name: 'Trip', kind: 'travel', target_inr: 6000, reward_target_inr: 6000, target_date: ms.addDays(today(), 60), status: 'active', created_at: noonOf(ms.addDays(today(), -20)) }];
    const m = (await get(u)).body.moneyStreak.today.mission;
    assert.equal(m.id, 'goal_step');
    assert.equal(m.selfReported, true);
    assert.equal(m.action.route, '/goals');
    const step = rows('money_daily_missions', u.id).find((r) => r.day === today()).params.step;
    const add = await post(u, `/api/goals/${goalId}/contributions`, { amountInr: step, clientRef: uuid() });
    assert.equal(add.status, 201);
    assert.equal((await get(u)).body.moneyStreak.today.status, 'done');
});

// ─── Goals ──────────────────────────────────────────────────────────────────

const inDays = (n) => ms.addDays(today(), n);
const createGoal = (u, body = {}) => post(u, '/api/goals', { name: 'Laptop', kind: 'laptop', targetInr: 40000, targetDate: inDays(180), ...body });

test('goals: validated input, and the client never sets progress or rewards', async () => {
    const u = t.db.addUser(RICH);
    for (const bad of [{ name: '' }, { targetInr: 50 }, { targetDate: inDays(0) }, { targetDate: inDays(365 * 11) }, { savedInr: 40000 }, { status: 'completed' }, { kind: 'car' }]) {
        const r = await createGoal(u, bad);
        assert.equal(r.status, 400, JSON.stringify(bad));
    }
    const ok = await createGoal(u, { note: 'For college', planMonthlyInr: 5000 });
    assert.equal(ok.status, 201);
    const g = ok.body.goals.find((x) => x.id === ok.body.goalId);
    assert.equal(g.savedInr, 0);
    assert.equal(g.status, 'active');
    assert.equal(g.progressKind, 'self_reported');
    assert.equal(g.planMonthlyInr, 5000);
    assert.ok(g.suggested.monthlyInr > 0);
    assert.match(ok.body.note, /can't see your bank balance/);
    // "Goal set" is paid once: 10 XP and 2 Points.
    assert.equal(rows('money_xp_ledger', u.id).filter((r) => r.reason === 'goal_milestone').length, 1);
    assert.equal(balance(u.id), 2);
});

test('contributions: stored once per client reference, even sent in parallel', async () => {
    const u = t.db.addUser(RICH);
    const goalId = (await createGoal(u)).body.goalId;
    const clientRef = uuid();
    const results = await Promise.all([1, 2, 3].map(() => post(u, `/api/goals/${goalId}/contributions`, { amountInr: 10000, clientRef })));
    for (const r of results) assert.ok([200, 201].includes(r.status), String(r.status));
    assert.equal(rows('savings_contributions', u.id).length, 1);
    const g = results[0].body.goals.find((x) => x.id === goalId);
    assert.ok([0, 10000].includes(g.savedInr));
    const list = await t.request('GET', '/api/goals', { token: u.token });
    assert.equal(list.body.goals[0].savedInr, 10000);
    // 25% is paid once.
    assert.equal(rows('money_xp_ledger', u.id).filter((r) => r.ref_key === `${goalId}:25`).length, 1);
    assert.equal(rows('money_points_ledger', u.id).filter((r) => r.ref_key === `${goalId}:25`).length, 1);
    for (const bad of [{ amountInr: 0, clientRef: uuid() }, { amountInr: 100 }, { amountInr: 100, clientRef: uuid(), contributedOn: inDays(1) }, { amountInr: 100, clientRef: uuid(), source: 'bank' }]) {
        assert.equal((await post(u, `/api/goals/${goalId}/contributions`, bad)).status, 400, JSON.stringify(bad));
    }
});

test('milestones pay once each; 100% waits a week; a correction reverses Points and is not paid again', async () => {
    const u = t.db.addUser(RICH);
    const goalId = (await createGoal(u)).body.goalId;
    const add = (amountInr) => post(u, `/api/goals/${goalId}/contributions`, { amountInr, clientRef: uuid() });
    const big = await add(40000);
    assert.equal(big.status, 201);
    assert.deepEqual(big.body.rewardsPaid.map((p) => p.pct).sort((a, b) => a - b), [25, 50, 75]);
    const g = big.body.goals.find((x) => x.id === goalId);
    assert.equal(g.status, 'completed');
    assert.equal(g.rewards.completionWaitDays, 7);
    assert.ok(!rows('money_xp_ledger', u.id).some((r) => r.ref_key === `${goalId}:100`));

    // A week later the completion reward is paid, once.
    t.db.tables.savings_goals.find((x) => x.id === goalId).created_at = noonOf(inDays(-8));
    await t.request('GET', '/api/goals', { token: u.token });
    await t.request('GET', '/api/goals', { token: u.token });
    assert.equal(rows('money_xp_ledger', u.id).filter((r) => r.ref_key === `${goalId}:100`).length, 1);
    assert.equal(balance(u.id), 2 + 5 + 5 + 5 + 20);
    const badges = rows('user_badges', u.id).map((b) => b.badge).sort();
    assert.deepEqual(badges, ['first_goal', 'goal_reached']);

    // The ₹40,000 was a typo: removing it reverses the 25/50/75/100 Points once.
    const contributionId = rows('savings_contributions', u.id)[0].id;
    const del = await t.request('DELETE', `/api/goals/${goalId}/contributions/${contributionId}`, { token: u.token });
    assert.equal(del.status, 200);
    assert.deepEqual(del.body.reversed.map((r) => r.pct).sort((a, b) => a - b), [25, 50, 75, 100]);
    assert.equal(del.body.goals.find((x) => x.id === goalId).status, 'active');
    assert.equal(balance(u.id), 2);
    assert.ok(balance(u.id) >= 0);

    // Reached again with real money: no second payment.
    await add(12000);
    assert.equal(rows('money_xp_ledger', u.id).filter((r) => r.ref_key === `${goalId}:25`).length, 1);
    assert.equal(balance(u.id), 2);
    const history = (await t.request('GET', '/api/rewards', { token: u.token })).body.rewards.history.events;
    assert.ok(history.some((e) => e.reason === 'reversal' && e.points < 0));
    assert.ok(history.some((e) => e.id === `goal_milestone|${goalId}:50` && e.status === 'reversed'));
});

test('lowering a target cannot pay milestones early; the 4th goal of a month earns none', async () => {
    const u = t.db.addUser(RICH);
    const goalId = (await createGoal(u, { targetInr: 40000 })).body.goalId;
    await post(u, `/api/goals/${goalId}/contributions`, { amountInr: 10000, clientRef: uuid() });
    const edit = await t.request('PATCH', `/api/goals/${goalId}`, { token: u.token, body: { targetInr: 10000 } });
    assert.equal(edit.status, 200);
    assert.ok(!rows('money_xp_ledger', u.id).some((r) => r.ref_key === `${goalId}:50` || r.ref_key === `${goalId}:75`));

    await createGoal(u, { name: 'Two' });
    await createGoal(u, { name: 'Three' });
    const fourth = await createGoal(u, { name: 'Four' });
    const g4 = fourth.body.goals.find((x) => x.id === fourth.body.goalId);
    assert.equal(g4.rewards.eligible, false);
    assert.match(g4.rewards.why, /first 3 goals/);
    assert.ok(!rows('money_xp_ledger', u.id).some((r) => r.ref_key === `${fourth.body.goalId}:0`));
    const small = await createGoal(u, { name: 'Snacks', targetInr: 500 });
    assert.equal(small.body.goals.find((x) => x.id === small.body.goalId).rewards.eligible, false);
});

test('goals: archive and restore, at most 10 active', async () => {
    const u = t.db.addUser(RICH);
    const ids = [];
    for (let i = 0; i < 10; i++) ids.push((await createGoal(u, { name: `Goal ${i}`, targetInr: 500 })).body.goalId);
    const eleventh = await createGoal(u, { name: 'One too many' });
    assert.equal(eleventh.status, 409);
    assert.equal(eleventh.body.code, 'GOAL_LIMIT');
    const arch = await post(u, `/api/goals/${ids[0]}/archive`, {});
    assert.equal(arch.status, 200);
    assert.ok(arch.body.archived.some((g) => g.id === ids[0]));
    assert.equal((await post(u, `/api/goals/${ids[0]}/contributions`, { amountInr: 10, clientRef: uuid() })).body.code, 'GOAL_ARCHIVED');
    assert.equal((await t.request('PATCH', `/api/goals/${ids[0]}`, { token: u.token, body: { name: 'x' } })).body.code, 'GOAL_ARCHIVED');
    assert.equal((await createGoal(u, { name: 'Now fits' })).status, 201);
    assert.equal((await post(u, `/api/goals/${ids[0]}/restore`, {})).body.code, 'GOAL_LIMIT');
});

test("one user never sees or changes another user's goals, missions or Points", async () => {
    const a = t.db.addUser(RICH);
    const b = t.db.addUser(RICH);
    const goalId = (await createGoal(a)).body.goalId;
    await post(a, `/api/goals/${goalId}/contributions`, { amountInr: 10000, clientRef: uuid() });
    const contributionId = rows('savings_contributions', a.id)[0].id;

    const bGoals = await t.request('GET', '/api/goals', { token: b.token });
    assert.deepEqual(bGoals.body.goals, []);
    assert.equal((await t.request('PATCH', `/api/goals/${goalId}`, { token: b.token, body: { targetInr: 100 } })).status, 404);
    assert.equal((await post(b, `/api/goals/${goalId}/contributions`, { amountInr: 5, clientRef: uuid() })).status, 404);
    assert.equal((await post(b, `/api/goals/${goalId}/archive`, {})).status, 404);
    assert.equal((await t.request('DELETE', `/api/goals/${goalId}/contributions/${contributionId}`, { token: b.token })).status, 404);
    assert.equal(rows('savings_contributions', a.id).length, 1);

    const bRewards = (await t.request('GET', '/api/rewards', { token: b.token })).body.rewards;
    assert.equal(bRewards.points.balance, 0);
    assert.equal(bRewards.history.events.length, 0);
    // A client reference already used by someone else is just a new entry for this user.
    const ref = rows('savings_contributions', a.id)[0].client_ref;
    const bGoal = (await createGoal(b)).body.goalId;
    assert.equal((await post(b, `/api/goals/${bGoal}/contributions`, { amountInr: 100, clientRef: ref })).status, 201);
});

// ─── Rewards screen and recap ───────────────────────────────────────────────

test('Rewards: seven levels, Points, achievements with requirements, and a level-6 badge from XP', async () => {
    const u = t.db.addUser(RICH);
    t.db.tables.money_xp_ledger = [...(t.db.tables.money_xp_ledger || []),
        ...Array.from({ length: 70 }, (_, i) => ({ id: uuid(), user_id: u.id, reason: 'daily_mission', ref_key: `2025-01-${String(i).padStart(2, '0')}`, xp: 100, created_at: new Date(Date.now() - 400 * 86400000).toISOString() }))];
    const r = (await t.request('GET', '/api/rewards', { token: u.token })).body.rewards;
    assert.equal(r.level.level, 6);
    assert.equal(r.level.levelName, 'Money Champion');
    assert.equal(r.level.levels.length, 7);
    assert.deepEqual(r.level.levels.map((l) => l.reached), [true, true, true, true, true, true, false]);
    assert.deepEqual(r.level.nextLevel, { level: 7, name: 'Money Legend', at: 12000, xpToGo: 5000 });
    const level6 = r.achievements.find((b) => b.key === 'level_6');
    assert.equal(level6.earned, true);
    assert.equal(r.achievements.find((b) => b.key === 'level_7').earned, false);
    for (const b of r.achievements) assert.ok(b.requirement && b.title, b.key);
    assert.equal(r.recentAchievement.key, 'level_6');
    assert.deepEqual(rows('user_badges', u.id).map((b) => b.badge), ['level_6']);
    assert.ok(r.points && r.points.balance === 0);
    assert.match(r.points.note, /no cash value/);
});

test('Rewards history: XP and Points in one list, paged', async () => {
    const u = steadyUser(4);
    assign(u.id, ms.addDays(today(), -2), 'under_limit', 'easy', { limit: 9000, share: 1 });
    await get(u);
    await createGoal(u);
    const first = (await t.request('GET', '/api/rewards', { token: u.token })).body.rewards;
    const mission = first.history.events.find((e) => e.reason === 'daily_mission' && e.ref === ms.addDays(today(), -2));
    assert.equal(mission.xp, 20);
    assert.equal(mission.points, 5);
    assert.equal(mission.status, 'confirmed');
    assert.match(mission.detail, /Stay under/);
    assert.ok(first.history.events.some((e) => e.reason === 'goal_milestone' && e.title === 'Goal set'));
    assert.ok(first.missions.days.some((d) => d.status === 'active' && d.day === today()));
    const page = await t.request('GET', `/api/rewards/history?limit=1&before=${encodeURIComponent(new Date(Date.now() + 60000).toISOString())}`, { token: u.token });
    assert.equal(page.status, 200);
    assert.equal(page.body.events.length, 1);
    assert.ok(page.body.next);
});

test('there is no way for the client to write XP or Points', async () => {
    const u = t.db.addUser(RICH);
    for (const [method, url] of [['POST', '/api/rewards'], ['POST', '/api/rewards/points'], ['PUT', '/api/rewards'], ['POST', '/api/rewards/history'], ['PATCH', '/api/goals'], ['DELETE', '/api/goals']]) {
        const r = await t.request(method, url, { token: u.token, body: { points: 1000, xp: 1000 } });
        assert.equal(r.status, 404, `${method} ${url}`);
    }
    assert.equal(rows('money_points_ledger', u.id).length, 0);
});

test('weekly recap: last full week by default, validated, and a share card without amounts', async () => {
    const u = steadyUser(14);
    addExpense(u.id, ms.addDays(ms.weekStart(today()), -3), 2500, 'Shopping', 'Myntra');
    const r = await t.request('GET', '/api/rewards/recap', { token: u.token });
    assert.equal(r.status, 200);
    const recap = r.body.recap;
    assert.equal(recap.week.start, ms.addDays(ms.weekStart(today()), -7));
    assert.equal(recap.week.complete, true);
    assert.ok(recap.focus.title);
    assert.doesNotMatch(JSON.stringify(recap.share), /₹|Myntra|Shopping/);
    assert.equal((await t.request('GET', '/api/rewards/recap?week=next-week', { token: u.token })).status, 400);
    assert.equal((await t.request('GET', `/api/rewards/recap?week=${ms.addDays(today(), 14)}`, { token: u.token })).status, 400);
    const current = await t.request('GET', '/api/rewards/recap?week=current', { token: u.token });
    assert.equal(current.body.recap.week.complete, false);
    assert.equal(current.body.recap.nextWeek, null);
});

test('deleting the account removes missions, check-ins, Points, goals and contributions', async () => {
    const u = steadyUser();
    await get(u);
    const goalId = (await createGoal(u)).body.goalId;
    await post(u, `/api/goals/${goalId}/contributions`, { amountInr: 500, clientRef: uuid() });
    assert.ok(rows('money_points_ledger', u.id).length > 0);
    const res = await t.request('DELETE', '/api/account', { token: u.token, body: { confirmation: 'DELETE_MY_ACCOUNT' } });
    assert.equal(res.status, 200);
    for (const table of ['money_daily_missions', 'money_mission_checkins', 'money_points_ledger', 'savings_goals', 'savings_contributions']) {
        assert.equal(rows(table, u.id).length, 0, table);
    }
});

test('Rewards, goals and missions require sign-in', async () => {
    for (const [method, url] of [['GET', '/api/rewards'], ['GET', '/api/rewards/recap'], ['GET', '/api/goals'], ['POST', '/api/goals'], ['POST', '/api/money-streak/checkin'], ['POST', '/api/money-streak/mission/replace'], ['PUT', '/api/money-streak/preferences']]) {
        assert.equal((await t.request(method, url, { body: method === 'GET' ? undefined : {} })).status, 401, `${method} ${url}`);
    }
});
