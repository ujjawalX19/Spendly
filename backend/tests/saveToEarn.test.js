/**
 * Save-to-Earn engine (lib/saveToEarn): templates, estimated impact (Victory
 * Pot), judging of the personal-only rules, start rules, recommendations,
 * badges, and the no-shame / no-gambling product rules.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const appTime = require('../lib/appTime');
const { addDays } = require('../lib/moneyStreak');
const s2e = require('../lib/saveToEarn');
const { TYPES } = require('../lib/challengeRules');

const noonOn = (key) => new Date(Date.parse(`${key}T06:30:00Z`)).toISOString();
const row = (key, amount, description = 'Canteen lunch', category = 'Food') => ({ amount, description, category, occurred_at: noonOn(key) });
const NOW = new Date('2026-09-20T12:00:00+05:30');
const TODAY = appTime.localDateKey(NOW);

/** 8 weeks before `startsOn` with two ₹300 Swiggy orders a week. */
function foodHistory(startsOn) {
    const rows = [];
    for (let d = 1; d <= 56; d++) {
        const key = addDays(startsOn, -d);
        rows.push(row(key, 150, 'Metro'));
        if (d % 7 === 2 || d % 7 === 5) rows.push(row(key, 300, 'Swiggy order'));
    }
    return rows;
}

test('templates: a free set and a Pro set, every one rewards spending less or logging, none uses chance', () => {
    const free = s2e.TEMPLATE_KEYS.filter((k) => !s2e.TEMPLATES[k].pro);
    const pro = s2e.TEMPLATE_KEYS.filter((k) => s2e.TEMPLATES[k].pro);
    assert.ok(free.length >= 4, 'basic challenges stay free');
    assert.ok(pro.length >= 3);
    for (const k of s2e.TEMPLATE_KEYS) {
        const t = s2e.TEMPLATES[k];
        assert.ok(['log_daily', 'no_cab'].includes(t.rule) || TYPES[t.rule], `${k} uses a known rule`);
        assert.ok(t.xp >= 1 && t.xp <= 100, 'XP fits the ledger constraint');
        const text = JSON.stringify(t) + JSON.stringify(s2e.describe(k, s2e.paramsFor(k, { dailyLimit: 500 })));
        assert.doesNotMatch(text, /spend more|borrow|loan|invest in|lottery|spin|chance to win|jackpot|bet\b/i, k);
        assert.doesNotMatch(text, /\bfail/i, `${k}: no-shame wording`);
    }
});

test('personal targets come from the Safe-to-Spend daily figure, rounded and never tiny', () => {
    assert.deepEqual(s2e.paramsFor('daily_target_7', { dailyLimit: 437 }), { dailyTarget: 440 });
    assert.deepEqual(s2e.paramsFor('daily_target_7', { dailyLimit: 20 }), { dailyTarget: 100 });
    assert.deepEqual(s2e.paramsFor('weekend_budget_7', { dailyLimit: 437 }), { weekendBudget: 850 });
    assert.deepEqual(s2e.paramsFor('spend_less_500'), { amount: 500 });
});

test('Victory Pot estimate: usual spending for that kind of thing minus actual, never negative', () => {
    const startsOn = '2026-09-21';
    const endsOn = addDays(startsOn, 6);
    const expenses = [...foodHistory(startsOn), row(startsOn, 150, 'Metro')];
    const est = s2e.estimateImpact('no_food_delivery_7', { expenses, startsOn, endsOn });
    // 16 orders × ₹300 over 56 days → ₹600 per 7 days; none during the challenge.
    assert.equal(est.baseline, 600);
    assert.equal(est.actual, 0);
    assert.equal(est.impact, 600);
    assert.match(est.explained, /Estimated spending avoided/);

    const spentMore = [...foodHistory(startsOn), row(addDays(startsOn, 1), 5000, 'Laptop', 'Shopping')];
    assert.equal(s2e.estimateImpact('no_impulse_5', { expenses: spentMore, startsOn, endsOn: addDays(startsOn, 4) }).impact, 0);
});

test('no estimate without four weeks of history, and none for habit challenges', () => {
    const startsOn = '2026-09-21';
    const shortHistory = [row(addDays(startsOn, -10), 300, 'Swiggy')];
    const a = s2e.estimateImpact('no_food_delivery_7', { expenses: shortHistory, startsOn, endsOn: addDays(startsOn, 6) });
    assert.equal(a.impact, null);
    assert.match(a.explained, /Not estimated/);
    assert.equal(s2e.estimateImpact('log_daily_7', { expenses: foodHistory(startsOn), startsOn, endsOn: addDays(startsOn, 6) }).impact, null);
});

test('log every day: all days logged completes after the grace day; a gap does not', () => {
    const enrolledAt = noonOn('2026-09-01');
    const startsOn = '2026-09-02';
    const full = Array.from({ length: 7 }, (_, i) => row(addDays(startsOn, i), 100));
    const judgeDay = new Date(`${addDays(startsOn, 8)}T12:00:00+05:30`);
    assert.equal(s2e.evaluate({ templateKey: 'log_daily_7', params: {}, enrolledAt, expenses: full, now: judgeDay }).status, 'completed');
    const gap = full.filter((_, i) => i !== 3);
    const r = s2e.evaluate({ templateKey: 'log_daily_7', params: {}, enrolledAt, expenses: gap, now: judgeDay });
    assert.equal(r.status, 'failed');
    assert.match(r.reason, /6 of 7/);
    // A no-spend mark counts as a logged day.
    assert.equal(s2e.evaluate({ templateKey: 'log_daily_7', params: {}, enrolledAt, expenses: gap, noSpendDays: new Set([addDays(startsOn, 3)]), now: judgeDay }).status, 'completed');
    // Before the grace day it is still in progress.
    assert.equal(s2e.evaluate({ templateKey: 'log_daily_7', params: {}, enrolledAt, expenses: full, now: new Date(`${addDays(startsOn, 7)}T12:00:00+05:30`) }).status, 'in_progress');
});

test('no-cab weekend: a weekend cab ends it at once; a weekday cab or a metro ride does not', () => {
    const enrolledAt = noonOn('2026-09-17'); // Thursday → starts Friday 18th
    const startsOn = '2026-09-18';
    const logged = Array.from({ length: 7 }, (_, i) => row(addDays(startsOn, i), 60, 'Metro', 'Transport'));
    const sunday = '2026-09-20';
    const now = new Date('2026-09-21T12:00:00+05:30');
    const weekendCab = [...logged, row(sunday, 240, 'Uber ride', 'Transport')];
    assert.equal(s2e.evaluate({ templateKey: 'no_cab_weekend', params: {}, enrolledAt, expenses: weekendCab, now }).status, 'failed');
    const weekdayCab = [...logged, row('2026-09-22', 240, 'Ola cab', 'Transport')];
    assert.equal(s2e.evaluate({ templateKey: 'no_cab_weekend', params: {}, enrolledAt, expenses: weekdayCab, now }).status, 'in_progress');
    assert.equal(s2e.CAB.test('Ola Electric scooter service'), false);
});

test('start rules: one active challenge, Pro templates need Pro, a savings sprint needs history', () => {
    assert.equal(s2e.canStart('no_food_delivery_7', { isPro: false, expenses: [], now: NOW, activeCount: 0 }).ok, true);
    assert.equal(s2e.canStart('no_food_delivery_7', { isPro: true, expenses: [], now: NOW, activeCount: 1 }).code, 'CHALLENGE_ACTIVE');
    assert.equal(s2e.canStart('weekend_budget_7', { isPro: false, expenses: [], now: NOW, activeCount: 0 }).code, 'PRO_REQUIRED');
    assert.equal(s2e.canStart('weekend_budget_7', { isPro: true, expenses: [], now: NOW, activeCount: 0 }).ok, true);
    assert.equal(s2e.canStart('spend_less_500', { isPro: false, expenses: [], now: NOW, activeCount: 0 }).code, 'NOT_ELIGIBLE');
    assert.equal(s2e.canStart('nope', { isPro: true, expenses: [], now: NOW, activeCount: 0 }).code, 'UNKNOWN_CHALLENGE');
});

test('recommendation follows real spending, gives a reason, and never offers Pro to a free user', () => {
    const upFood = [];
    for (let d = 0; d < 28; d++) {
        upFood.push(row(addDays(TODAY, -d), 120, 'Canteen'));
        if (d % 3 === 0) upFood.push(row(addDays(TODAY, -d), 350, 'Zomato'));
    }
    const rec = s2e.recommend({ expenses: upFood, now: NOW, isPro: false });
    assert.equal(rec.template, 'no_food_delivery_7');
    assert.match(rec.reason, /Food delivery is up/);

    const weekendHeavy = [];
    for (let d = 0; d < 28; d++) {
        const key = addDays(TODAY, -d);
        const dow = new Date(`${key}T12:00:00Z`).getUTCDay();
        weekendHeavy.push(row(key, dow === 0 || dow === 6 ? 900 : 100, 'Outing', 'Other'));
    }
    assert.equal(s2e.recommend({ expenses: weekendHeavy, now: NOW, isPro: true }).template, 'weekend_budget_7');
    const freeRec = s2e.recommend({ expenses: weekendHeavy, now: NOW, isPro: false });
    assert.equal(s2e.TEMPLATES[freeRec.template].pro, false);
    assert.equal(s2e.recommend({ expenses: [], now: NOW, isPro: false }).template, 'log_daily_7');
});

test('badges come only from real behaviour', () => {
    assert.deepEqual(s2e.earnedBadges({}), []);
    const got = s2e.earnedBadges({
        completed: [{ template: 'no_impulse_5' }], victoryPot: 620, longestStreak: 31, ledgerReasons: new Set(['month_within_budget']),
    });
    assert.deepEqual(got.sort(), ['budget_keeper', 'first_challenge', 'habit_30', 'saved_500', 'smart_decision', 'streak_7']);
    for (const b of Object.values(s2e.BADGES)) assert.doesNotMatch(b.desc, /open(ed)? the app|log(ged)? in/i, 'no badges for app activity');
});

test('Victory Pot sums estimates once each, splits this month, and ignores bad values', () => {
    const pot = s2e.victoryPot([
        { impact_inr: 600, judged_at: '2026-09-10T10:00:00Z' },
        { impact_inr: 400, judged_at: '2026-08-10T10:00:00Z' },
        { impact_inr: null, judged_at: '2026-09-11T10:00:00Z' },
        { impact_inr: -50, judged_at: '2026-09-12T10:00:00Z' },
    ], NOW);
    assert.deepEqual(pot, { total: 1000, thisMonth: 600 });
});
