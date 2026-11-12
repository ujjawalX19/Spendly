/**
 * aiContext — everything Vittova knows about the signed-in user's money, in
 * one place, with each figure's source and reliability.
 *
 * The old mentor context was budget, expenses and bills. This adds what the
 * app has learned since: category budgets, income entries, savings goals and
 * contributions, purchase decisions, Money-Saved, recurring-payment decisions
 * and the user's own memories. Each block says where it came from, the period
 * it covers, when it was last updated, and whether it is confirmed, estimated
 * or incomplete, so the model can be honest rather than confident.
 *
 * Deterministic: the sums are done here in paise; the model only reads them.
 * Missing tables (a database behind on migrations) make a block unavailable,
 * never an error: the answer still works from what exists.
 */
const { supabase } = require('../config/supabase');
const appTime = require('./appTime');
const aiMemory = require('./aiMemory');

const paise = (n) => Math.round(Number(n || 0) * 100);
const rupees = (p) => Math.round(p) / 100;
const MISSING = new Set(['42P01', 'PGRST205', '42703', 'PGRST204']);

async function table(name, build) {
    const { data, error } = await build(supabase.from(name));
    if (error) return { available: !MISSING.has(error.code), error: true, rows: [] };
    return { available: true, error: false, rows: data || [] };
}

/** A figure with its provenance. Keep this shape stable: the prompt and tests rely on it. */
function fact(value, { source, period, updatedAt = null, status = 'confirmed', note = null }) {
    return { value, source, period, updatedAt, status, ...(note ? { note } : {}) };
}

/**
 * Loads and assembles the extended context. `facts` is the existing
 * buildFacts() output (budget, spending, bills, subscriptions); this adds to
 * it rather than recomputing it.
 */
async function assembleContext(userId, facts, now = new Date()) {
    const month = appTime.localMonthKey(now);
    const monthStart = appTime.startOfMonth(now).toISOString();
    const nextMonth = appTime.startOfNextMonth(now).toISOString();
    const today = appTime.localDateKey(now);

    const [budgets, income, goals, contributions, decisions, saved, recurringDecisions, memories] = await Promise.all([
        table('category_budgets', (q) => q.select('category, limit_inr, updated_at').eq('user_id', userId)),
        table('income_entries', (q) => q.select('amount_inr, source, received_on').eq('user_id', userId).gte('received_on', appTime.localDateKey(appTime.startOfMonthsAgo(2, now))).order('received_on', { ascending: false })),
        table('savings_goals', (q) => q.select('id, name, kind, target_inr, target_date, plan_monthly_inr, status, updated_at').eq('user_id', userId).eq('status', 'active')),
        table('savings_contributions', (q) => q.select('goal_id, amount_inr, contributed_on').eq('user_id', userId)),
        table('planned_purchases', (q) => q.select('label, amount, decision, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(5)),
        table('savings_events', (q) => q.select('amount, kind, created_at').eq('user_id', userId).gte('created_at', monthStart).lt('created_at', nextMonth)),
        table('recurring_decisions', (q) => q.select('merchant_key, decision, updated_at').eq('user_id', userId).limit(20)),
        aiMemory.forPrompt(userId, now).catch(() => []),
    ]);

    // Category budgets against this month's spending, from the same category
    // totals the dashboard uses.
    const spentBy = Object.fromEntries((facts.categories || []).map((c) => [c.category, c.thisMonth]));
    const categoryBudgets = budgets.available ? budgets.rows.map((b) => {
        const spent = spentBy[b.category] || 0;
        return { category: b.category, limit: b.limit_inr, spent, left: b.limit_inr - spent, usedPercent: Math.round((spent / b.limit_inr) * 100), over: spent > b.limit_inr };
    }).sort((a, b) => b.usedPercent - a.usedPercent) : null;

    // Income: only what the user entered. No entry this month means unknown,
    // not zero.
    const thisMonthIncome = income.rows.filter((i) => String(i.received_on).startsWith(month));
    const incomePaise = thisMonthIncome.reduce((s, i) => s + paise(i.amount_inr), 0);
    const lastIncomeOn = income.rows[0]?.received_on || null;
    const incomeBlock = !income.available
        ? { status: 'unavailable', note: 'Income recording is not set up yet.' }
        : thisMonthIncome.length === 0
            ? { status: 'unknown', note: lastIncomeOn ? `No income entered for ${month}; the last entry was on ${lastIncomeOn}.` : 'The user has never entered income, so income is unknown. Do not assume it.' }
            : { thisMonth: fact(rupees(incomePaise), { source: 'income_entries (entered by the user)', period: month, updatedAt: thisMonthIncome[0].received_on, status: 'confirmed', note: 'Self-reported, not verified against a bank.' }), entries: thisMonthIncome.length };

    // Net this month exists only when income is known.
    const net = incomeBlock.thisMonth ? fact(rupees(incomePaise - paise(facts.spentThisMonth)), { source: 'income_entries minus expenses', period: month, status: 'estimated', note: 'Income is self-reported; expenses are what was logged.' }) : null;

    const savedByGoal = {};
    for (const c of contributions.rows) savedByGoal[c.goal_id] = (savedByGoal[c.goal_id] || 0) + paise(c.amount_inr);
    const goalList = goals.available ? goals.rows.map((g) => {
        const savedPaise = savedByGoal[g.id] || 0;
        const left = Math.max(0, paise(g.target_inr) - savedPaise);
        const daysToTarget = Math.round((Date.parse(`${g.target_date}T12:00:00+05:30`) - Date.parse(`${today}T12:00:00+05:30`)) / 86_400_000);
        const months = Math.max(1, daysToTarget / 30.4);
        return {
            name: g.name, target: g.target_inr, saved: rupees(savedPaise), left: rupees(left),
            targetDate: g.target_date, monthsLeft: Math.round(months * 10) / 10,
            neededPerMonth: rupees(Math.ceil(left / months)), planMonthly: g.plan_monthly_inr,
            percent: Math.min(100, Math.round((savedPaise / Math.max(1, paise(g.target_inr))) * 100)),
            updatedAt: g.updated_at,
        };
    }) : null;

    const decisionList = decisions.available ? decisions.rows.map((d) => ({ label: d.label, amount: Number(d.amount), decision: d.decision, on: String(d.created_at).slice(0, 10) })) : null;
    const savedThisMonth = saved.available ? rupees(saved.rows.reduce((s, e) => s + paise(e.amount), 0)) : null;
    const reviewedRecurring = recurringDecisions.available ? recurringDecisions.rows.length : null;

    const incomeKnown = Boolean(incomeBlock.thisMonth);
    const notTracked = ['bank balance', 'investments', 'debts and loans'];
    if (!incomeKnown) notTracked.unshift('income');

    return {
        asOf: today,
        reliability: {
            expenses: fact(facts.transactionsThisMonth, { source: 'expenses logged in Vittova (manual, SMS, receipts, imports)', period: month, status: facts.confidence === 'good' ? 'confirmed' : 'incomplete', note: facts.confidence === 'insufficient' ? 'Too few expenses this month to see patterns.' : facts.confidence === 'limited' ? 'Limited history: treat trends as rough.' : null }),
            budget: fact(facts.budget, { source: facts.budgetIsDefault ? 'default budget (the user has not set one)' : 'monthly budget set by the user', period: month, status: facts.budgetIsDefault ? 'estimated' : 'confirmed' }),
            comparisons: `This month is ${facts.dayOfMonth} of ${facts.daysInMonth} days in; comparisons use the same point last month, not the whole month.`,
            transfers: 'Vittova does not import bank statements of transfers; refunds are edits or deletions of an expense, so they are not double-counted.',
        },
        categoryBudgets: categoryBudgets === null ? { status: 'unavailable' } : { set: categoryBudgets.length, budgets: categoryBudgets.slice(0, 7), source: 'category_budgets set by the user', period: month },
        income: incomeBlock,
        netThisMonth: net,
        goals: goalList === null ? { status: 'unavailable' } : { active: goalList.length, goals: goalList.slice(0, 5), source: 'savings_goals and contributions entered by the user', note: 'Progress is what the user says they put aside; Vittova cannot see a bank balance.' },
        purchaseDecisions: decisionList === null ? { status: 'unavailable' } : { recent: decisionList, source: 'Afford-It decisions recorded by the user' },
        moneySaved: savedThisMonth === null ? { status: 'unavailable' } : fact(savedThisMonth, { source: 'skipped purchases and lower prices the user recorded', period: month, status: 'confirmed', note: 'Money not spent, as the user stated; not a balance.' }),
        recurringReviewed: reviewedRecurring === null ? { status: 'unavailable' } : { decisionsMade: reviewedRecurring },
        memories,
        notTracked,
    };
}

/** True when income is known for this month: enables savings-rate style answers. */
function incomeKnown(context) {
    return Boolean(context?.income?.thisMonth);
}

module.exports = { assembleContext, incomeKnown, fact };
