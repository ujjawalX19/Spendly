/**
 * saveToEarn — personal Money Challenges, the Victory Pot, badges and
 * challenge recommendations. Pure: rows and `now` in, results out.
 *
 * Builds on what already exists instead of duplicating it:
 *   - lib/challengeRules  judges a challenge window (the same engine the
 *                         sponsored challenges use), on IST calendar days;
 *   - lib/moneyStreak     streak, daily mission, XP and levels;
 *   - lib/moneyXp         the idempotent XP ledger.
 *
 * PRINCIPLES
 *   - Every challenge rewards spending less or more carefully. Nothing rewards
 *     spending more, borrowing or investing, and nothing is chance-based.
 *   - A user has at most ONE active personal challenge. That keeps the loop
 *     simple and means the Victory Pot never counts the same spending twice.
 *   - The Victory Pot is an ESTIMATE of spending avoided, never cash: for each
 *     completed challenge, (the user's usual spending for that kind of thing
 *     over the same number of days, from the 8 weeks before) − (what they
 *     actually spent). If there isn't four weeks of history, no estimate is
 *     made (impact null), rather than inventing one.
 *   - No-shame wording: a challenge that doesn't work out is "not completed",
 *     never "failed" in anything the user reads.
 */

const appTime = require('./appTime');
const rules = require('./challengeRules');
const { addDays, dayStart } = require('./moneyStreak');

const HISTORY_DAYS = 56;
const MIN_HISTORY_DAYS = 28;

/** Cab/ride-hailing merchants, matched on the description. */
const CAB = /\b(uber|ola(?!\s*electric)|rapido|blu ?smart|meru|quick ?ride|namma yatri|cab|taxi)\b/i;
const IMPULSE_CATEGORIES = new Set(['Shopping', 'Entertainment']);

const sum = (rows) => rows.reduce((s, e) => s + (Number(e.amount) || 0), 0);
const keyOf = (iso) => appTime.localDateKey(new Date(iso));
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

/**
 * Templates a user can start. `rule` reuses a challengeRules type, or one of the
 * two personal-only rules below (log_daily, no_cab). `pro` templates need Pro.
 * `impact` picks which spending the estimate compares.
 */
const TEMPLATES = {
    no_food_delivery_7: { rule: 'no_food_delivery', days: 7, pro: false, category: 'Food', impact: 'food_delivery', xp: 75,
        title: '7-Day Zero Food Delivery', why: 'Food delivery is one of the easiest costs to cut back on.' },
    no_impulse_5: { rule: 'no_impulse', days: 5, pro: false, category: 'Shopping', impact: 'impulse', xp: 75,
        title: '5-Day No Impulse Purchase', why: 'A short pause on Shopping and Entertainment shows how much of it was unplanned.' },
    daily_target_7: { rule: 'daily_target', days: 7, pro: false, category: 'Everyday', impact: 'all', xp: 75,
        title: 'Stay Under Your Daily Limit', why: 'A daily limit keeps the whole month on track, one day at a time.' },
    log_daily_7: { rule: 'log_daily', days: 7, pro: false, category: 'Habit', impact: null, xp: 50,
        title: 'Log Every Expense for 7 Days', why: 'Every Vittova answer is only as good as your records.' },
    spend_less_500: { rule: 'spend_less', days: 7, pro: false, category: 'Savings', impact: 'all', xp: 75, params: { amount: 500 },
        title: '₹500 Savings Sprint', why: 'Spend ₹500 less than a usual week and keep that money in your pocket.' },
    spend_less_1000: { rule: 'spend_less', days: 7, pro: true, category: 'Savings', impact: 'all', xp: 100, params: { amount: 1000 },
        title: '₹1,000 Savings Sprint', why: 'A bigger sprint for when your spending has room to trim.' },
    weekend_budget_7: { rule: 'weekend_budget', days: 7, pro: true, category: 'Weekend', impact: 'weekend', xp: 75,
        title: 'Stay Within Weekend Budget', why: 'Weekends are where plans most often slip.' },
    no_cab_weekend: { rule: 'no_cab', days: 7, pro: true, category: 'Transport', impact: 'cab_weekend', xp: 75,
        title: 'No-Cab Weekend', why: 'Try metro, bus, walking or sharing this weekend.' },
    no_food_delivery_14: { rule: 'no_food_delivery', days: 14, pro: true, category: 'Food', impact: 'food_delivery', xp: 100,
        title: '14-Day Zero Food Delivery', why: 'Two weeks is long enough to turn it into a habit.' },
};
const TEMPLATE_KEYS = Object.keys(TEMPLATES);

const BADGES = {
    first_challenge: { title: 'First Challenge', icon: '🏅', desc: 'Completed your first money challenge.' },
    streak_7: { title: '7-Day Streak', icon: '🔥', desc: 'Kept your Money Streak for 7 days.' },
    saved_500: { title: '₹500 Saved', icon: '💰', desc: 'Your Victory Pot passed an estimated ₹500.' },
    budget_keeper: { title: 'Budget Keeper', icon: '🎯', desc: 'Finished a month within your budget.' },
    smart_decision: { title: 'Smart Decision', icon: '🧠', desc: 'Completed a no-impulse-purchase challenge.' },
    habit_30: { title: '30-Day Habit', icon: '📅', desc: 'Kept your Money Streak for 30 days.' },
};
const BADGE_KEYS = Object.keys(BADGES);

/** The rule parameters a template runs with, personalised where needed. */
function paramsFor(templateKey, { dailyLimit } = {}) {
    const t = TEMPLATES[templateKey];
    if (t.rule === 'daily_target') return { dailyTarget: Math.max(100, Math.round((Number(dailyLimit) || 500) / 10) * 10) };
    if (t.rule === 'weekend_budget') return { weekendBudget: Math.max(300, Math.round(((Number(dailyLimit) || 500) * 2) / 50) * 50) };
    return { ...(t.params || {}) };
}

function describe(templateKey, params) {
    const t = TEMPLATES[templateKey];
    if (t.rule === 'log_daily') return { title: t.title, rule: `Log at least one expense, or mark a no-spend day, on each of the ${t.days} days.` };
    if (t.rule === 'no_cab') return { title: t.title, rule: 'No cab or ride-hailing trips (Uber, Ola, Rapido and similar) on Saturday or Sunday during the challenge.' };
    const d = rules.describe(t.rule, params, t.days);
    return { title: t.rule === 'daily_target' ? `Stay Under ${inr(params.dailyTarget)} a Day` : t.title, rule: d.rule };
}

function windowRows(rows, startsOn, endsOn) {
    const from = dayStart(startsOn).getTime();
    const to = dayStart(addDays(endsOn, 1)).getTime();
    return rows.filter((e) => { const t = new Date(e.occurred_at).getTime(); return t >= from && t < to; });
}

const isWeekend = (key) => { const d = new Date(`${key}T12:00:00Z`).getUTCDay(); return d === 0 || d === 6; };

/** Which rows an impact estimate compares, per template. */
function impactRows(kind, rows) {
    if (kind === 'food_delivery') return rows.filter((e) => rules.FOOD_DELIVERY.test(String(e.description || '')));
    if (kind === 'impulse') return rows.filter((e) => IMPULSE_CATEGORIES.has(e.category));
    if (kind === 'weekend') return rows.filter((e) => isWeekend(keyOf(e.occurred_at)));
    if (kind === 'cab_weekend') return rows.filter((e) => isWeekend(keyOf(e.occurred_at)) && CAB.test(String(e.description || '')));
    return rows;
}

/**
 * Estimated spending avoided for a completed challenge.
 * @returns {{impact:number|null, baseline:number|null, actual:number, explained:string}}
 */
function estimateImpact(templateKey, { expenses, startsOn, endsOn }) {
    const t = TEMPLATES[templateKey];
    const days = t.days;
    const actual = Math.round(sum(impactRows(t.impact, windowRows(expenses, startsOn, endsOn))));
    if (!t.impact) return { impact: null, baseline: null, actual, explained: 'This challenge builds a habit; it has no spending estimate.' };
    const histFrom = addDays(startsOn, -HISTORY_DAYS);
    const history = windowRows(expenses, histFrom, addDays(startsOn, -1));
    const firstDay = history.length ? history.map((e) => keyOf(e.occurred_at)).sort()[0] : null;
    if (!firstDay || firstDay > addDays(startsOn, -MIN_HISTORY_DAYS)) {
        return { impact: null, baseline: null, actual, explained: 'Not estimated: it needs about four weeks of spending history to compare with.' };
    }
    const baseline = Math.round((sum(impactRows(t.impact, history)) / HISTORY_DAYS) * days);
    const impact = Math.max(0, baseline - actual);
    return {
        impact,
        baseline,
        actual,
        explained: `Your usual ${days}-day spending here (average of the 8 weeks before): ${inr(baseline)}. This time: ${inr(actual)}. Estimated spending avoided: ${inr(impact)}.`,
    };
}

/**
 * Judge an active personal challenge. Reuses challengeRules for the shared
 * rule types; log_daily and no_cab are judged here with the same timing:
 * starts the day after joining, one grace day, a broken rule locks as not completed.
 */
function evaluate({ templateKey, params, enrolledAt, expenses, noSpendDays = new Set(), now = new Date() }) {
    const t = TEMPLATES[templateKey];
    if (t.rule !== 'log_daily' && t.rule !== 'no_cab') {
        return rules.evaluate({ type: t.rule, params, days: t.days, enrolledAt, expenses, noSpendDays, now });
    }
    const today = appTime.localDateKey(now);
    const { startsOn, endsOn } = rules.windowFor(enrolledAt, t.days);
    const judgeOn = addDays(endsOn, 2);
    const rows = windowRows(expenses, startsOn, endsOn);
    const active = new Set(rows.map((e) => keyOf(e.occurred_at)));
    for (let k = startsOn; k <= endsOn; k = addDays(k, 1)) if (noSpendDays.has(k)) active.add(k);
    const day = today < startsOn ? 0 : Math.min(t.days, 1 + Math.round((dayStart(today) - dayStart(startsOn)) / 86400000));
    const activeNeeded = t.rule === 'log_daily' ? t.days : Math.ceil(t.days * rules.MIN_ACTIVE_SHARE);
    const base = { startsOn, endsOn, judgeOn, day, days: t.days, activeDays: active.size, activeNeeded };
    if (today < startsOn) return { ...base, status: 'upcoming' };
    if (t.rule === 'no_cab') {
        const lastSeen = today < endsOn ? today : endsOn;
        if (windowRows(rows, startsOn, lastSeen).some((e) => isWeekend(keyOf(e.occurred_at)) && CAB.test(String(e.description || '')))) {
            return { ...base, status: 'failed', reason: 'A cab trip was logged on the weekend.' };
        }
    }
    if (today < judgeOn) return { ...base, status: 'in_progress' };
    if (active.size < activeNeeded) {
        return { ...base, status: 'failed', reason: t.rule === 'log_daily' ? `Logged on ${active.size} of ${t.days} days.` : `Spending was logged on ${active.size} of the ${activeNeeded} days needed.` };
    }
    return { ...base, status: 'completed' };
}

/** Can this user start this template now? */
function canStart(templateKey, { isPro, expenses, now, activeCount }) {
    const t = TEMPLATES[templateKey];
    if (!t) return { ok: false, code: 'UNKNOWN_CHALLENGE', message: 'That challenge does not exist.' };
    if (activeCount > 0) return { ok: false, code: 'CHALLENGE_ACTIVE', message: 'Finish or skip your current challenge first.' };
    if (t.pro && !isPro) return { ok: false, code: 'PRO_REQUIRED', message: 'This challenge is part of Vittova Pro.' };
    if (t.rule === 'spend_less') {
        const e = rules.eligibility('spend_less', t.params, { expenses, now, days: t.days });
        if (!e.eligible) return { ok: false, code: 'NOT_ELIGIBLE', message: e.reason };
    }
    return { ok: true };
}

/**
 * One recommendation from the user's own recent spending, with the reason.
 * Compares the last 28 days with the 28 before. Never recommends a Pro
 * template to a free user, and falls back to a habit challenge.
 */
function recommend({ expenses, now = new Date(), isPro }) {
    const today = appTime.localDateKey(now);
    const recent = windowRows(expenses, addDays(today, -27), today);
    const before = windowRows(expenses, addDays(today, -55), addDays(today, -28));
    const food = (r) => sum(impactRows('food_delivery', r));
    const impulse = (r) => sum(impactRows('impulse', r));
    const weekend = (r) => sum(impactRows('weekend', r));
    const total = sum(recent);
    const pick = (key, reason) => ({ template: key, reason });
    if (food(recent) >= 300 && food(recent) > food(before) * 1.15) return pick('no_food_delivery_7', `Food delivery is up to ${inr(food(recent))} in the last 4 weeks.`);
    if (isPro && total > 0 && weekend(recent) / total > 0.45) return pick('weekend_budget_7', 'Weekends make up almost half of your recent spending.');
    if (impulse(recent) >= 500 && impulse(recent) > impulse(before) * 1.15) return pick('no_impulse_5', `Shopping and Entertainment are up to ${inr(impulse(recent))} in the last 4 weeks.`);
    const loggedDays = new Set(recent.map((e) => keyOf(e.occurred_at))).size;
    if (loggedDays < 12) return pick('log_daily_7', 'More complete records make every Vittova answer more accurate.');
    return pick('daily_target_7', 'Your spending is steady. A daily limit keeps it that way.');
}

/**
 * Badges earned from server-side facts. Returns badge keys; the caller stores
 * new ones (unique per user and badge).
 */
function earnedBadges({ completed = [], victoryPot = 0, longestStreak = 0, ledgerReasons = new Set() }) {
    const out = [];
    if (completed.length >= 1) out.push('first_challenge');
    if (longestStreak >= 7) out.push('streak_7');
    if (victoryPot >= 500) out.push('saved_500');
    if (ledgerReasons.has('month_within_budget')) out.push('budget_keeper');
    if (completed.some((c) => TEMPLATES[c.template]?.rule === 'no_impulse')) out.push('smart_decision');
    if (longestStreak >= 30) out.push('habit_30');
    return out;
}

/** Victory Pot: sum of estimated impacts, all-time and this month (by completion). */
function victoryPot(completed, now = new Date()) {
    const monthStart = appTime.startOfMonth(now).getTime();
    let total = 0;
    let thisMonth = 0;
    for (const c of completed) {
        const v = Math.max(0, Number(c.impact_inr) || 0);
        total += v;
        if (c.judged_at && new Date(c.judged_at).getTime() >= monthStart) thisMonth += v;
    }
    return { total: Math.round(total), thisMonth: Math.round(thisMonth) };
}

module.exports = {
    TEMPLATES, TEMPLATE_KEYS, BADGES, BADGE_KEYS, CAB,
    paramsFor, describe, evaluate, estimateImpact, canStart, recommend, earnedBadges, victoryPot, windowRows,
};
