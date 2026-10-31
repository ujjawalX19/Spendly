/**
 * Savings goal progress and milestone rules (lib/goals.js) and the weekly
 * recap (lib/weeklyRecap.js). Pure functions, fixed dates.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const ms = require('../lib/moneyStreak');
const goals = require('../lib/goals');
const recap = require('../lib/weeklyRecap');

const NOW = new Date('2026-10-15T12:00:00+05:30');
const at = (key, hh = '12:00') => new Date(`${key}T${hh}:00+05:30`).toISOString();
const goal = (over = {}) => ({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Laptop', kind: 'laptop', status: 'active', target_inr: 40000, reward_target_inr: 40000, target_date: '2027-04-15', created_at: at('2026-09-15'), ...over });
const add = (amount, on = '2026-10-01', goalId = goal().id) => ({ id: `c-${amount}-${on}`, goal_id: goalId, amount_inr: amount, contributed_on: on, created_at: at(on), source: 'self_reported' });

test('progress: saved, remaining, percent, pace and a suggested amount', () => {
    const g = goal();
    const p = goals.present(g, [add(5000), add(5000, '2026-10-10')], { now: NOW });
    assert.equal(p.savedInr, 10000);
    assert.equal(p.remainingInr, 30000);
    assert.equal(p.percent, 25);
    assert.equal(p.progressKind, 'self_reported');
    assert.equal(p.daysLeft, ms.daysBetween('2026-10-15', '2027-04-15'));
    assert.equal(p.suggested.monthlyInr, Math.ceil(30000 / Math.ceil(p.daysLeft / 30.44)));
    assert.ok(['on_track', 'behind'].includes(p.pace));
    assert.equal(goals.present(g, [add(40000)], { now: NOW }).pace, 'reached');
    assert.equal(goals.present(goal({ target_date: '2026-10-01' }), [], { now: NOW }).pace, 'past_date');
    // The milestone list always starts with "Goal set".
    assert.deepEqual(p.milestones.map((x) => [x.label, x.reached]), [['Goal set', true], ['25%', true], ['50%', false], ['75%', false], ['100%', false]]);
});

test('milestones are paid only for goals of ₹1,000+, the first 3 a month, and 100% after 7 days', () => {
    const g = goal();
    assert.deepEqual(goals.milestonesDue(g, 20000, [g], NOW).map((x) => x.pct), [0, 25, 50]);
    assert.deepEqual(goals.milestonesDue(goal({ target_inr: 900, reward_target_inr: 900 }), 900, [goal({ target_inr: 900, reward_target_inr: 900 })], NOW), []);

    const young = goal({ created_at: at('2026-10-12') });
    assert.deepEqual(goals.milestonesDue(young, 40000, [young], NOW).map((x) => x.pct), [0, 25, 50, 75], '100% waits until the goal is a week old');
    assert.deepEqual(goals.milestonesDue(g, 40000, [g], NOW).map((x) => x.pct), [0, 25, 50, 75, 100]);

    const month = ['01', '02', '03', '04'].map((d, i) => goal({ id: `0000000${i}-0000-4000-8000-000000000000`, created_at: at(`2026-09-${d}`) }));
    assert.ok(goals.rewardEligibility(month[2], month).eligible);
    assert.equal(goals.rewardEligibility(month[3], month).eligible, false, 'the fourth goal in a month earns no milestones');
    assert.deepEqual(goals.milestonesDue(month[3], 40000, month, NOW), []);
    assert.deepEqual(goals.milestonesDue(goal({ status: 'archived' }), 40000, [goal()], NOW), []);
});

test('lowering a target never pays a milestone early', () => {
    const lowered = goal({ target_inr: 10000, reward_target_inr: 40000 });
    // ₹10,000 is 100% of the new target but only 25% of the highest target.
    assert.deepEqual(goals.milestonesDue(lowered, 10000, [lowered], NOW).map((x) => x.pct), [0, 25]);
    assert.equal(goals.present(lowered, [add(10000)], { now: NOW }).percent, 100, 'the progress shown uses the current target');
});

test('a correction lists the paid milestones the goal no longer reaches (never "Goal set")', () => {
    assert.deepEqual(goals.milestonesToReverse(goal(), 15000, [0, 25, 50, 75]), [50, 75]);
    assert.deepEqual(goals.milestonesToReverse(goal(), 0, [0, 25]), [25]);
    assert.deepEqual(goals.milestonesToReverse(goal(), 40000, [0, 25, 50, 75, 100]), []);
});

test('milestone keys fit the XP ledger (40 characters) and rewards stay within its limits', () => {
    for (const pct of goals.MILESTONES) {
        assert.ok(goals.refKey(goal().id, pct).length <= 40);
        assert.ok(goals.MILESTONE_REWARD[pct].xp >= 1 && goals.MILESTONE_REWARD[pct].xp <= 100);
        assert.ok(goals.MILESTONE_REWARD[pct].points > 0);
    }
});

// ─── Weekly recap ───────────────────────────────────────────────────────────

const WEEK = '2026-10-05'; // Monday
const exp = (key, amount, category = 'Food', description = category) => ({ amount, category, description, occurred_at: at(key) });
function build(expenses, extra = {}) {
    return recap.build({
        weekStart: WEEK,
        today: '2026-10-15',
        startedOn: '2026-09-01',
        expenses,
        noSpendDays: new Set(),
        profile: { monthly_budget: 31000 },
        bills: [],
        streakDays: [],
        assignments: new Map(),
        checkins: [],
        xpRows: [{ reason: 'daily_mission', xp: 25, created_at: at('2026-10-06') }, { reason: 'daily_mission', xp: 25, created_at: at('2026-09-28') }],
        pointsRows: [{ reason: 'daily_mission', points: 8, created_at: at('2026-10-06') }],
        badges: [{ badge: 'streak_7', earned_at: at('2026-10-07') }],
        goals: [goal()],
        contributions: [add(1500, '2026-10-08')],
        level: ms.levelFor(900),
        ...extra,
    });
}

test('recap: missions, XP, Points, badges and savings for the week only', () => {
    const r = build(Array.from({ length: 7 }, (_, i) => exp(ms.addDays(WEEK, i), 300)));
    assert.equal(r.week.start, WEEK);
    assert.equal(r.week.end, '2026-10-11');
    assert.equal(r.week.complete, true);
    assert.equal(r.missions.days.length, 7);
    assert.equal(r.xp.earned, 25);
    assert.equal(r.points.earned, 8);
    assert.deepEqual(r.achievements.map((b) => b.key), ['streak_7']);
    assert.equal(r.savings.addedInr, 1500);
    assert.equal(r.savings.kind, 'self_reported');
    assert.equal(r.level.name, 'Money Smart');
});

test("recap: a day's mission reward counts for that day's week, even if paid later", () => {
    const r = build([], {
        xpRows: [
            { reason: 'daily_mission', ref_key: '2026-10-11', xp: 25, created_at: at('2026-10-13') }, // Sunday's, paid Tuesday
            { reason: 'daily_mission', ref_key: '2026-10-04', xp: 25, created_at: at('2026-10-06') }, // last week's
            { reason: 'weekly_goal', ref_key: '2026-09-28', xp: 50, created_at: at('2026-10-06') },   // paid this week
        ],
        pointsRows: [{ reason: 'daily_mission', ref_key: '2026-10-11', points: 8, created_at: at('2026-10-13') }],
    });
    assert.equal(r.xp.earned, 75);
    assert.equal(r.points.earned, 8);
});

test('recap: category changes need 3 logged days in both weeks, otherwise "unavailable"', () => {
    const thin = build([exp('2026-10-06', 500), exp('2026-09-30', 200)]);
    assert.equal(thin.categories.available, false);
    assert.match(thin.categories.reason, /Not enough logged days/);

    const lastWeek = [0, 1, 2, 3].map((i) => exp(ms.addDays('2026-09-28', i), 200, 'Food'));
    const thisWeek = [0, 1, 2, 3].map((i) => exp(ms.addDays(WEEK, i), 200, 'Food')).concat([exp('2026-10-07', 1500, 'Shopping')]);
    const r = build([...lastWeek, ...thisWeek]);
    assert.equal(r.categories.available, true);
    assert.deepEqual(r.categories.changes[0], { category: 'Shopping', thisWeek: 1500, lastWeek: 0, change: 1500, percent: null });
    assert.equal(r.focus.key, 'category');
    assert.match(r.focus.title, /Shopping/);
});

test('recap: a week in progress is compared with the same days of the week before', () => {
    const r = recap.build({
        weekStart: '2026-10-12', today: '2026-10-15', startedOn: '2026-09-01',
        expenses: [...[0, 1, 2].map((i) => exp(ms.addDays('2026-10-05', i), 100)), exp('2026-10-10', 5000), ...[0, 1, 2].map((i) => exp(ms.addDays('2026-10-12', i), 150))],
        noSpendDays: new Set(), profile: { monthly_budget: 31000 }, bills: [], streakDays: [], assignments: new Map(), checkins: [],
        xpRows: [], pointsRows: [], badges: [], goals: [], contributions: [], level: ms.levelFor(0),
    });
    assert.equal(r.week.complete, false);
    assert.equal(r.week.daysCounted, 4);
    assert.equal(r.categories.comparedDays, 4);
    // The ₹5,000 on Saturday of last week is outside the compared days.
    assert.deepEqual(r.categories.changes, [{ category: 'Food', thisWeek: 450, lastWeek: 300, change: 150, percent: 50 }]);
    assert.ok(r.missions.inProgress);
});

test('the share card carries no amounts, categories, merchants or goal names', () => {
    const r = build([exp('2026-10-06', 4321, 'Shopping', 'Myntra order'), exp('2026-10-07', 999, 'Food', 'Swiggy')]);
    const text = JSON.stringify(r.share);
    assert.doesNotMatch(text, /₹|\b4,?321\b|\b999\b|Shopping|Food|Myntra|Swiggy|Laptop/);
    assert.ok(r.share.stats.length >= 3);
    assert.match(r.share.title, /My Vittova week/);
});
