/**
 * safeToSpend — the single Safe-to-Spend calculation.
 *
 * The dashboard (routes/safeToSpend.js) and Vittova AI (lib/financialInsights)
 * previously computed this separately and disagreed: the dashboard counted a
 * bill due *today* as still to pay, the AI did not. Both now call this.
 *
 *   remaining = monthly budget − spent this month − active bills due today or
 *               later this month − monthly savings target
 *   daily     = remaining ÷ days left in the month, including today
 *
 * It is a budget-based figure. Vittova does not know income or bank balances.
 * Pure: numbers and `now` in, figures out. Calendar days are in the app
 * timezone (lib/appTime).
 */

const appTime = require('./appTime');

/** Profile budget as the app displays it (the database default is ₹5,000). */
const DEFAULT_MONTHLY_BUDGET = 5000;
function effectiveMonthlyBudget(profile) {
    return Number(profile?.monthly_budget) || DEFAULT_MONTHLY_BUDGET;
}

/** Active bills whose due day is today or later this month. */
function upcomingBillsFor(bills, now) {
    const today = appTime.dayOfMonth(now);
    return (bills || []).filter((b) => b && b.is_active !== false && Number(b.due_day) >= today);
}

/**
 * @param {object} args
 * @param {number} args.monthlyBudget
 * @param {number} args.totalSpent        spent so far this month
 * @param {Array}  args.bills             recurring_bills rows (amount, due_day, is_active, name?)
 * @param {number} [args.investmentTarget]
 * @param {Date}   [args.now]
 */
function computeSafeToSpend({ monthlyBudget, totalSpent, bills, investmentTarget = 0, now = new Date() }) {
    const upcoming = upcomingBillsFor(bills, now);
    const upcomingBills = upcoming.reduce((s, b) => s + (Number(b.amount) || 0), 0);
    const target = Number(investmentTarget) || 0;
    const spent = Number(totalSpent) || 0;
    const month = Number(monthlyBudget) - spent - upcomingBills - target;
    const daysRemaining = appTime.daysRemainingInMonth(now);

    return {
        daily: Math.max(0, Math.round(month / daysRemaining)),
        remaining: Math.max(0, Math.round(month)),
        monthlyBudget: Number(monthlyBudget),
        totalSpent: Math.round(spent),
        upcomingBills: Math.round(upcomingBills),
        upcomingBillList: upcoming
            .map((b) => ({ name: b.name || 'Bill', amount: Math.round(Number(b.amount) || 0), dueDay: Number(b.due_day) }))
            .sort((a, b) => a.dueDay - b.dueDay),
        investmentTarget: target,
        daysRemaining,
        isNegative: month < 0,
        overBy: month < 0 ? Math.abs(Math.round(month)) : 0,
    };
}

module.exports = { computeSafeToSpend, effectiveMonthlyBudget, upcomingBillsFor, DEFAULT_MONTHLY_BUDGET };
