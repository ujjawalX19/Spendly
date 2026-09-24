/**
 * challengeRules — how Vittova decides whether a sponsored money challenge
 * was completed. Pure: the user's own expense rows and dates in, a result out.
 *
 * Every challenge rewards spending less or more carefully, never more. A
 * challenge needs the user to keep logging (or to mark no-spend days), so
 * logging nothing cannot "pass" a challenge. The sponsor never sees any of
 * these rows: only campaign-level counts leave Vittova (lib/campaigns).
 *
 * Timing: a challenge runs on whole IST calendar days, starting the day after
 * joining (today's spending is already known). It is judged once, after a
 * grace day for late logging. A rule broken during the run is locked as
 * failed, so deleting that expense afterwards cannot undo it.
 */

const appTime = require('./appTime');
const { addDays, dayStart } = require('./moneyStreak');

/** Merchants that are food delivery (not groceries). Matched on the description. */
const FOOD_DELIVERY = /\b(swiggy(?!\s*(instamart|genie))|zomato(?!\s*(hyperpure))|eatsure|faasos|box8|behrouz|oven story|domino'?s|dominos|pizza hut|kfc|mcdonald'?s?|burger king|eat ?fit|freshmenu|magicpin food)\b/i;
const IMPULSE_CATEGORIES = new Set(['Shopping', 'Entertainment']);
/** Share of challenge days that must have a logged expense or a no-spend mark. */
const MIN_ACTIVE_SHARE = 0.6;

const TYPES = {
    no_food_delivery: {
        title: (p, days) => `${days}-Day Zero Food-Delivery Challenge`,
        rule: () => 'No food-delivery orders (Swiggy, Zomato and similar) during the challenge. Groceries are fine.',
        defaults: { days: 7 },
    },
    home_food: {
        title: (p, days) => `${days}-Day Home Food Challenge`,
        rule: () => 'Eat at home: no food-delivery orders during the challenge.',
        defaults: { days: 5 },
    },
    no_impulse: {
        title: (p, days) => `${days}-Day No Impulse Purchase Challenge`,
        rule: () => 'No Shopping or Entertainment spending during the challenge.',
        defaults: { days: 7 },
    },
    daily_target: {
        title: (p) => `Stay Under ₹${Number(p.dailyTarget).toLocaleString('en-IN')} a Day`,
        rule: (p) => `Keep every day's spending at or under ₹${Number(p.dailyTarget).toLocaleString('en-IN')}.`,
        defaults: { days: 7 },
    },
    weekend_budget: {
        title: (p) => `Weekend Under ₹${Number(p.weekendBudget).toLocaleString('en-IN')}`,
        rule: (p) => `Keep Saturday and Sunday spending together at or under ₹${Number(p.weekendBudget).toLocaleString('en-IN')}.`,
        defaults: { days: 7 },
    },
    spend_less: {
        title: (p, days) => `Spend ₹${Number(p.amount).toLocaleString('en-IN')} Less in ${days} Days`,
        rule: (p, days) => `Spend at least ₹${Number(p.amount).toLocaleString('en-IN')} less than your usual ${days}-day spending (your average from the last 8 weeks).`,
        defaults: { days: 7 },
    },
};

const CHALLENGE_TYPES = Object.keys(TYPES);

const sum = (rows) => rows.reduce((s, e) => s + (Number(e.amount) || 0), 0);
const keyOf = (iso) => appTime.localDateKey(new Date(iso));

/** The IST calendar days of an enrollment: starts the day after joining. */
function windowFor(enrolledAt, days) {
    const startsOn = addDays(keyOf(enrolledAt), 1);
    return { startsOn, endsOn: addDays(startsOn, days - 1) };
}

function inWindow(rows, startsOn, endsOn) {
    const from = dayStart(startsOn).getTime();
    const to = dayStart(addDays(endsOn, 1)).getTime();
    return rows.filter((e) => { const t = new Date(e.occurred_at).getTime(); return t >= from && t < to; });
}

/** The user's average spending for a `days`-long stretch over the 8 weeks before `startsOn`. */
function baselineFor(expenses, startsOn, days) {
    const from = dayStart(addDays(startsOn, -56)).getTime();
    const to = dayStart(startsOn).getTime();
    const rows = expenses.filter((e) => { const t = new Date(e.occurred_at).getTime(); return t >= from && t < to; });
    const firstDay = rows.length ? keyOf(rows.reduce((a, b) => (a.occurred_at < b.occurred_at ? a : b)).occurred_at) : null;
    // Need four weeks of history for a fair "usual".
    if (!firstDay || firstDay > addDays(startsOn, -28)) return null;
    return Math.round((sum(rows) / 56) * days);
}

/**
 * Can this user join? (Only spend_less needs history.)
 * @returns {{eligible:boolean, reason?:string}}
 */
function eligibility(type, params, { expenses, now, days }) {
    if (type !== 'spend_less') return { eligible: true };
    const { startsOn } = windowFor(now.toISOString(), days);
    const baseline = baselineFor(expenses, startsOn, days);
    if (baseline === null) return { eligible: false, reason: 'This challenge needs about four weeks of logged spending first.' };
    if (baseline < Number(params.amount) * 1.5) return { eligible: false, reason: 'Your usual spending is too low for this challenge to be meaningful.' };
    return { eligible: true };
}

/**
 * Judge a challenge.
 *
 * @param {object} args
 * @param {string} args.type
 * @param {object} args.params         { dailyTarget } | { weekendBudget } | { amount }
 * @param {number} args.days
 * @param {string} args.enrolledAt     ISO time the user joined
 * @param {Array}  args.expenses       rows covering the window (and 8 weeks before, for spend_less)
 * @param {Set<string>} args.noSpendDays
 * @param {Date}   args.now
 * @returns {{status:'upcoming'|'in_progress'|'completed'|'failed', startsOn, endsOn, day:number, days:number, activeDays:number, activeNeeded:number, reason?:string, judgeOn:string}}
 */
function evaluate({ type, params = {}, days, enrolledAt, expenses = [], noSpendDays = new Set(), now = new Date() }) {
    const today = appTime.localDateKey(now);
    const { startsOn, endsOn } = windowFor(enrolledAt, days);
    const judgeOn = addDays(endsOn, 2); // one grace day after the last day
    const rows = inWindow(expenses, startsOn, endsOn);
    const lastSeen = today < endsOn ? today : endsOn;
    const soFar = today < startsOn ? [] : inWindow(rows, startsOn, lastSeen);

    const activeDaySet = new Set(rows.map((e) => keyOf(e.occurred_at)));
    for (let k = startsOn; k <= endsOn; k = addDays(k, 1)) if (noSpendDays.has(k)) activeDaySet.add(k);
    const activeDays = activeDaySet.size;
    const activeNeeded = Math.ceil(days * MIN_ACTIVE_SHARE);
    const day = today < startsOn ? 0 : Math.min(days, 1 + Math.round((dayStart(today) - dayStart(startsOn)) / 86400000));
    const base = { startsOn, endsOn, judgeOn, day, days, activeDays, activeNeeded };

    if (today < startsOn) return { ...base, status: 'upcoming' };

    // Rules that can be broken during the run (locked by the caller once seen).
    let broken = null;
    if (type === 'no_food_delivery' || type === 'home_food') {
        if (soFar.some((e) => FOOD_DELIVERY.test(String(e.description || '')))) broken = 'A food-delivery order was logged during the challenge.';
    } else if (type === 'no_impulse') {
        if (soFar.some((e) => IMPULSE_CATEGORIES.has(e.category))) broken = 'Shopping or Entertainment spending was logged during the challenge.';
    } else if (type === 'daily_target') {
        const byDay = new Map();
        for (const e of soFar) byDay.set(keyOf(e.occurred_at), (byDay.get(keyOf(e.occurred_at)) || 0) + Number(e.amount));
        if ([...byDay.values()].some((v) => v > Number(params.dailyTarget))) broken = 'One day went over the daily target.';
    } else if (type === 'weekend_budget') {
        const weekend = soFar.filter((e) => { const d = new Date(`${keyOf(e.occurred_at)}T12:00:00Z`).getUTCDay(); return d === 0 || d === 6; });
        if (sum(weekend) > Number(params.weekendBudget)) broken = 'Weekend spending went over the budget.';
    }
    if (broken) return { ...base, status: 'failed', reason: broken };

    if (today < judgeOn) return { ...base, status: 'in_progress' };

    // Judged once, after the grace day.
    if (activeDays < activeNeeded) return { ...base, status: 'failed', reason: `Spending was logged on ${activeDays} of the ${activeNeeded} days needed.` };
    if (type === 'spend_less') {
        const baseline = baselineFor(expenses, startsOn, days);
        if (baseline === null) return { ...base, status: 'failed', reason: 'Not enough spending history to compare with.' };
        const spent = Math.round(sum(rows));
        if (spent > baseline - Number(params.amount)) return { ...base, status: 'failed', reason: `Spent ₹${spent.toLocaleString('en-IN')} against a target of ₹${(baseline - Number(params.amount)).toLocaleString('en-IN')}.` };
    }
    if (type === 'weekend_budget') {
        let hasWeekend = false;
        for (let k = startsOn; k <= endsOn; k = addDays(k, 1)) { const d = new Date(`${k}T12:00:00Z`).getUTCDay(); if (d === 0 || d === 6) hasWeekend = true; }
        if (!hasWeekend) return { ...base, status: 'failed', reason: 'The challenge did not include a weekend.' };
    }
    return { ...base, status: 'completed' };
}

/** Title and rule text for display. */
function describe(type, params, days) {
    const t = TYPES[type];
    return { title: t.title(params, days), rule: t.rule(params, days) };
}

module.exports = { CHALLENGE_TYPES, TYPES, FOOD_DELIVERY, evaluate, eligibility, describe, windowFor, MIN_ACTIVE_SHARE };
