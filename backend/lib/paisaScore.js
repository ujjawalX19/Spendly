/**
 * paisaScore — a transparent spending-discipline score from 0 to 850.
 *
 * Not a credit score. Every point comes from the user's own data, and each
 * component is returned with an explanation so the app can show exactly why.
 *
 * Replaced components that were not real:
 *   - "no zombie subscriptions" was a constant 100 for everyone
 *   - "percentile" was the score divided by 850, not a comparison with anyone
 *   - "investment" gave 200 points merely for typing a target
 *   - "change this week" was always 0 because every read overwrote the score
 *
 * Components (max 850):
 *   pace         350  spending so far vs. where the budget says it should be today
 *   dailyBudget  300  share of days this month kept within the daily budget
 *   consistency  150  current logging streak, capped at 30 days
 *   planning      50  a monthly budget and a savings/investment target are set
 */

const appTime = require('./appTime');

const MAX = { pace: 350, dailyBudget: 300, consistency: 150, planning: 50 };
const MIN_EXPENSES_FOR_CONFIDENCE = 5;

const clamp01 = (n) => Math.max(0, Math.min(1, n));

/** IST Monday (YYYY-MM-DD) of the week containing `now`. */
function weekStartKey(now = new Date()) {
    const { year, month, day } = appTime.zonedParts(now);
    const noonLocal = appTime.zonedTimeToUtc(year, month, day, 12, 0, 0);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
    const back = (weekday + 6) % 7;
    return appTime.localDateKey(new Date(noonLocal.getTime() - back * 24 * 60 * 60 * 1000));
}

/**
 * @param {{expenses: Array<{amount:number|string, occurred_at:string}>, monthlyBudget:number,
 *          investmentTarget:number, streakCurrent:number, now?: Date}} args
 */
function computePaisaScore({ expenses, monthlyBudget, investmentTarget, streakCurrent, now = new Date() }) {
    const budget = Number(monthlyBudget) || 0;
    const daysInMonth = appTime.daysInMonth(now);
    const daysPassed = Math.max(1, appTime.dayOfMonth(now));
    const spent = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);

    // Pace: 1.0 means exactly on track. At or under pace earns full points,
    // falling to zero at twice the expected spend.
    let pace = null;
    let pacePoints = 0;
    if (budget > 0) {
        const expectedByToday = budget * (daysPassed / daysInMonth);
        pace = expectedByToday > 0 ? spent / expectedByToday : 0;
        pacePoints = Math.round(MAX.pace * clamp01(2 - pace));
    }

    // Daily budget adherence, bucketed by local (IST) calendar day.
    let daysWithin = 0;
    if (budget > 0) {
        const dailyBudget = budget / daysInMonth;
        const perDay = {};
        for (const e of expenses) {
            const d = appTime.dayOfMonth(new Date(e.occurred_at));
            perDay[d] = (perDay[d] || 0) + Number(e.amount || 0);
        }
        for (let d = 1; d <= daysPassed; d++) {
            if ((perDay[d] || 0) <= dailyBudget) daysWithin++;
        }
    }
    const dailyPoints = budget > 0 ? Math.round(MAX.dailyBudget * (daysWithin / daysPassed)) : 0;

    const streak = Math.max(0, Number(streakCurrent) || 0);
    const consistencyPoints = Math.round(MAX.consistency * Math.min(streak, 30) / 30);

    const planningPoints = (budget > 0 ? 25 : 0) + (Number(investmentTarget) > 0 ? 25 : 0);

    const total = pacePoints + dailyPoints + consistencyPoints + planningPoints;

    return {
        total,
        max: 850,
        confidence: expenses.length >= MIN_EXPENSES_FOR_CONFIDENCE ? 'normal' : 'low',
        breakdown: {
            pace: pacePoints,
            dailyBudget: dailyPoints,
            consistency: consistencyPoints,
            planning: planningPoints,
        },
        maxScores: { ...MAX },
        explanations: {
            pace: budget > 0
                ? `You have spent ₹${Math.round(spent).toLocaleString('en-IN')} by day ${daysPassed}; your budget pace for today is ₹${Math.round(budget * daysPassed / daysInMonth).toLocaleString('en-IN')}.`
                : 'Set a monthly budget to earn pace points.',
            dailyBudget: budget > 0
                ? `${daysWithin} of ${daysPassed} days this month stayed within ₹${Math.round(budget / daysInMonth).toLocaleString('en-IN')} a day.`
                : 'Set a monthly budget to earn daily-budget points.',
            consistency: `Current logging streak: ${streak} day${streak === 1 ? '' : 's'} (full points at 30).`,
            planning: `Budget ${budget > 0 ? 'set' : 'not set'}; savings target ${Number(investmentTarget) > 0 ? 'set' : 'not set'}.`,
        },
    };
}

module.exports = { computePaisaScore, weekStartKey, MAX };
