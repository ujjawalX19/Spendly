/**
 * Money Streak rules — missions, streak, weekly goal, XP and levels — tested
 * as pure functions with explicit dates. Run under several TZ values by
 * `npm run test:tz`: every calendar day is an IST day, whatever the server clock.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const ms = require('../lib/moneyStreak');

const ist = (s) => {
    const [d, tm = '12:00'] = s.split(' ');
    const [Y, M, D] = d.split('-').map(Number);
    const [h, m] = tm.split(':').map(Number);
    return new Date(Date.UTC(Y, M - 1, D, h, m) - 5.5 * 3600 * 1000);
};
const on = (dateTime, amount, category = 'Food') => ({ amount, category, occurred_at: ist(dateTime).toISOString() });
const RICH = { monthly_budget: 300000, investment_target: 0 }; // a daily limit of ~₹10,000
const none = new Set();

/** The first date on/after `from` whose rotating mission is `id` (with a positive limit). */
function dateWithMission(id, from = '2026-09-01') {
    for (let k = from, i = 0; i < 10; i++, k = ms.addDays(k, 1)) if (ms.missionFor(k, 100) === id) return k;
    throw new Error(`no ${id} day`);
}
const evalDay = (dateKey, expenses, { noSpend = none, profile = RICH, bills = [] } = {}) => ms.evaluateDay({ dateKey, expenses, noSpendDays: noSpend, profile, bills });

// ─── Missions ───────────────────────────────────────────────────────────────

test('missions rotate by date and are the same all day', () => {
    const seen = new Set();
    for (let k = '2026-09-01', i = 0; i < 6; i++, k = ms.addDays(k, 1)) seen.add(ms.missionFor(k, 500));
    assert.deepEqual([...seen].sort(), ['log_today', 'no_impulse', 'under_limit']);
    const d = dateWithMission('under_limit');
    assert.equal(ms.missionFor(d, 500), ms.missionFor(d, 500));
});

test('with nothing safe to spend, "stay under the limit" becomes a no-spend day', () => {
    assert.equal(ms.missionFor(dateWithMission('under_limit'), 0), 'no_spend');
    assert.match(ms.missionText('no_spend').title, /no-spend day/);
});

test('log today: kept by logging an expense or marking a no-spend day; not by doing nothing', () => {
    const d = dateWithMission('log_today');
    assert.equal(evalDay(d, [on(`${d} 09:00`, 50)]).kept, true);
    assert.equal(evalDay(d, [], { noSpend: new Set([d]) }).kept, true);
    const idle = evalDay(d, []);
    assert.equal(idle.kept, false);
    assert.equal(idle.status, 'to_do');
});

test('stay under the limit: under is kept, over is missed, and logging nothing never passes', () => {
    const d = dateWithMission('under_limit');
    const profile = { monthly_budget: 30000, investment_target: 0 };
    const limit = evalDay(d, [], { profile }).limit;
    assert.ok(limit > 0);
    assert.equal(evalDay(d, [on(`${d} 10:00`, limit)], { profile }).kept, true);
    const over = evalDay(d, [on(`${d} 10:00`, limit + 1)], { profile });
    assert.equal(over.kept, false);
    assert.equal(over.status, 'missed');
    assert.equal(evalDay(d, [], { profile }).kept, false);
});

test("the day's limit comes from Safe-to-Spend at the start of that day", () => {
    const d = dateWithMission('under_limit', '2026-09-10');
    const profile = { monthly_budget: 30000, investment_target: 0 };
    const before = evalDay(d, [], { profile }).limit;
    // Spending earlier in the month lowers the limit; spending later that day does not.
    const afterEarlier = evalDay(d, [on('2026-09-02 12:00', 9000)], { profile }).limit;
    assert.ok(afterEarlier < before);
    assert.equal(evalDay(d, [on(`${d} 23:00`, 9000)], { profile }).limit, before);
});

test('skip unplanned spending: Shopping or Entertainment breaks it, food does not', () => {
    const d = dateWithMission('no_impulse');
    assert.equal(evalDay(d, [on(`${d} 12:00`, 200, 'Food')]).kept, true);
    assert.equal(evalDay(d, [on(`${d} 12:00`, 200, 'Food'), on(`${d} 18:00`, 99, 'Shopping')]).kept, false);
    assert.equal(evalDay(d, [on(`${d} 18:00`, 99, 'Entertainment')]).kept, false);
});

test('a no-spend mark does not count once spending is logged that day', () => {
    const d = dateWithMission('log_today');
    const day = evalDay(d, [on(`${d} 20:00`, 10)], { noSpend: new Set([d]) });
    assert.equal(day.noSpend, false);
    assert.equal(day.kept, true); // still logged something
    const nsDay = ms.addDays(dateWithMission('under_limit'), 0);
    assert.equal(ms.evaluateDay({ dateKey: nsDay, expenses: [on(`${nsDay} 08:00`, 1)], noSpendDays: new Set([nsDay]), profile: { monthly_budget: 0.0001 }, bills: [] }).noSpend, false);
});

test('timezone boundary: 23:50 IST belongs to that day and 00:10 IST to the next', () => {
    const d = dateWithMission('log_today');
    const next = ms.addDays(d, 1);
    const late = [on(`${d} 23:50`, 40)];
    assert.equal(evalDay(d, late).transactions, 1);
    assert.equal(evalDay(next, late).transactions, 0);
    const early = [on(`${next} 00:10`, 40)];
    assert.equal(evalDay(d, early).transactions, 0);
    assert.equal(evalDay(next, early).transactions, 1);
});

// ─── Streak ─────────────────────────────────────────────────────────────────

const kept = (keys) => new Map(keys.map((k) => [k, true]));

test('streak continues day after day and counts today once today is kept', () => {
    const days = ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'];
    const s = ms.computeStreak(kept(days), '2026-09-11', '2026-09-01');
    assert.equal(s.current, 4);
    assert.deepEqual(s.completedRun, { length: 3, startKey: '2026-09-08' });

    const notYet = kept(days.slice(0, 3));
    notYet.set('2026-09-11', false);
    assert.equal(ms.computeStreak(notYet, '2026-09-11', '2026-09-01').current, 3); // alive until today ends
});

test('a missed day restarts the streak; the longest run is remembered', () => {
    const m = kept(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-06', '2026-09-07']);
    m.set('2026-09-05', false);
    const s = ms.computeStreak(m, '2026-09-07', '2026-09-01');
    assert.equal(s.current, 2);
    assert.equal(s.longest, 4);
});

test('days before the streak started never count', () => {
    const s = ms.computeStreak(kept(['2026-09-01', '2026-09-02', '2026-09-03']), '2026-09-03', '2026-09-03');
    assert.equal(s.current, 1);
    assert.equal(s.longest, 1);
});

test('the week view runs Monday to Sunday', () => {
    const w = ms.weekView(kept(['2026-09-14', '2026-09-15']), '2026-09-16', '2026-09-01'); // Wednesday
    assert.deepEqual(w.map((d) => d.weekday), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    assert.deepEqual(w.map((d) => d.status), ['kept', 'kept', 'today', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
});

// ─── Weekly and monthly goals ───────────────────────────────────────────────

test('weekly goal: within the week\'s share of the budget on at least 4 logged days, and only once the week ends', () => {
    const profile = { monthly_budget: 30000 }; // ₹7,000 a week in a 30-day month
    const monday = '2026-09-14';
    const four = ['14', '15', '16', '17'].map((d) => on(`2026-09-${d} 12:00`, 500));
    const running = ms.weeklyGoal({ mondayKey: monday, expenses: four, noSpendDays: none, profile, today: '2026-09-18' });
    assert.equal(running.limit, 7000);
    assert.equal(running.achieved, false); // week not over
    const done = ms.weeklyGoal({ mondayKey: monday, expenses: four, noSpendDays: none, profile, today: '2026-09-21' });
    assert.equal(done.achieved, true);
    assert.equal(ms.weeklyGoal({ mondayKey: monday, expenses: four.slice(0, 3), noSpendDays: none, profile, today: '2026-09-21' }).achieved, false);
    assert.equal(ms.weeklyGoal({ mondayKey: monday, expenses: [...four, on('2026-09-18 12:00', 6000)], noSpendDays: none, profile, today: '2026-09-21' }).achieved, false);
    // Not logging at all can never "stay within" the week.
    assert.equal(ms.weeklyGoal({ mondayKey: monday, expenses: [], noSpendDays: none, profile, today: '2026-09-21' }).achieved, false);
});

// ─── XP and levels ──────────────────────────────────────────────────────────

test('levels are simple thresholds', () => {
    assert.deepEqual([0, 249, 250, 749, 750, 1999, 2000, 99999].map((x) => ms.levelFor(x).levelName), [
        'Money Starter', 'Money Starter', 'Budget Builder', 'Budget Builder', 'Money Smart', 'Money Smart', 'Money Master', 'Money Master',
    ]);
    const l = ms.levelFor(500);
    assert.deepEqual(l.nextLevel, { level: 3, name: 'Money Smart', at: 750, xpToGo: 250 });
    assert.equal(l.progressPercent, 50);
    assert.equal(ms.levelFor(-50).total, 0);
    assert.equal(ms.levelFor(5000).nextLevel, null);
});

test('awards are keyed so each day, week, month and milestone can pay only once', () => {
    const awards = ms.awardsDue({
        endedDays: [{ dateKey: '2026-09-01', kept: true }, { dateKey: '2026-09-02', kept: false }],
        completedRun: { length: 15, startKey: '2026-08-20' },
        lastWeek: { achieved: true, weekStart: '2026-08-31' },
        lastMonth: { achieved: true, monthKey: '2026-08' },
    });
    assert.deepEqual(awards.map((a) => `${a.reason}|${a.ref_key}|${a.xp}`), [
        'daily_mission|2026-09-01|20',
        'streak_milestone|2026-08-20:7|100',
        'streak_milestone|2026-08-20:14|100',
        'weekly_goal|2026-08-31|50',
        'month_within_budget|2026-08|30',
    ]);
    const keys = awards.map((a) => `${a.reason}|${a.ref_key}`);
    assert.equal(new Set(keys).size, keys.length);
});

test('nothing in the rules rewards spending more', () => {
    const d = dateWithMission('under_limit');
    const profile = { monthly_budget: 30000, investment_target: 0 };
    const small = evalDay(d, [on(`${d} 10:00`, 100)], { profile });
    const big = evalDay(d, [on(`${d} 10:00`, 100), on(`${d} 11:00`, 5000)], { profile });
    assert.equal(small.kept, true);
    assert.equal(big.kept, false);
    assert.ok(Object.values(ms.XP).every((x) => x > 0 && x <= 100));
});
