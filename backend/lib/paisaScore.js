/**
 * paisaScore — a transparent spending-habits score out of 100.
 *
 * Not a credit score. Every component is measured from the user's own Spendly
 * data, scored 0–100, and returned with a sentence explaining the number.
 * Components that cannot be measured yet are marked unavailable rather than
 * guessed, and the overall score is withheld until there is enough data.
 *
 *   budgetDiscipline    spending pace this month vs. the budget
 *   dailyConsistency    share of days this month within the daily budget
 *   spendingStability   how steady weekly spending is over the last 8 weeks
 *   savingsConsistency  how many of the last 3 months stayed under budget
 *                       (income is not tracked, so staying under budget is the
 *                       measurable proxy for saving)
 *   loggingHabit        current logging streak (full marks at 30 days)
 */

const appTime = require('./appTime');

const WEIGHTS = { budgetDiscipline: 30, dailyConsistency: 20, spendingStability: 15, savingsConsistency: 25, loggingHabit: 10 };
const MIN_EXPENSES_THIS_MONTH = 5;
const MIN_COMPONENTS = 3;
const DAY = 86400000;

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const amountOf = (e) => Number(e.amount) || 0;

/** IST Monday (YYYY-MM-DD) of the week containing `now`. */
function weekStartKey(now = new Date()) {
    const { year, month, day } = appTime.zonedParts(now);
    const noonLocal = appTime.zonedTimeToUtc(year, month, day, 12, 0, 0);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return appTime.localDateKey(new Date(noonLocal.getTime() - ((weekday + 6) % 7) * DAY));
}

/**
 * @param {{expenses: Array<{amount:number|string, occurred_at:string}>, monthlyBudget:number,
 *          streakCurrent:number, now?: Date}} args  expenses should cover at least the last 4 months
 */
function computePaisaScore({ expenses = [], monthlyBudget, streakCurrent, now = new Date() }) {
    const budget = Number(monthlyBudget) || 0;
    const monthStart = appTime.startOfMonth(now).getTime();
    const daysInMonth = appTime.daysInMonth(now);
    const day = Math.max(1, appTime.dayOfMonth(now));
    const t = (e) => new Date(e.occurred_at).getTime();

    const thisMonth = expenses.filter((e) => t(e) >= monthStart);
    const spent = thisMonth.reduce((s, e) => s + amountOf(e), 0);
    const components = {};
    const na = (why) => ({ score: null, available: false, explanation: why });

    // Budget discipline
    if (!budget) {
        components.budgetDiscipline = na('Set a monthly budget to measure this.');
    } else {
        const expected = budget * (day / daysInMonth);
        const pace = expected > 0 ? spent / expected : 0;
        components.budgetDiscipline = {
            score: Math.round(100 * clamp01(2 - pace)),
            available: true,
            explanation: `You've spent ${inr(spent)} by day ${day}; your budget pace for today is ${inr(expected)}. ${pace <= 1 ? 'You are at or under pace.' : `That is ${Math.round((pace - 1) * 100)}% over pace.`}`,
        };
    }

    // Daily consistency
    if (!budget) {
        components.dailyConsistency = na('Set a monthly budget to measure this.');
    } else {
        const dailyBudget = budget / daysInMonth;
        const perDay = {};
        for (const e of thisMonth) {
            const d = appTime.dayOfMonth(new Date(e.occurred_at));
            perDay[d] = (perDay[d] || 0) + amountOf(e);
        }
        let within = 0;
        for (let d = 1; d <= day; d++) if ((perDay[d] || 0) <= dailyBudget) within++;
        components.dailyConsistency = {
            score: Math.round((100 * within) / day),
            available: true,
            explanation: `${within} of ${day} days this month stayed within ${inr(dailyBudget)} a day.`,
        };
    }

    // Spending stability: 8 complete IST weeks before this week
    const thisWeekStart = appTime.zonedTimeToUtc(...weekStartKey(now).split('-').map(Number), 0, 0, 0).getTime();
    const weeks = [];
    for (let w = 8; w >= 1; w--) {
        const from = thisWeekStart - w * 7 * DAY;
        const to = from + 7 * DAY;
        weeks.push(expenses.filter((e) => t(e) >= from && t(e) < to).reduce((s, e) => s + amountOf(e), 0));
    }
    const activeWeeks = weeks.filter((x) => x > 0);
    if (activeWeeks.length < 4) {
        components.spendingStability = na(`Needs at least 4 weeks with spending logged (you have ${activeWeeks.length} of the last 8).`);
    } else {
        const mean = activeWeeks.reduce((a, b) => a + b, 0) / activeWeeks.length;
        const sd = Math.sqrt(activeWeeks.reduce((a, b) => a + (b - mean) ** 2, 0) / activeWeeks.length);
        const cv = mean > 0 ? sd / mean : 0;
        components.spendingStability = {
            score: Math.round(100 * clamp01(1 - cv)),
            available: true,
            explanation: `Your weekly spending averaged ${inr(mean)} and typically varied by ${inr(sd)} over ${activeWeeks.length} weeks. Steadier spending scores higher.`,
        };
    }

    // Savings consistency: last 3 complete months under budget
    if (!budget) {
        components.savingsConsistency = na('Set a monthly budget to measure this.');
    } else {
        const months = [];
        for (let m = 3; m >= 1; m--) {
            const from = appTime.startOfMonthsAgo(m, now).getTime();
            const to = appTime.startOfMonthsAgo(m - 1, now).getTime();
            const rows = expenses.filter((e) => t(e) >= from && t(e) < to);
            if (rows.length) months.push(rows.reduce((s, e) => s + amountOf(e), 0));
        }
        if (!months.length) {
            components.savingsConsistency = na('Needs at least one full previous month of logged expenses.');
        } else {
            const under = months.filter((x) => x <= budget).length;
            components.savingsConsistency = {
                score: Math.round((100 * under) / months.length),
                available: true,
                explanation: `${under} of your last ${months.length} tracked month${months.length === 1 ? '' : 's'} stayed under your ${inr(budget)} budget.`,
            };
        }
    }

    // Logging habit
    const streak = Math.max(0, Number(streakCurrent) || 0);
    components.loggingHabit = {
        score: Math.round((100 * Math.min(streak, 30)) / 30),
        available: true,
        explanation: `Current logging streak: ${streak} day${streak === 1 ? '' : 's'} (full marks at 30).`,
    };

    const available = Object.entries(components).filter(([, c]) => c.available);
    const reasons = [];
    if (thisMonth.length < MIN_EXPENSES_THIS_MONTH) reasons.push(`Log at least ${MIN_EXPENSES_THIS_MONTH} expenses this month (you have ${thisMonth.length}).`);
    if (!budget) reasons.push('Set a monthly budget.');
    if (available.length < MIN_COMPONENTS) reasons.push('More history is needed for enough of the score to be measured.');

    let total = null;
    if (!reasons.length) {
        const weight = available.reduce((s, [k]) => s + WEIGHTS[k], 0);
        total = Math.round(available.reduce((s, [k, c]) => s + c.score * WEIGHTS[k], 0) / weight);
    }

    return {
        total,
        max: 100,
        status: total === null ? 'insufficient_data' : 'ok',
        insufficientReasons: reasons,
        components,
        weights: { ...WEIGHTS },
    };
}

module.exports = { computePaisaScore, weekStartKey, WEIGHTS };
