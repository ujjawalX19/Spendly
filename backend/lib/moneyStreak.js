/**
 * moneyStreak — Money Streak, daily money missions, Money XP and levels.
 *
 * One mission a day. Completing it keeps the streak alive. Missions reward
 * responsible behaviour only: logging honestly, staying within the day's
 * Safe-to-Spend, skipping unplanned spending, and no-spend days. Nothing here
 * rewards spending more, borrowing or investing.
 *
 * A day counts only if the user showed up: at least one expense logged for it,
 * or the day marked as a no-spend day. "Stay under today's limit" cannot be
 * passed by logging nothing.
 *
 * ANTI-TAMPERING
 *  - Everything is computed on the server from the user's own rows.
 *  - XP is a ledger with a unique key per award (lib + database constraint):
 *    the same day, week, month, milestone or expense slot can never pay twice.
 *  - Logging XP is capped per local day by *creation* time, so deleting and
 *    re-creating expenses earns nothing more.
 *  - A day is locked (stored in money_streak_days) once it is two days old.
 *    Until then it is re-evaluated, so yesterday's spending can still be
 *    logged; after that, editing old expenses cannot rewrite the streak.
 *
 * Pure: rows and `now` in, results out. Calendar days are app-timezone (IST)
 * days from lib/appTime; the day's limit is lib/safeToSpend.
 */

const appTime = require('./appTime');
const { computeSafeToSpend, effectiveMonthlyBudget } = require('./safeToSpend');

const DAY_MS = 86400000;

const XP = {
    expense_logged: 5,
    daily_mission: 20,
    weekly_goal: 50,
    month_within_budget: 30,
    streak_milestone: 100,
};
const EXPENSE_XP_DAILY_CAP = 3;
const STREAK_MILESTONE_DAYS = 7;
/** Days re-evaluated live before being locked: today and yesterday. */
const GRACE_DAYS = 1;
/** How far back an absent user's days are filled in when they return. */
const BACKFILL_DAYS = 30;
const WEEKLY_GOAL_MIN_ACTIVE_DAYS = 4;
const MONTH_GOAL_MIN_ACTIVE_DAYS = 10;

const LEVELS = [
    { level: 1, name: 'Money Starter', minXp: 0 },
    { level: 2, name: 'Budget Builder', minXp: 250 },
    { level: 3, name: 'Money Smart', minXp: 750 },
    { level: 4, name: 'Money Master', minXp: 2000 },
];

const IMPULSE_CATEGORIES = new Set(['Shopping', 'Entertainment']);
const ROTATION = ['under_limit', 'log_today', 'no_impulse'];

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

// ─── Calendar keys ──────────────────────────────────────────────────────────

function keyParts(key) {
    const [year, month, day] = String(key).split('-').map(Number);
    return { year, month, day };
}

/** Local midnight at the start of the calendar day `key` ('YYYY-MM-DD'). */
function dayStart(key) {
    const { year, month, day } = keyParts(key);
    return appTime.zonedTimeToUtc(year, month, day, 0, 0, 0);
}

/** `key` shifted by `n` calendar days. */
function addDays(key, n) {
    const { year, month, day } = keyParts(key);
    return new Date(Date.UTC(year, month - 1, day + n, 12)).toISOString().slice(0, 10);
}

/** Whole calendar days from key a to key b. */
function daysBetween(a, b) {
    const pa = keyParts(a);
    const pb = keyParts(b);
    return Math.round((Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day)) / DAY_MS);
}

/** Monday of the week containing `key`. */
function weekStart(key) {
    const { year, month, day } = keyParts(key);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
    return addDays(key, -((weekday + 6) % 7));
}

const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ─── Missions ───────────────────────────────────────────────────────────────

function missionText(id, limit) {
    switch (id) {
        case 'under_limit':
            return { id, title: "Stay under today's spending limit", detail: `Keep today's spending within ${inr(limit)}, and log what you spend so it counts.` };
        case 'log_today':
            return { id, title: "Log today's spending", detail: 'Add at least one expense today, or mark today as a no-spend day.' };
        case 'no_impulse':
            return { id, title: 'Skip unplanned spending today', detail: 'No Shopping or Entertainment today. Log what you do spend so it counts.' };
        case 'no_spend':
        default:
            return { id: 'no_spend', title: 'Make today a no-spend day', detail: "This month's safe-to-spend is used up. Spend nothing today and mark it as a no-spend day." };
    }
}

/** The mission for a calendar day. The same for everyone on a given day. */
function missionFor(key, dailyLimit) {
    const { year, month, day } = keyParts(key);
    const index = Math.floor(Date.UTC(year, month - 1, day) / DAY_MS) % ROTATION.length;
    const id = ROTATION[index];
    return id === 'under_limit' && !(dailyLimit > 0) ? 'no_spend' : id;
}

/**
 * Evaluate one calendar day from the user's rows.
 *
 * @param {object} args
 * @param {string} args.dateKey
 * @param {Array}  args.expenses   rows with amount, category, occurred_at (must cover the day's month)
 * @param {Set}    args.noSpendDays date keys the user marked as no-spend
 * @param {object} args.profile    monthly_budget, investment_target
 * @param {Array}  args.bills
 */
function evaluateDay({ dateKey, expenses, noSpendDays, profile, bills }) {
    const start = dayStart(dateKey).getTime();
    const end = dayStart(addDays(dateKey, 1)).getTime();
    const monthStart = appTime.startOfMonth(new Date(start + 12 * 3600 * 1000)).getTime();
    const t = (e) => new Date(e.occurred_at).getTime();

    const spentBefore = expenses.filter((e) => t(e) >= monthStart && t(e) < start).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const limit = computeSafeToSpend({
        monthlyBudget: effectiveMonthlyBudget(profile),
        totalSpent: spentBefore,
        bills,
        investmentTarget: Number(profile?.investment_target) || 0,
        now: new Date(start + 12 * 3600 * 1000),
    }).daily;

    const rows = expenses.filter((e) => t(e) >= start && t(e) < end);
    const spent = Math.round(rows.reduce((s, e) => s + (Number(e.amount) || 0), 0));
    const noSpend = noSpendDays.has(dateKey) && rows.length === 0;
    const active = rows.length > 0 || noSpend;
    const impulse = rows.some((e) => IMPULSE_CATEGORIES.has(e.category));

    const mission = missionFor(dateKey, limit);
    const kept = mission === 'log_today' ? active
        : mission === 'under_limit' ? active && spent <= limit
            : mission === 'no_impulse' ? active && !impulse
                : noSpend;

    // What the day looks like while it is still running.
    let status;
    if (kept) status = mission === 'log_today' || mission === 'no_spend' ? 'done' : 'on_track';
    else if (!active) status = 'to_do';
    else status = 'missed'; // over the limit, or an impulse category, already today

    return { dateKey, mission, limit, spent, active, noSpend, kept, status, transactions: rows.length };
}

// ─── Streak ─────────────────────────────────────────────────────────────────

/**
 * @param {Map<string, boolean>} keptByDay  every evaluated day (locked + live)
 * @param {string} today
 * @param {string} startedOn
 * @returns {{current:number, longest:number, completedRun:{length:number, startKey:string|null}}}
 */
function computeStreak(keptByDay, today, startedOn) {
    const runEndingAt = (key) => {
        let length = 0;
        let cursor = key;
        while (cursor >= startedOn && keptByDay.get(cursor) === true) {
            length += 1;
            cursor = addDays(cursor, -1);
        }
        return { length, startKey: length ? addDays(cursor, 1) : null };
    };

    const yesterday = addDays(today, -1);
    const completedRun = runEndingAt(yesterday);
    const current = keptByDay.get(today) === true ? completedRun.length + 1 : completedRun.length;

    let longest = 0;
    let run = 0;
    for (let key = startedOn; key <= today; key = addDays(key, 1)) {
        run = keptByDay.get(key) === true ? run + 1 : 0;
        longest = Math.max(longest, run);
    }
    return { current, longest, completedRun };
}

/** Mon–Sun of the current week, for the streak dots. */
function weekView(keptByDay, today, startedOn) {
    const monday = weekStart(today);
    return WEEKDAY.map((weekday, i) => {
        const dateKey = addDays(monday, i);
        let status;
        if (dateKey > today) status = 'upcoming';
        else if (dateKey < startedOn) status = 'not_started';
        else if (dateKey === today) status = keptByDay.get(dateKey) ? 'kept' : 'today';
        else status = keptByDay.get(dateKey) ? 'kept' : 'missed';
        return { dateKey, weekday, status };
    });
}

// ─── Weekly and monthly goals ───────────────────────────────────────────────

/** Weekly goal: spend within the week's share of the budget, on at least 4 logged days. */
function weeklyGoal({ mondayKey, expenses, noSpendDays, profile, today }) {
    const budget = effectiveMonthlyBudget(profile);
    const daysInMonth = appTime.daysInMonth(new Date(dayStart(mondayKey).getTime() + 12 * 3600 * 1000));
    const limit = Math.round((budget * 7) / daysInMonth);
    const start = dayStart(mondayKey).getTime();
    const end = dayStart(addDays(mondayKey, 7)).getTime();
    const rows = expenses.filter((e) => { const x = new Date(e.occurred_at).getTime(); return x >= start && x < end; });
    const spent = Math.round(rows.reduce((s, e) => s + (Number(e.amount) || 0), 0));

    const activeDays = new Set(rows.map((e) => appTime.localDateKey(new Date(e.occurred_at))));
    for (let i = 0; i < 7; i++) {
        const k = addDays(mondayKey, i);
        if (noSpendDays.has(k) && !activeDays.has(k)) activeDays.add(k);
    }
    const ended = addDays(mondayKey, 6) < today;
    const achieved = spent <= limit && activeDays.size >= WEEKLY_GOAL_MIN_ACTIVE_DAYS;
    return {
        weekStart: mondayKey,
        limit,
        spent,
        activeDays: activeDays.size,
        minActiveDays: WEEKLY_GOAL_MIN_ACTIVE_DAYS,
        ended,
        achieved: ended && achieved,
        status: spent > limit ? 'over' : 'on_track',
    };
}

/** Month goal: the month closed within budget, with at least 10 logged days. */
function monthGoal({ monthStartKey, expenses, noSpendDays, profile }) {
    const start = dayStart(monthStartKey);
    const next = appTime.startOfNextMonth(new Date(start.getTime() + 12 * 3600 * 1000));
    const rows = expenses.filter((e) => { const x = new Date(e.occurred_at).getTime(); return x >= start.getTime() && x < next.getTime(); });
    const spent = rows.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const days = new Set(rows.map((e) => appTime.localDateKey(new Date(e.occurred_at))));
    for (const k of noSpendDays) if (k >= monthStartKey && dayStart(k) < next) days.add(k);
    return { achieved: spent <= effectiveMonthlyBudget(profile) && days.size >= MONTH_GOAL_MIN_ACTIVE_DAYS, activeDays: days.size, spent: Math.round(spent) };
}

// ─── XP and levels ──────────────────────────────────────────────────────────

function levelFor(totalXp) {
    const xp = Math.max(0, Number(totalXp) || 0);
    let current = LEVELS[0];
    for (const l of LEVELS) if (xp >= l.minXp) current = l;
    const next = LEVELS.find((l) => l.minXp > xp) || null;
    const progressPercent = next ? Math.floor(((xp - current.minXp) / (next.minXp - current.minXp)) * 100) : 100;
    return {
        total: xp,
        level: current.level,
        levelName: current.name,
        nextLevel: next ? { level: next.level, name: next.name, at: next.minXp, xpToGo: next.minXp - xp } : null,
        progressPercent,
    };
}

/**
 * The ledger rows the user has earned and may not have been given yet.
 * Idempotent: the ledger's unique (reason, ref_key) makes a repeat a no-op.
 */
function awardsDue({ endedDays, completedRun, lastWeek, lastMonth }) {
    const awards = [];
    for (const d of endedDays) if (d.kept) awards.push({ reason: 'daily_mission', ref_key: d.dateKey, xp: XP.daily_mission });
    if (completedRun.length >= STREAK_MILESTONE_DAYS) {
        for (let n = STREAK_MILESTONE_DAYS; n <= completedRun.length; n += STREAK_MILESTONE_DAYS) {
            awards.push({ reason: 'streak_milestone', ref_key: `${completedRun.startKey}:${n}`, xp: XP.streak_milestone });
        }
    }
    if (lastWeek && lastWeek.achieved) awards.push({ reason: 'weekly_goal', ref_key: lastWeek.weekStart, xp: XP.weekly_goal });
    if (lastMonth && lastMonth.achieved) awards.push({ reason: 'month_within_budget', ref_key: lastMonth.monthKey, xp: XP.month_within_budget });
    return awards;
}

module.exports = {
    XP,
    EXPENSE_XP_DAILY_CAP,
    STREAK_MILESTONE_DAYS,
    GRACE_DAYS,
    BACKFILL_DAYS,
    LEVELS,
    addDays,
    daysBetween,
    weekStart,
    dayStart,
    missionFor,
    missionText,
    evaluateDay,
    computeStreak,
    weekView,
    weeklyGoal,
    monthGoal,
    levelFor,
    awardsDue,
};
