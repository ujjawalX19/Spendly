/**
 * weeklyRecap — one week (Monday to Sunday, IST) of missions, XP, Points,
 * streak days, budget, spending by category, savings and badges, plus one
 * thing to focus on next week. Pure: rows in, recap out.
 *
 * Comparisons with the week before are only made when both weeks have at
 * least 3 logged days; otherwise they are reported as unavailable rather than
 * guessed. For a week still in progress, it is compared with the same days of
 * the week before.
 *
 * `share` holds the only fields the share card may show: counts, XP, Points,
 * streak days, level and a plain-words budget result. No rupee amounts,
 * categories, merchants, goal names or anything else from the user's records.
 */

const appTime = require('./appTime');
const ms = require('./moneyStreak');
const missions = require('./missions');
const s2e = require('./saveToEarn');

const MIN_LOGGED_DAYS_TO_COMPARE = 3;

const keyOf = (iso) => appTime.localDateKey(new Date(iso));
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

function label(startKey, endKey) {
    const fmt = (k, opts) => new Date(ms.dayStart(k).getTime() + 12 * 3600 * 1000).toLocaleDateString('en-IN', { ...opts, timeZone: 'Asia/Kolkata' });
    const sameMonth = startKey.slice(0, 7) === endKey.slice(0, 7);
    return sameMonth
        ? `${fmt(startKey, { day: 'numeric' })}–${fmt(endKey, { day: 'numeric', month: 'short' })}`
        : `${fmt(startKey, { day: 'numeric', month: 'short' })} – ${fmt(endKey, { day: 'numeric', month: 'short' })}`;
}

function rowsBetween(expenses, fromKey, toKeyInclusive) {
    const from = ms.dayStart(fromKey).getTime();
    const to = ms.dayStart(ms.addDays(toKeyInclusive, 1)).getTime();
    return expenses.filter((e) => { const x = new Date(e.occurred_at).getTime(); return x >= from && x < to; });
}

function byCategory(rows) {
    const m = new Map();
    for (const e of rows) m.set(e.category || 'Other', (m.get(e.category || 'Other') || 0) + (Number(e.amount) || 0));
    return m;
}

/**
 * @param {object} a
 * @param {string} a.weekStart     Monday 'YYYY-MM-DD'
 * @param {string} a.today
 * @param {string} a.startedOn     Money Streak start (days before it are not counted)
 * @param {Array}  a.expenses      covering the week before as well
 * @param {Set}    a.noSpendDays
 * @param {object} a.profile
 * @param {Array}  a.bills
 * @param {Array}  a.streakDays    locked rows { day, kept, mission }
 * @param {Map}    a.assignments   day -> assigned mission row
 * @param {Array}  a.checkins
 * @param {Array}  a.xpRows        { reason, xp, created_at }
 * @param {Array}  a.pointsRows    { reason, points, created_at }
 * @param {Array}  a.badges        { badge, earned_at }
 * @param {Array}  a.goals
 * @param {Array}  a.contributions
 * @param {object} a.level         levelFor(total XP)
 */
function build(a) {
    const start = a.weekStart;
    const end = ms.addDays(start, 6);
    const lastDay = end < a.today ? end : a.today; // days so far
    const complete = end < a.today;
    const days = [];
    for (let k = start; k <= lastDay; k = ms.addDays(k, 1)) days.push(k);
    const inWeek = (iso) => { const k = keyOf(iso); return k >= start && k <= end; };

    // Missions and streak days.
    const locked = new Map((a.streakDays || []).map((d) => [String(d.day).slice(0, 10), d]));
    const missionDays = days.filter((k) => !a.startedOn || k >= a.startedOn).map((k) => {
        const assignment = a.assignments?.get(k) || null;
        let kept;
        let status;
        if (locked.has(k)) {
            kept = locked.get(k).kept === true;
            status = kept ? 'kept' : 'missed';
        } else if (assignment) {
            const facts = missions.dayFacts({ dateKey: k, expenses: a.expenses, noSpendDays: a.noSpendDays, checkins: a.checkins, contributions: a.contributions });
            const j = missions.judge(assignment, facts);
            kept = j.kept;
            status = k === a.today ? (j.status === 'missed' ? 'missed' : 'in_progress') : kept ? 'kept' : 'missed';
        } else {
            const d = ms.evaluateDay({ dateKey: k, expenses: a.expenses, noSpendDays: a.noSpendDays, profile: a.profile, bills: a.bills });
            kept = d.kept;
            status = k === a.today ? (d.status === 'missed' ? 'missed' : 'in_progress') : kept ? 'kept' : 'missed';
        }
        return { dateKey: k, mission: assignment?.mission || locked.get(k)?.mission || null, difficulty: assignment?.difficulty || null, status };
    });
    const keptDays = missionDays.filter((d) => d.status === 'kept').map((d) => d.dateKey);
    let bestRun = 0;
    let run = 0;
    for (const d of missionDays) { run = d.status === 'kept' ? run + 1 : 0; bestRun = Math.max(bestRun, run); }

    // XP, Points, badges earned this week. A day's mission and expense rewards
    // count for the day they were for, even if paid after the day's grace period.
    const forWeek = (r) => {
        const dayRef = (r.reason === 'daily_mission' || r.reason === 'expense_logged') && /^\d{4}-\d{2}-\d{2}/.test(String(r.ref_key || ''));
        if (dayRef) { const k = String(r.ref_key).slice(0, 10); return k >= start && k <= end; }
        return Boolean(r.created_at) && inWeek(r.created_at);
    };
    const xpEarned = (a.xpRows || []).filter(forWeek).reduce((s, r) => s + (Number(r.xp) || 0), 0);
    const pointRows = (a.pointsRows || []).filter(forWeek);
    const pointsEarned = pointRows.filter((r) => r.points > 0).reduce((s, r) => s + r.points, 0);
    const pointsReversed = -pointRows.filter((r) => r.points < 0).reduce((s, r) => s + r.points, 0);
    const achievements = (a.badges || []).filter((b) => b.earned_at && inWeek(b.earned_at))
        .map((b) => ({ key: b.badge, title: s2e.BADGES[b.badge]?.title || b.badge, earnedAt: b.earned_at }));

    // Budget: the weekly goal for this week.
    const goal = ms.weeklyGoal({ mondayKey: start, expenses: a.expenses, noSpendDays: a.noSpendDays, profile: a.profile, today: a.today });
    const budgetStatus = goal.activeDays < goal.minActiveDays && complete ? 'not_enough_logging'
        : goal.spent > goal.limit ? 'over' : complete ? 'within' : 'on_track';

    // Categories against the same days of the week before.
    const span = days.length;
    const thisRows = rowsBetween(a.expenses, start, lastDay);
    const prevStart = ms.addDays(start, -7);
    const prevRows = rowsBetween(a.expenses, prevStart, ms.addDays(prevStart, span - 1));
    const loggedDays = (rows, from, n) => {
        const keys = new Set(rows.map((e) => keyOf(e.occurred_at)));
        for (let i = 0; i < n; i++) if (a.noSpendDays?.has(ms.addDays(from, i))) keys.add(ms.addDays(from, i));
        return keys.size;
    };
    const thisLogged = loggedDays(thisRows, start, span);
    const prevLogged = loggedDays(prevRows, prevStart, span);
    let categories;
    if (thisLogged < MIN_LOGGED_DAYS_TO_COMPARE || prevLogged < MIN_LOGGED_DAYS_TO_COMPARE) {
        categories = {
            available: false,
            reason: `Not enough logged days to compare (${thisLogged} this week, ${prevLogged} the week before; ${MIN_LOGGED_DAYS_TO_COMPARE} each are needed).`,
            changes: [],
        };
    } else {
        const now = byCategory(thisRows);
        const before = byCategory(prevRows);
        const names = new Set([...now.keys(), ...before.keys()]);
        const changes = [...names].map((c) => {
            const t = Math.round(now.get(c) || 0);
            const p = Math.round(before.get(c) || 0);
            return { category: c, thisWeek: t, lastWeek: p, change: t - p, percent: p > 0 ? Math.round(((t - p) / p) * 100) : null };
        }).filter((c) => c.change !== 0).sort((x, y) => Math.abs(y.change) - Math.abs(x.change)).slice(0, 4);
        categories = { available: true, comparedDays: span, changes };
    }

    // Savings (self-reported).
    const added = (a.contributions || []).filter((c) => { const k = String(c.contributed_on).slice(0, 10); return k >= start && k <= end; });
    const activeGoals = (a.goals || []).filter((g) => g.status !== 'archived').map((g) => {
        const saved = (a.contributions || []).filter((c) => c.goal_id === g.id).reduce((s, c) => s + (Number(c.amount_inr) || 0), 0);
        return { id: g.id, name: g.name, percent: Math.min(100, Math.floor((saved / Number(g.target_inr)) * 100)), savedInr: saved, targetInr: Number(g.target_inr) };
    });
    const savings = {
        addedInr: added.reduce((s, c) => s + (Number(c.amount_inr) || 0), 0),
        entries: added.length,
        goals: activeGoals,
        kind: 'self_reported',
    };

    // One thing to focus on next week.
    const rising = categories.available ? categories.changes.find((c) => c.change >= 300 && (c.percent === null || c.percent >= 20)) : null;
    const assigned = missionDays.filter((d) => d.status !== 'in_progress');
    const staleGoal = activeGoals.find((g) => g.percent < 100 && !added.some((c) => c.goal_id === g.id));
    let focus;
    if (thisLogged < 4) focus = { key: 'log_more', title: 'Log on at least 4 days', detail: 'Your numbers are only as good as your records. A quick entry each day is enough.' };
    else if (budgetStatus === 'over' && rising) focus = { key: 'category', title: `Bring ${rising.category} back down`, detail: `${rising.category} went up by ${inr(rising.change)} on the week before, and the week went over plan.` };
    else if (budgetStatus === 'over') focus = { key: 'budget', title: 'Get back within your weekly plan', detail: `This week's plan was ${inr(goal.limit)}. Missions at Easy can help you reset.` };
    else if (rising) focus = { key: 'category', title: `Keep an eye on ${rising.category}`, detail: `It went up by ${inr(rising.change)} on the week before.` };
    else if (assigned.length >= 3 && keptDays.length < assigned.length / 2) focus = { key: 'easier', title: 'Try Easy missions for a week', detail: 'Smaller steps you can keep beat bigger ones you can\'t.' };
    else if (staleGoal) focus = { key: 'goal', title: `Add something to ${staleGoal.name}`, detail: 'Even a small amount keeps the goal moving.' };
    else focus = { key: 'keep_going', title: 'Keep the streak going', detail: 'Same again next week: log daily and stay within plan.' };

    const budgetWords = { within: 'Within plan', on_track: 'On track', over: 'Over plan', not_enough_logging: 'Not enough logging to judge' }[budgetStatus];
    const weekLabel = label(start, end);

    return {
        week: { start, end, label: weekLabel, complete, daysCounted: days.length },
        missions: {
            days: missionDays,
            kept: keptDays.length,
            counted: assigned.length,
            inProgress: missionDays.some((d) => d.status === 'in_progress'),
        },
        xp: { earned: xpEarned },
        points: { earned: pointsEarned, reversed: pointsReversed },
        streak: { daysKept: keptDays.length, bestRun },
        budget: { limit: goal.limit, spent: goal.spent, activeDays: goal.activeDays, minActiveDays: goal.minActiveDays, status: budgetStatus, words: budgetWords },
        categories,
        savings,
        achievements,
        focus,
        level: { level: a.level.level, name: a.level.levelName },
        share: {
            title: `My Vittova week · ${weekLabel}`,
            stats: [
                { label: 'Missions kept', value: `${keptDays.length} of ${assigned.length || days.length}` },
                { label: 'XP earned', value: `+${xpEarned}` },
                { label: 'Points earned', value: `+${pointsEarned}` },
                { label: 'Best run', value: `${bestRun} day${bestRun === 1 ? '' : 's'}` },
            ],
            budget: budgetWords,
            level: `Level ${a.level.level} · ${a.level.levelName}`,
            badges: achievements.map((b) => b.title).slice(0, 3),
        },
    };
}

module.exports = { build, MIN_LOGGED_DAYS_TO_COMPARE };
