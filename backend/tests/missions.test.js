/**
 * The personalised mission engine (lib/missions.js): which mission, why, at
 * what difficulty, judged how, paying what. Pure functions, fixed dates.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const ms = require('../lib/moneyStreak');
const m = require('../lib/missions');

const TODAY = '2026-10-15';
const at = (key, hh = '13:00') => new Date(`${key}T${hh}:00+05:30`).toISOString();
const exp = (daysAgo, amount, category = 'Food', description = category, hh = '13:00') => ({ amount, category, description, occurred_at: at(ms.addDays(TODAY, -daysAgo), hh) });
/** A steady logger: one ₹150 Food expense on each of the last n days. */
const steady = (n = 20) => Array.from({ length: n }, (_, i) => exp(i + 1, 150));
const signals = (over = {}) => m.buildSignals({ today: TODAY, expenses: steady(), dailyLimit: 600, ...over });

test('new users get the logging mission as a fallback, at Easy', () => {
    const s = m.buildSignals({ today: TODAY, expenses: [exp(1, 100)], dailyLimit: 600 });
    const c = m.choose({ signals: s, difficulty: 'advanced' });
    assert.equal(c.mission, 'log_today');
    assert.equal(c.difficulty, 'easy');
    assert.equal(c.source, 'fallback');
    assert.match(c.reason, /getting started/);
});

test('the same records on the same day always give the same mission', () => {
    const s = signals({ expenses: [...steady(), ...[1, 3, 5, 6].map((d) => exp(d, 350, 'Food', 'Swiggy order'))] });
    const a = m.choose({ signals: s, difficulty: 'balanced' });
    const b = m.choose({ signals: m.buildSignals({ today: TODAY, expenses: [...steady(), ...[1, 3, 5, 6].map((d) => exp(d, 350, 'Food', 'Swiggy order'))], dailyLimit: 600 }), difficulty: 'balanced' });
    assert.deepEqual(a, b);
});

test('a bill due soon comes first, with the bill named in the reason', () => {
    const s = signals({ bills: [{ name: 'Wi-Fi', amount: 799, due_day: 16, is_active: true }] });
    const c = m.choose({ signals: s, difficulty: 'balanced' });
    assert.equal(c.mission, 'bill_ready');
    assert.equal(c.difficulty, 'easy'); // a check-in has one level
    assert.match(c.reason, /Wi-Fi \(₹799\) is due tomorrow/);
    assert.deepEqual(c.params, { bill: 'Wi-Fi', amount: 799, dueOn: '2026-10-16', inDays: 1 });
    // An inactive bill or one far away does not count.
    assert.notEqual(m.choose({ signals: signals({ bills: [{ name: 'Gym', amount: 500, due_day: 16, is_active: false }, { name: 'Rent', amount: 8000, due_day: 1 }] }), difficulty: 'easy' }).mission, 'bill_ready');
});

test('rising food delivery gives a delivery cap that tightens with difficulty', () => {
    const expenses = [...steady(), ...[1, 2, 4, 6].map((d) => exp(d, 400, 'Food', 'Zomato'))];
    const s = signals({ expenses });
    const easy = m.choose({ signals: s, difficulty: 'easy' });
    const balanced = m.choose({ signals: s, difficulty: 'balanced' });
    const advanced = m.choose({ signals: s, difficulty: 'advanced' });
    assert.deepEqual([easy.mission, balanced.mission, advanced.mission], ['delivery_cap', 'delivery_cap', 'delivery_cap']);
    assert.match(easy.reason, /4 food-delivery orders/);
    assert.ok(easy.params.cap > balanced.params.cap && balanced.params.cap > advanced.params.cap);
    assert.equal(advanced.params.cap, 0);
    assert.equal(easy.params.cap, 400); // about one usual order
});

test('rising impulse spending gives the no-impulse mission', () => {
    const expenses = [...steady(), exp(2, 900, 'Shopping'), exp(3, 400, 'Entertainment'), exp(10, 200, 'Shopping')];
    const c = m.choose({ signals: signals({ expenses }), difficulty: 'balanced' });
    assert.equal(c.mission, 'no_impulse');
    assert.match(c.reason, /from ₹200 to ₹1,300/);
    assert.deepEqual(c.params, { allowance: 0, noDelivery: false });
    assert.deepEqual(m.paramsFor('no_impulse', 'easy', signals()), { allowance: 300, noDelivery: false });
    assert.deepEqual(m.paramsFor('no_impulse', 'advanced', signals()), { allowance: 0, noDelivery: true });
});

test('a goal nobody has added to in a week gives a goal step', () => {
    const goal = { id: 'g1', name: 'Laptop', status: 'active', target_inr: 30000, target_date: '2027-04-15', created_at: at('2026-09-01') };
    const s = signals({ goals: [goal], contributions: [{ goal_id: 'g1', amount_inr: 1000, contributed_on: '2026-09-20', created_at: at('2026-09-20') }] });
    const c = m.choose({ signals: s, difficulty: 'balanced' });
    assert.equal(c.mission, 'goal_step');
    assert.match(c.reason, /Nothing added to "Laptop" for 25 days/);
    assert.equal(c.params.goalId, 'g1');
    assert.ok(c.params.step >= 50);
    // A goal added to yesterday is not stale.
    const fresh = signals({ goals: [goal], contributions: [{ goal_id: 'g1', amount_inr: 100, contributed_on: '2026-10-14', created_at: at('2026-10-14') }] });
    assert.notEqual(m.choose({ signals: fresh, difficulty: 'balanced' }).mission, 'goal_step');
});

test('otherwise: stay under today\'s Safe-to-Spend, at a share set by difficulty', () => {
    const s = signals();
    const byLevel = Object.fromEntries(m.DIFFICULTY_KEYS.map((d) => [d, m.choose({ signals: s, difficulty: d })]));
    for (const d of m.DIFFICULTY_KEYS) assert.equal(byLevel[d].mission, 'under_limit');
    assert.deepEqual(m.DIFFICULTY_KEYS.map((d) => byLevel[d].params.limit), [600, 540, 480]);
    assert.match(byLevel.easy.reason, /Today's limit is ₹600: your Safe-to-Spend as the day began/);
    assert.match(m.describe(byLevel.balanced).detail, /fixed for the day \(the Safe-to-Spend on Home updates as you spend\)/);
});

test('no budget set: no spending target from the fallback budget', () => {
    const s = signals({ budgetSet: false });
    const list = m.candidates(s, 'advanced').map((c) => c.mission);
    assert.ok(!list.includes('under_limit'));
    const c = m.choose({ signals: s, difficulty: 'balanced' });
    assert.equal(c.mission, 'log_today');
    assert.match(c.reason, /Set a monthly budget/);
});

test('when this month\'s Safe-to-Spend is used up: Easy, and never a no-spend demand', () => {
    const s = signals({ dailyLimit: 0 });
    assert.equal(s.stretched, true);
    assert.equal(m.resolveDifficulty({ preference: 'advanced', stretched: true }).difficulty, 'easy');
    const list = m.candidates(s, 'advanced').map((c) => c.mission);
    assert.ok(!list.includes('no_spend'));
    assert.ok(!list.includes('under_limit'));
    assert.equal(m.choose({ signals: s, difficulty: 'easy' }).mission, 'log_today');
});

test('the same mission is not given three days running when there is another', () => {
    const s = signals();
    assert.equal(m.choose({ signals: s, difficulty: 'balanced', recent: ['under_limit', 'log_today'] }).mission, 'under_limit');
    assert.notEqual(m.choose({ signals: s, difficulty: 'balanced', recent: ['under_limit', 'under_limit'] }).mission, 'under_limit');
});

test('difficulty: the user\'s choice, or adapting one step at a time from the last week', () => {
    const days = (kept, n, difficulty = 'balanced') => Array.from({ length: n }, (_, i) => ({ difficulty, kept: i < kept }));
    assert.equal(m.resolveDifficulty({ preference: 'balanced' }).difficulty, 'balanced');
    assert.equal(m.resolveDifficulty({ preference: 'auto', history: days(4, 4) }).difficulty, 'easy', 'too little history');
    assert.equal(m.resolveDifficulty({ preference: 'auto', history: days(6, 7, 'easy') }).difficulty, 'balanced');
    assert.equal(m.resolveDifficulty({ preference: 'auto', history: days(7, 7, 'balanced') }).difficulty, 'advanced');
    assert.equal(m.resolveDifficulty({ preference: 'auto', history: days(7, 7, 'advanced') }).difficulty, 'advanced');
    assert.equal(m.resolveDifficulty({ preference: 'auto', history: days(2, 7, 'advanced') }).difficulty, 'balanced');
    assert.equal(m.resolveDifficulty({ preference: 'auto', history: days(4, 7, 'balanced') }).difficulty, 'balanced');
    assert.equal(m.resolveDifficulty({ preference: 'nonsense', history: [] }).difficulty, 'easy');
});

test('difficulty is never about income: two budgets, same habits, same mission and level', () => {
    const habits = steady();
    const modest = m.buildSignals({ today: TODAY, expenses: habits, dailyLimit: 300 });
    const rich = m.buildSignals({ today: TODAY, expenses: habits, dailyLimit: 30000 });
    const history = Array.from({ length: 7 }, () => ({ difficulty: 'balanced', kept: true }));
    const dm = m.resolveDifficulty({ preference: 'auto', history, stretched: modest.stretched });
    const dr = m.resolveDifficulty({ preference: 'auto', history, stretched: rich.stretched });
    assert.equal(dm.difficulty, dr.difficulty);
    const a = m.choose({ signals: modest, difficulty: dm.difficulty });
    const b = m.choose({ signals: rich, difficulty: dr.difficulty });
    assert.equal(a.mission, b.mission);
    assert.equal(a.difficulty, b.difficulty);
    assert.deepEqual(m.rewardFor(a.mission, a.difficulty), m.rewardFor(b.mission, b.difficulty));
});

// ─── Judging ────────────────────────────────────────────────────────────────

const facts = (rows, extra = {}) => m.dayFacts({ dateKey: TODAY, expenses: rows.map(([amount, category, description = category]) => ({ amount, category, description, occurred_at: at(TODAY) })), ...extra });

test('a spending target never counts rent or recharges, and needs the day logged', () => {
    const a = { mission: 'under_limit', params: { limit: 500 } };
    assert.deepEqual(m.judge(a, facts([])).status, 'to_do');
    assert.equal(m.judge(a, facts([[9000, 'Rent'], [299, 'Recharge'], [450, 'Food']])).kept, true);
    const over = m.judge(a, facts([[600, 'Food']]));
    assert.equal(over.kept, false);
    assert.equal(over.status, 'missed');
    assert.deepEqual(over.progress, { current: 600, target: 500, unit: 'inr' });
    // A no-spend day counts as showing up.
    assert.equal(m.judge(a, m.dayFacts({ dateKey: TODAY, expenses: [], noSpendDays: new Set([TODAY]) })).kept, true);
});

test('impulse and delivery missions judge only their own spending', () => {
    assert.equal(m.judge({ mission: 'no_impulse', params: { allowance: 300 } }, facts([[250, 'Shopping'], [800, 'Food']])).kept, true);
    assert.equal(m.judge({ mission: 'no_impulse', params: { allowance: 0 } }, facts([[1, 'Entertainment']])).kept, false);
    assert.equal(m.judge({ mission: 'no_impulse', params: { allowance: 0, noDelivery: true } }, facts([[300, 'Food', 'Swiggy']])).kept, false);
    assert.equal(m.judge({ mission: 'delivery_cap', params: { cap: 0 } }, facts([[700, 'Food', 'Big Basket groceries']])).kept, true, 'groceries are fine');
    assert.equal(m.judge({ mission: 'delivery_cap', params: { cap: 0 } }, facts([[200, 'Food', 'Swiggy Instamart']])).kept, true, 'Instamart is groceries');
    assert.equal(m.judge({ mission: 'delivery_cap', params: { cap: 300 } }, facts([[350, 'Food', 'Zomato']])).kept, false);
});

test('self-reported missions: check-ins and contributions made today', () => {
    assert.equal(m.judge({ mission: 'bill_ready', params: {} }, facts([], { checkins: [{ day: TODAY, mission: 'bill_ready' }] })).kept, true);
    assert.equal(m.judge({ mission: 'bill_ready', params: {} }, facts([], { checkins: [{ day: '2026-10-14', mission: 'bill_ready' }] })).kept, false);
    const step = { mission: 'goal_step', params: { goalId: 'g1', step: 200 } };
    const added = (amount, on, created) => [{ goal_id: 'g1', amount_inr: amount, contributed_on: on, created_at: at(created) }];
    assert.equal(m.judge(step, facts([], { contributions: added(200, TODAY, TODAY) })).kept, true);
    assert.equal(m.judge(step, facts([], { contributions: added(150, TODAY, TODAY) })).kept, false);
    // Back-dated entries made today, or today-dated entries made earlier, do not count.
    assert.equal(m.judge(step, facts([], { contributions: added(500, '2026-10-10', TODAY) })).kept, false);
});

// ─── Replacement ────────────────────────────────────────────────────────────

test('a replacement is new today, still open, and never harder than the day', () => {
    const s = signals({ expenses: [...steady(), ...[1, 2, 4, 6].map((d) => exp(d, 400, 'Food', 'Zomato'))] });
    const next = m.replacement({ signals: s, difficulty: 'balanced', exclude: ['delivery_cap'], todayStatusOf: () => 'to_do' });
    assert.ok(next && next.mission !== 'delivery_cap');
    assert.equal(next.source, 'replacement');
    assert.ok(m.DIFFICULTY_KEYS.indexOf(next.difficulty) <= m.DIFFICULTY_KEYS.indexOf('balanced'));
    // Missions already broken or already done today are skipped.
    const skip = m.replacement({ signals: s, difficulty: 'balanced', exclude: ['delivery_cap'], todayStatusOf: ({ mission }) => (mission === 'under_limit' ? 'missed' : mission === 'no_impulse' ? 'done' : 'to_do') });
    assert.ok(!['under_limit', 'no_impulse', 'delivery_cap'].includes(skip.mission));
    // No-spend is only ever offered at Advanced.
    const easyList = m.candidates(s, 'easy').map((c) => c.mission);
    assert.ok(!easyList.includes('no_spend'));
    assert.ok(m.candidates(s, 'advanced').some((c) => c.mission === 'no_spend'));
});

// ─── Rewards and wording ────────────────────────────────────────────────────

test('rewards: harder pays more; self-reported pays least; points match the table', () => {
    const r = (mission, d) => m.rewardFor(mission, d);
    assert.ok(r('under_limit', 'advanced').xp > r('under_limit', 'balanced').xp);
    assert.ok(r('under_limit', 'balanced').xp > r('under_limit', 'easy').xp - 1);
    assert.ok(r('bill_ready', 'easy').xp < r('log_today', 'easy').xp);
    assert.ok(r('goal_step', 'advanced').points < r('under_limit', 'easy').points);
    for (const d of m.DIFFICULTY_KEYS) assert.ok(r('under_limit', d).xp <= 100, 'within the XP ledger limit');
    assert.equal(m.pointsFor({ reason: 'challenge_completed', xp: 75 }), 15);
    assert.equal(m.pointsFor({ reason: 'weekly_goal', xp: 50 }), 15);
    assert.equal(m.pointsFor({ reason: 'expense_logged', xp: 5 }), 0);
    assert.equal(m.pointsFor({ reason: 'daily_mission', xp: 20, points: 0 }), 0, 'a rotation day pays no Points');
});

test('no mission asks anyone to buy, borrow, invest or skip essentials', () => {
    const s = signals({
        bills: [{ name: 'Wi-Fi', amount: 799, due_day: 15 }, { name: 'OTT', amount: 199, due_day: 20 }],
        goals: [{ id: 'g1', name: 'Trip', status: 'active', target_inr: 5000, target_date: '2027-01-01', created_at: at('2026-09-01') }],
        expenses: [...steady(), exp(1, 400, 'Food', 'Swiggy'), exp(2, 400, 'Food', 'Swiggy'), exp(3, 400, 'Food', 'Swiggy')],
    });
    for (const mission of m.MISSION_KEYS) {
        for (const d of m.CATALOG[mission].levels) {
            let params;
            try { params = m.paramsFor(mission, d, s); } catch { continue; }
            const words = m.describe({ mission, difficulty: d, params });
            const text = [words.title, words.detail, ...words.criteria].join(' ');
            assert.doesNotMatch(text, /\b(buy|borrow|loan|credit card|EMI|invest|crypto|bet|lottery)\b/i, `${mission}/${d}: ${text}`);
            assert.ok(words.title.length > 0 && words.criteria.length > 0, `${mission}/${d}`);
        }
    }
});

test('every mission kind is a value the database accepts', () => {
    assert.deepEqual([...m.MISSION_KEYS].sort(), ['bill_ready', 'delivery_cap', 'goal_step', 'log_today', 'no_impulse', 'no_spend', 'review_recurring', 'under_limit']);
    assert.deepEqual(m.CHECKIN_MISSIONS.sort(), ['bill_ready', 'review_recurring']);
    assert.deepEqual(m.PREFERENCE_KEYS, ['auto', 'easy', 'balanced', 'advanced']);
});
