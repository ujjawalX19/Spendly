/**
 * wealth — the Wealth screen's figures, from the user's own data only.
 *
 * Spendly does not know the user's income, bank balance or investments, and
 * this module never pretends to. It reports what is measurable: this month's
 * position against the budget, spending history, round-ups and the savings
 * target, plus the inputs for a clearly hypothetical projection.
 */

const appTime = require('./appTime');

const r = (n) => Math.round(Number(n) || 0);
const MONTH_LABEL = new Intl.DateTimeFormat('en-IN', { timeZone: appTime.APP_TIMEZONE, month: 'short', year: '2-digit' });

/**
 * @param {{profile:object, expenses:Array, bills:Array, now?:Date, months?:number}} args
 *        expenses must cover the last `months` local months
 */
function computeWealth({ profile = {}, expenses = [], bills = [], now = new Date(), months = 6 }) {
    const budget = Number(profile.monthly_budget) || 0;
    const target = Number(profile.investment_target) || 0;
    const day = appTime.dayOfMonth(now);
    const daysLeft = appTime.daysRemainingInMonth(now);
    const t = (e) => new Date(e.occurred_at).getTime();

    const history = [];
    for (let m = months - 1; m >= 0; m--) {
        const from = appTime.startOfMonthsAgo(m, now);
        const to = m === 0 ? null : appTime.startOfMonthsAgo(m - 1, now);
        const rows = expenses.filter((e) => t(e) >= from.getTime() && (to === null || t(e) < to.getTime()));
        const spent = rows.reduce((s, e) => s + (Number(e.amount) || 0), 0);
        history.push({
            month: appTime.localMonthKey(from),
            label: MONTH_LABEL.format(new Date(from.getTime() + 12 * 3600 * 1000)),
            spent: r(spent),
            transactions: rows.length,
            inProgress: m === 0,
            // Budget is today's budget; past budgets are not stored.
            vsBudget: budget ? r(budget - spent) : null,
        });
    }

    const current = history[history.length - 1];
    const complete = history.slice(0, -1).filter((h) => h.transactions > 0);
    const averageMonthlySpend = complete.length ? r(complete.reduce((s, h) => s + h.spent, 0) / complete.length) : null;

    const upcomingBills = bills
        .filter((b) => b.is_active !== false && Number(b.due_day) > day)
        .reduce((s, b) => s + (Number(b.amount) || 0), 0);
    const left = budget - current.spent - upcomingBills - target;

    const roundUpsThisMonth = expenses
        .filter((e) => t(e) >= appTime.startOfMonth(now).getTime())
        .reduce((s, e) => s + (Number(e.roundup_chillar) || 0), 0);

    // The monthly amount used for the illustration: the user's own target if
    // set, otherwise what their average spending leaves under the budget.
    const illustrationMonthly = target > 0
        ? target
        : budget && averageMonthlySpend !== null && budget > averageMonthlySpend
            ? Math.floor((budget - averageMonthlySpend) / 100) * 100
            : 0;

    return {
        month: {
            key: current.month,
            budget: r(budget),
            spent: current.spent,
            upcomingBills: r(upcomingBills),
            savingsTarget: r(target),
            leftAfterCommitments: r(Math.max(0, left)),
            shortfall: left < 0 ? r(-left) : 0,
            daysLeft,
            budgetUsedPercent: budget ? Math.round((current.spent / budget) * 100) : null,
        },
        history,
        averageMonthlySpend,
        monthsWithData: complete.length,
        roundUps: {
            total: Math.round((Number(profile.total_chillar) || 0) * 100) / 100,
            thisMonth: Math.round(roundUpsThisMonth * 100) / 100,
        },
        illustration: {
            monthlyAmount: r(illustrationMonthly),
            basis: target > 0 ? 'savings_target' : illustrationMonthly > 0 ? 'average_leftover' : 'none',
            hypothetical: true,
        },
        tracked: { income: false, bankBalance: false, investments: false },
    };
}

module.exports = { computeWealth };
