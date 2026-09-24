/**
 * Sponsored challenge rules: judged from the user's own records, on IST days,
 * starting the day after joining, once after a grace day.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, eligibility, describe, windowFor, FOOD_DELIVERY } = require('../lib/challengeRules');

const ist = (s) => {
    const [d, tm = '12:00'] = s.split(' ');
    const [Y, M, D] = d.split('-').map(Number);
    const [h, m] = tm.split(':').map(Number);
    return new Date(Date.UTC(Y, M - 1, D, h, m) - 5.5 * 3600 * 1000);
};
const exp = (date, amount, category = 'Food', description = category) => ({ amount, category, description, occurred_at: ist(date.includes(' ') ? date : `${date} 13:00`).toISOString() });
const JOINED = ist('2026-09-07 20:00').toISOString(); // Monday evening → runs Tue 8 to Mon 14
const daily = (from, to, amount = 150, category = 'Food', description = 'Lunch') => {
    const out = [];
    for (let d = from; d <= to; d++) out.push(exp(`2026-09-${String(d).padStart(2, '0')}`, amount, category, description));
    return out;
};
const run = (o) => evaluate({ days: 7, enrolledAt: JOINED, noSpendDays: new Set(), ...o });

test('the challenge starts the day after joining and is judged after a grace day', () => {
    assert.deepEqual(windowFor(JOINED, 7), { startsOn: '2026-09-08', endsOn: '2026-09-14' });
    const r = run({ type: 'no_food_delivery', expenses: daily(8, 14), now: ist('2026-09-07 21:00') });
    assert.equal(r.status, 'upcoming');
    assert.equal(run({ type: 'no_food_delivery', expenses: daily(8, 14), now: ist('2026-09-15 09:00') }).status, 'in_progress');
    assert.equal(run({ type: 'no_food_delivery', expenses: daily(8, 14), now: ist('2026-09-16 00:05') }).status, 'completed');
});

test('zero food delivery: a Swiggy order fails it immediately; Instamart groceries do not', () => {
    assert.ok(FOOD_DELIVERY.test('Swiggy order'));
    assert.ok(FOOD_DELIVERY.test("Domino's Pizza"));
    assert.ok(!FOOD_DELIVERY.test('Swiggy Instamart'));
    assert.ok(!FOOD_DELIVERY.test('BigBasket'));
    const withGroceries = [...daily(8, 14), exp('2026-09-10', 640, 'Shopping', 'Swiggy Instamart')];
    assert.equal(run({ type: 'no_food_delivery', expenses: withGroceries, now: ist('2026-09-16 10:00') }).status, 'completed');
    const ordered = [...daily(8, 11), exp('2026-09-11 21:00', 349, 'Food', 'Zomato')];
    const r = run({ type: 'no_food_delivery', expenses: ordered, now: ist('2026-09-12 08:00') });
    assert.equal(r.status, 'failed');
    assert.match(r.reason, /food-delivery order/);
});

test('an order before the challenge started does not count', () => {
    const r = run({ type: 'no_food_delivery', expenses: [exp('2026-09-07 21:00', 300, 'Food', 'Swiggy'), ...daily(8, 14)], now: ist('2026-09-16 10:00') });
    assert.equal(r.status, 'completed');
});

test('logging nothing never passes: enough logged or no-spend days are required', () => {
    const idle = run({ type: 'no_food_delivery', expenses: daily(8, 9), now: ist('2026-09-16 10:00') });
    assert.equal(idle.status, 'failed');
    assert.match(idle.reason, /2 of the 5 days/);
    const noSpend = new Set(['2026-09-10', '2026-09-11', '2026-09-12']);
    assert.equal(run({ type: 'no_food_delivery', expenses: daily(8, 9), noSpendDays: noSpend, now: ist('2026-09-16 10:00') }).status, 'completed');
});

test('no impulse purchases: Shopping or Entertainment fails it', () => {
    const r = run({ type: 'no_impulse', expenses: [...daily(8, 14), exp('2026-09-13', 999, 'Shopping', 'Myntra')], now: ist('2026-09-16 10:00') });
    assert.equal(r.status, 'failed');
});

test('daily target: every day at or under the target', () => {
    const params = { dailyTarget: 300 };
    assert.equal(run({ type: 'daily_target', params, expenses: daily(8, 14, 300), now: ist('2026-09-16 10:00') }).status, 'completed');
    const over = [...daily(8, 14, 200), exp('2026-09-12 20:00', 150)];
    assert.equal(run({ type: 'daily_target', params, expenses: over, now: ist('2026-09-13 10:00') }).status, 'failed');
});

test('weekend budget: Saturday + Sunday together', () => {
    const params = { weekendBudget: 1000 };
    const ok = [...daily(8, 11), exp('2026-09-12', 500), exp('2026-09-13', 450), exp('2026-09-14', 100)];
    assert.equal(run({ type: 'weekend_budget', params, expenses: ok, now: ist('2026-09-16 10:00') }).status, 'completed');
    const over = [...daily(8, 11), exp('2026-09-12', 700), exp('2026-09-13', 400)];
    assert.equal(run({ type: 'weekend_budget', params, expenses: over, now: ist('2026-09-14 10:00') }).status, 'failed');
});

test('spend less than usual: needs history, compares with the user\'s own 8-week average', () => {
    const params = { amount: 1000 };
    const history = [];
    for (let d = 1; d <= 56; d++) {
        const date = new Date(Date.UTC(2026, 6, 13 + d)).toISOString().slice(0, 10); // 14 Jul → 7 Sep
        if (date < '2026-09-08') history.push(exp(date, 500));
    }
    // Usual 7 days = 3,500; target ≤ 2,500.
    assert.deepEqual(eligibility('spend_less', params, { expenses: history, now: ist('2026-09-07 20:00'), days: 7 }), { eligible: true });
    assert.equal(run({ type: 'spend_less', params, expenses: [...history, ...daily(8, 14, 300)], now: ist('2026-09-16 10:00') }).status, 'completed');
    const r = run({ type: 'spend_less', params, expenses: [...history, ...daily(8, 14, 450)], now: ist('2026-09-16 10:00') });
    assert.equal(r.status, 'failed');
    assert.match(r.reason, /₹3,150 against a target of ₹2,500/);
    const newUser = eligibility('spend_less', params, { expenses: daily(1, 6), now: ist('2026-09-07 20:00'), days: 7 });
    assert.equal(newUser.eligible, false);
});

test('titles describe responsible behaviour only', () => {
    for (const [type, params] of [['no_food_delivery', {}], ['home_food', {}], ['no_impulse', {}], ['daily_target', { dailyTarget: 300 }], ['weekend_budget', { weekendBudget: 1000 }], ['spend_less', { amount: 1000 }]]) {
        const { title, rule } = describe(type, params, 7);
        assert.doesNotMatch(`${title} ${rule}`, /\b(buy|spend more|order now|shop now|deal)\b/i, type);
    }
});
