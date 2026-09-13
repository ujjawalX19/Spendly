/**
 * burnRate — pure spending-forecast maths, in the app's business timezone.
 *
 * The route previously computed the "broke date" with Date#setDate and
 * toLocaleDateString on the server clock. Render runs in UTC, so from 18:30 IST
 * onward the forecast date was a day early. Everything here reasons in local
 * (IST) calendar days via appTime and takes an explicit `now` for tests.
 */

const appTime = require('./appTime');

const NON_ESSENTIAL = ['Food', 'Entertainment', 'Shopping', 'Other'];

/** 'D MMM' for a local calendar day `offsetDays` after `now`, e.g. '18 Sept'. */
function formatLocalDay(now, offsetDays, timeZone = appTime.APP_TIMEZONE) {
    const { year, month, day } = appTime.zonedParts(now, timeZone);
    // Noon local avoids any edge where the instant lands on a day boundary.
    const target = appTime.zonedTimeToUtc(year, month, day + offsetDays, 12, 0, 0, timeZone);
    return {
        label: new Intl.DateTimeFormat('en-IN', { timeZone, day: 'numeric', month: 'short' }).format(target),
        dateKey: appTime.localDateKey(target, timeZone),
    };
}

/**
 * @param {{expenses: Array<{amount:number|string, category?:string}>, monthlyBudget: number, now?: Date}} args
 */
function computeBurnRate({ expenses, monthlyBudget, now = new Date() }) {
    const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const daysPassed = Math.max(1, appTime.dayOfMonth(now));
    const daysInMonth = appTime.daysInMonth(now);
    const daysRemaining = Math.max(0, daysInMonth - daysPassed);

    const dailyBurnRate = totalSpent / daysPassed;
    const projectedTotal = dailyBurnRate * daysInMonth;
    const budgetRemaining = monthlyBudget - totalSpent;

    let willGoBroke = false;
    let brokeDate = null;
    let brokeDateKey = null;

    if (budgetRemaining < 0) {
        willGoBroke = true;
        brokeDate = 'Already over budget';
    } else if (dailyBurnRate > 0) {
        const daysUntilBroke = budgetRemaining / dailyBurnRate;
        if (daysUntilBroke < daysRemaining) {
            willGoBroke = true;
            const day = formatLocalDay(now, Math.floor(daysUntilBroke));
            brokeDate = day.label;
            brokeDateKey = day.dateKey;
        }
    }

    const categoryTotals = {};
    for (const exp of expenses) {
        if (NON_ESSENTIAL.includes(exp.category)) {
            categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + Number(exp.amount || 0);
        }
    }
    const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0] || null;

    let cutSuggestion = null;
    if (willGoBroke && topCategory) {
        const suggestedCut = Math.round(topCategory[1] * 0.3);
        cutSuggestion = {
            category: topCategory[0],
            categorySpent: Math.round(topCategory[1]),
            suggestedCut,
            message: `Spending about ₹${suggestedCut.toLocaleString('en-IN')} less on ${topCategory[0]} for the rest of the month would help you stay within budget.`,
        };
    }

    return {
        dailyBurnRate: Math.round(dailyBurnRate),
        projectedTotal: Math.round(projectedTotal),
        totalSpent: Math.round(totalSpent),
        monthlyBudget,
        budgetRemaining: Math.round(budgetRemaining),
        daysRemaining,
        daysPassed,
        willGoBroke,
        brokeDate,
        brokeDateKey,
        percentUsed: monthlyBudget > 0 ? Math.round((totalSpent / monthlyBudget) * 100) : null,
        cutSuggestion,
        topCategory: topCategory ? { category: topCategory[0], amount: Math.round(topCategory[1]) } : null,
    };
}

module.exports = { computeBurnRate, formatLocalDay };
