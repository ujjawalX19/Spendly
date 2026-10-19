/**
 * safeToSpend — the single Safe-to-Spend calculation.
 *
 * The dashboard (routes/safeToSpend.js) and Vittova AI (lib/financialInsights)
 * previously computed this separately and disagreed: the dashboard counted a
 * bill due *today* as still to pay, the AI did not. Both now call this.
 *
 *   remaining = monthly budget − spent this month − active bills due today or
 *               later this month and not already paid this month
 *               (billsPaidThisMonth) − monthly savings target
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

/** Words that say nothing about which bill a payment was for. */
const NAME_NOISE = new Set(['the', 'and', 'for', 'bill', 'bills', 'payment', 'paid', 'pay', 'upi', 'autopay', 'monthly', 'month', 'other']);

function nameWords(...parts) {
    const words = new Set();
    for (const p of parts) {
        for (const w of String(p || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
            if (w.length >= 3 && !NAME_NOISE.has(w)) words.add(w);
        }
    }
    return words;
}

/**
 * Bills already paid this month, found in this month's expenses: an expense
 * whose description or category shares a word with the bill's name, within
 * 10% of its amount, dated no earlier than 5 days before the due day. Each
 * expense pays at most one bill. Without this, a bill paid (and logged)
 * before its due day was counted twice: once as spent and again as still due.
 * Conservative on purpose: when in doubt the bill stays "still due".
 *
 * @param {Array} bills
 * @param {Array} expenses  this month's expenses (amount, description, category, occurred_at)
 * @param {Date} now
 * @returns {Set<object>} the bill rows that are already paid
 */
function billsPaidThisMonth(bills, expenses, now) {
    const paid = new Set();
    if (!expenses || !expenses.length) return paid;
    const monthStart = appTime.startOfMonth(now).getTime();
    const used = new Set();
    for (const bill of bills || []) {
        if (!bill || bill.is_active === false) continue;
        const words = nameWords(bill.name);
        const amount = Number(bill.amount) || 0;
        if (!words.size || !(amount > 0)) continue;
        const earliestDay = Number(bill.due_day) - 5;
        const match = expenses.find((e, i) => {
            if (used.has(i)) return false;
            const at = new Date(e.occurred_at);
            if (!(at.getTime() >= monthStart) || at.getTime() > now.getTime()) return false;
            if (appTime.dayOfMonth(at) < earliestDay) return false;
            if (Math.abs((Number(e.amount) || 0) - amount) > amount * 0.1) return false;
            const own = nameWords(e.description, e.category);
            return [...words].some((w) => own.has(w));
        });
        if (match) {
            used.add(expenses.indexOf(match));
            paid.add(bill);
        }
    }
    return paid;
}

/**
 * Active bills whose due day is today or later this month, minus any already
 * paid this month (when this month's expenses are given).
 */
function upcomingBillsFor(bills, now, expenses = null) {
    const today = appTime.dayOfMonth(now);
    const paid = billsPaidThisMonth(bills, expenses, now);
    return (bills || []).filter((b) => b && b.is_active !== false && Number(b.due_day) >= today && !paid.has(b));
}

/**
 * @param {object} args
 * @param {number} args.monthlyBudget
 * @param {number} args.totalSpent        spent so far this month
 * @param {Array}  args.bills             recurring_bills rows (amount, due_day, is_active, name?)
 * @param {number} [args.investmentTarget]
 * @param {Date}   [args.now]
 * @param {Array}  [args.expenses]        this month's expenses, so a bill already paid is not counted again
 */
function computeSafeToSpend({ monthlyBudget, totalSpent, bills, investmentTarget = 0, now = new Date(), expenses = null }) {
    const upcoming = upcomingBillsFor(bills, now, expenses);
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

module.exports = { computeSafeToSpend, effectiveMonthlyBudget, upcomingBillsFor, billsPaidThisMonth, DEFAULT_MONTHLY_BUDGET };
