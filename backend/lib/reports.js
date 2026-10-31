/**
 * reports — a spending report for one week, month or year, worked out only
 * from rows the user has. Nothing is estimated, and a period with no income
 * entries reports income as zero, with `net` null: "no income entered" is not
 * the same as "you earned nothing".
 *
 * Money is added in paise so that decimals never drift.
 */
const appTime = require('./appTime');
const { toCsvRows } = require('./csv');

const DAY_MS = 86_400_000;
const paise = (n) => Math.round(Number(n || 0) * 100);
const rupees = (p) => Math.round(p) / 100;

/**
 * The app-time boundaries of a period. `offset` 0 is the current one, 1 the one
 * before. Weeks start on Monday. `end` is exclusive.
 */
function periodRange(period, offset = 0, now = new Date()) {
    const key = appTime.localDateKey(now);
    const [y, m, d] = key.split('-').map(Number);
    const at = (year, month, day) => appTime.zonedTimeToUtc(year, month, day);
    if (period === 'year') {
        return { start: at(y - offset, 1, 1), end: at(y - offset + 1, 1, 1), label: String(y - offset) };
    }
    if (period === 'week') {
        const noon = new Date(Date.UTC(y, m - 1, d, 12));
        const sinceMonday = (noon.getUTCDay() + 6) % 7;
        const monday = new Date(noon.getTime() - (sinceMonday + 7 * offset) * DAY_MS);
        const sunday = new Date(monday.getTime() + 6 * DAY_MS);
        const start = at(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate());
        const fmt = (x) => x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
        return { start, end: new Date(start.getTime() + 7 * DAY_MS), label: `${fmt(monday)} – ${fmt(sunday)}` };
    }
    const first = new Date(Date.UTC(y, m - 1 - offset, 1));
    const year = first.getUTCFullYear();
    const month = first.getUTCMonth() + 1;
    return {
        start: at(year, month, 1),
        end: month === 12 ? at(year + 1, 1, 1) : at(year, month + 1, 1),
        label: first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    };
}

/** A category limit is monthly: only a month report can be judged against it. */
function buildReport({ period, label, expenses, income, categoryBudgets, monthlyBudget }) {
    const byCategory = new Map();
    let spent = 0;
    for (const e of expenses) {
        const p = paise(e.amount);
        spent += p;
        const row = byCategory.get(e.category) || { paise: 0, count: 0 };
        row.paise += p;
        row.count += 1;
        byCategory.set(e.category, row);
    }
    const received = income.reduce((sum, i) => sum + paise(i.amount_inr), 0);
    const limits = period === 'month' ? new Map(categoryBudgets.map((b) => [b.category, paise(b.limit_inr)])) : new Map();

    const categories = [...byCategory.entries()]
        .map(([category, row]) => ({
            category,
            amount: rupees(row.paise),
            count: row.count,
            share: spent ? Math.round((row.paise / spent) * 100) : 0,
            limit: limits.has(category) ? rupees(limits.get(category)) : null,
            over: limits.has(category) ? row.paise > limits.get(category) : false,
        }))
        .sort((a, b) => b.amount - a.amount);
    // A limit with nothing spent against it yet is still a limit.
    for (const [category, limit] of limits) {
        if (!byCategory.has(category)) categories.push({ category, amount: 0, count: 0, share: 0, limit: rupees(limit), over: false });
    }

    return {
        period,
        label,
        totalSpent: rupees(spent),
        expenseCount: expenses.length,
        totalIncome: rupees(received),
        incomeCount: income.length,
        net: income.length ? rupees(received - spent) : null,
        monthlyBudget: period === 'month' && monthlyBudget ? monthlyBudget : null,
        categories,
    };
}

function reportCsv(report) {
    const lines = [
        ['Vittova report', report.label],
        ['Total spent', report.totalSpent],
        ['Expenses', report.expenseCount],
        ['Income entered', report.incomeCount ? report.totalIncome : ''],
        ['Income minus spending', report.net ?? ''],
        [],
        ['Category', 'Spent', 'Expenses', 'Share %', 'Monthly limit'],
        ...report.categories.map((c) => [c.category, c.amount, c.count, c.share, c.limit ?? '']),
    ];
    return toCsvRows(lines);
}

module.exports = { periodRange, buildReport, reportCsv };
