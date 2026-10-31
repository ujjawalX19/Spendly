/**
 * goals — savings goals (v1.14). Pure: goal and contribution rows in, progress
 * and milestone rewards out. Database work is in routes/goals.js.
 *
 * WHAT COUNTS AS SAVED
 *   Only amounts the user says they put aside (savings_contributions, source
 *   'self_reported'). Vittova cannot see bank balances, so progress is always
 *   labelled self-reported. Spending less is never counted as saving: a lower
 *   spending month adds nothing to a goal unless the user moves the money and
 *   records it.
 *
 * MILESTONE REWARDS (once per goal and milestone, by the XP/Points ledgers'
 * unique keys)
 *   Goal set (0%), 25%, 50%, 75% and 100%, measured against the highest
 *   target the goal has had (reward_target_inr), so lowering a target never
 *   pays early. Only goals of ₹1,000 or more, only the first 3 goals created
 *   in a calendar month, and 100% only once the goal is 7 days old.
 */

const appTime = require('./appTime');
const ms = require('./moneyStreak');

const KINDS = {
    laptop: 'Laptop',
    emergency: 'Emergency fund',
    education: 'Education',
    travel: 'Travel',
    buffer: 'Monthly buffer',
    custom: 'Something else',
};
const KIND_KEYS = Object.keys(KINDS);

const MILESTONES = [0, 25, 50, 75, 100];
const MILESTONE_REWARD = {
    0: { xp: 10, points: 2 },
    25: { xp: 10, points: 5 },
    50: { xp: 10, points: 5 },
    75: { xp: 10, points: 5 },
    100: { xp: 50, points: 20 },
};
const MIN_REWARD_TARGET = 1000;
const REWARDED_GOALS_PER_MONTH = 3;
const COMPLETION_MIN_AGE_DAYS = 7;
const MAX_ACTIVE_GOALS = 10;
const MAX_YEARS_AHEAD = 10;

const keyOf = (iso) => appTime.localDateKey(new Date(iso));
const refKey = (goalId, pct) => `${goalId}:${pct}`;

function saved(goalId, contributions) {
    return contributions.filter((c) => c.goal_id === goalId).reduce((s, c) => s + (Number(c.amount_inr) || 0), 0);
}

function rewardTarget(goal) {
    return Math.max(Number(goal.reward_target_inr) || 0, Number(goal.target_inr) || 0);
}

/** Whether a goal can earn milestone rewards at all, and why not. */
function rewardEligibility(goal, allGoals) {
    if (rewardTarget(goal) < MIN_REWARD_TARGET) return { eligible: false, why: 'Goals of ₹1,000 or more earn milestone rewards.' };
    const month = appTime.localMonthKey(new Date(goal.created_at));
    const sameMonth = allGoals
        .filter((g) => appTime.localMonthKey(new Date(g.created_at)) === month)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)));
    if (sameMonth.findIndex((g) => g.id === goal.id) >= REWARDED_GOALS_PER_MONTH) {
        return { eligible: false, why: 'Milestone rewards apply to the first 3 goals you create each month.' };
    }
    return { eligible: true, why: null };
}

/**
 * Milestone awards a goal has earned and may not have been given.
 * @returns {Array<{pct:number, ref_key:string, xp:number, points:number}>}
 */
function milestonesDue(goal, savedInr, allGoals, now = new Date()) {
    if (goal.status === 'archived') return [];
    if (!rewardEligibility(goal, allGoals).eligible) return [];
    const target = rewardTarget(goal);
    const ageDays = ms.daysBetween(keyOf(goal.created_at), appTime.localDateKey(now));
    const out = [];
    for (const pct of MILESTONES) {
        if (savedInr < (target * pct) / 100) continue;
        if (pct === 100 && ageDays < COMPLETION_MIN_AGE_DAYS) continue;
        out.push({ pct, ref_key: refKey(goal.id, pct), ...MILESTONE_REWARD[pct] });
    }
    return out;
}

/** Milestones paid earlier that the saved amount no longer reaches (after a correction). */
function milestonesToReverse(goal, savedInr, paidPcts) {
    const target = rewardTarget(goal);
    return paidPcts.filter((pct) => pct > 0 && savedInr < (target * pct) / 100);
}

/**
 * What the app shows for one goal.
 * @param {object} goal
 * @param {Array}  contributions  this goal's rows
 * @param {object} ledger         { xpRefs:Set, reversedRefs:Set } for goal_milestone
 */
function present(goal, contributions, { allGoals = [goal], xpRefs = new Set(), reversedRefs = new Set(), now = new Date() } = {}) {
    const today = appTime.localDateKey(now);
    const target = Number(goal.target_inr);
    const have = saved(goal.id, contributions);
    const remaining = Math.max(0, target - have);
    const targetDate = String(goal.target_date).slice(0, 10);
    const daysLeft = ms.daysBetween(today, targetDate);
    const monthsLeft = Math.max(1, Math.ceil(Math.max(0, daysLeft) / 30.44));
    const weeksLeft = Math.max(1, Math.ceil(Math.max(0, daysLeft) / 7));
    const percent = target > 0 ? Math.min(100, Math.floor((have / target) * 100)) : 0;

    const createdKey = keyOf(goal.created_at);
    const totalDays = Math.max(1, ms.daysBetween(createdKey, targetDate));
    const elapsed = Math.min(totalDays, Math.max(0, ms.daysBetween(createdKey, today)));
    const expected = Math.round((target * elapsed) / totalDays);

    let pace;
    if (goal.status === 'completed' || remaining === 0) pace = 'reached';
    else if (goal.status === 'archived') pace = 'archived';
    else if (daysLeft < 0) pace = 'past_date';
    else if (have >= expected) pace = 'on_track';
    else pace = 'behind';

    const eligibility = rewardEligibility(goal, allGoals);
    const milestones = MILESTONES.map((pct) => {
        const ref = refKey(goal.id, pct);
        return {
            pct,
            label: pct === 0 ? 'Goal set' : `${pct}%`,
            reached: pct === 0 ? true : have >= (target * pct) / 100,
            rewarded: xpRefs.has(ref),
            reversed: reversedRefs.has(`goal_milestone:${ref}`),
            reward: MILESTONE_REWARD[pct],
        };
    });

    const rows = contributions
        .filter((c) => c.goal_id === goal.id)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

    return {
        id: goal.id,
        name: goal.name,
        kind: goal.kind || 'custom',
        kindLabel: KINDS[goal.kind] || KINDS.custom,
        note: goal.note || null,
        status: goal.status,
        targetInr: target,
        targetDate,
        planMonthlyInr: goal.plan_monthly_inr ?? null,
        savedInr: have,
        remainingInr: remaining,
        percent,
        daysLeft,
        pace,
        expectedByNowInr: expected,
        suggested: remaining > 0 && daysLeft >= 0
            ? { monthlyInr: Math.ceil(remaining / monthsLeft), weeklyInr: Math.ceil(remaining / weeksLeft) }
            : null,
        planCovers: goal.plan_monthly_inr != null && remaining > 0 && daysLeft >= 0 ? Number(goal.plan_monthly_inr) >= Math.ceil(remaining / monthsLeft) : null,
        progressKind: 'self_reported',
        milestones,
        rewards: { eligible: eligibility.eligible, why: eligibility.why, completionWaitDays: Math.max(0, COMPLETION_MIN_AGE_DAYS - ms.daysBetween(createdKey, today)) },
        contributions: rows.slice(0, 20).map((c) => ({
            id: c.id,
            amountInr: Number(c.amount_inr),
            contributedOn: String(c.contributed_on).slice(0, 10),
            note: c.note || null,
            source: c.source || 'self_reported',
            createdAt: c.created_at,
        })),
        createdAt: goal.created_at,
        completedAt: goal.completed_at || null,
        archivedAt: goal.archived_at || null,
    };
}

module.exports = {
    KINDS, KIND_KEYS, MILESTONES, MILESTONE_REWARD, MIN_REWARD_TARGET, REWARDED_GOALS_PER_MONTH,
    COMPLETION_MIN_AGE_DAYS, MAX_ACTIVE_GOALS, MAX_YEARS_AHEAD,
    saved, rewardTarget, rewardEligibility, milestonesDue, milestonesToReverse, present, refKey,
};
