/**
 * financialContext — turn raw expense rows into the picture a coach needs.
 *
 * The AI was previously handed three numbers: budget, total spent, and the
 * single biggest category. With that little, the only advice it could give was
 * generic, which is why every answer came out as a SIP recommendation
 * regardless of what was asked.
 *
 * A useful coach needs to see change: what moved since last month, what is
 * unusual for this user, how much of the month is left, and whether there is
 * enough history to say anything at all. That last one matters most — a new
 * user with four expenses should be told "I don't have enough yet", not given
 * a confident analysis of their habits.
 *
 * Pure and deterministic: rows in, summary out, no database and no clock.
 */

const appTime = require('./appTime');

const round = (n) => Math.round(Number(n) || 0);

/** Sum amounts by category, biggest first. */
function byCategory(rows) {
    const totals = {};
    for (const row of rows) {
        const key = row.category || 'Other';
        totals[key] = (totals[key] || 0) + Number(row.amount || 0);
    }
    return Object.entries(totals)
        .map(([category, amount]) => ({ category, amount: round(amount) }))
        .sort((a, b) => b.amount - a.amount);
}

const sum = (rows) => rows.reduce((t, r) => t + Number(r.amount || 0), 0);

/**
 * Build the coaching context.
 *
 * @param {object}   args
 * @param {Array}    args.thisMonth  expense rows with occurred_at in the current local month
 * @param {Array}    args.lastMonth  expense rows from the previous local month
 * @param {object}   args.profile    { monthly_budget, investment_target, karma_score, paisa_score }
 * @param {Array}    [args.bills]    recurring_bills rows
 * @param {Date}     [args.now]
 */
function buildContext({ thisMonth = [], lastMonth = [], profile = {}, bills = [], now = new Date() }) {
    const budget = Number(profile.monthly_budget) || 0;
    const investmentTarget = Number(profile.investment_target) || 0;

    const spent = round(sum(thisMonth));
    const spentLast = round(sum(lastMonth));

    const dayOfMonth = appTime.dayOfMonth(now);
    const daysInMonth = appTime.daysInMonth(now);
    const daysLeft = appTime.daysRemainingInMonth(now);

    const categories = byCategory(thisMonth);
    const lastCategories = byCategory(lastMonth);
    const lastByName = Object.fromEntries(lastCategories.map((c) => [c.category, c.amount]));

    // Where the month-over-month change actually came from. This is what makes
    // "you spent more" into "you spent more because of X", which is the only
    // version a user can act on.
    const movers = categories
        .map((c) => ({
            category: c.category,
            amount: c.amount,
            previous: lastByName[c.category] || 0,
            change: c.amount - (lastByName[c.category] || 0),
        }))
        .filter((c) => Math.abs(c.change) >= 100)
        .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
        .slice(0, 3);

    const upcomingBills = bills
        .filter((b) => b.is_active !== false && Number(b.due_day) >= dayOfMonth)
        .reduce((t, b) => t + Number(b.amount || 0), 0);

    // Pace: spending per day so far, projected across the whole month.
    const dailyRate = dayOfMonth > 0 ? spent / dayOfMonth : 0;
    const projected = round(dailyRate * daysInMonth);

    const remaining = budget - spent - upcomingBills - investmentTarget;
    const safePerDay = remaining > 0 ? Math.round(remaining / daysLeft) : 0;

    // Honesty about how much can be concluded. Thresholds are deliberately
    // conservative: it is better to say "too early to tell" than to build a
    // narrative out of five data points.
    const confidence =
        thisMonth.length >= 10 && lastMonth.length >= 10 ? 'good'
            : thisMonth.length >= 5 ? 'limited'
                : 'insufficient';

    return {
        currency: 'INR',
        today: appTime.localDateKey(now),
        dayOfMonth,
        daysInMonth,
        daysLeft,

        budget,
        investmentTarget,

        spentThisMonth: spent,
        spentLastMonth: spentLast,
        changeVsLastMonth: spent - spentLast,
        transactionCount: thisMonth.length,

        projectedMonthEnd: projected,
        onPaceToOverspend: budget > 0 && projected > budget,
        overBudgetBy: spent > budget ? round(spent - budget) : 0,

        upcomingBills: round(upcomingBills),
        safeToSpendRemaining: round(Math.max(0, remaining)),
        safeToSpendPerDay: safePerDay,

        topCategories: categories.slice(0, 5),
        biggestMovers: movers,

        paisaScore: Number(profile.paisa_score) || Number(profile.karma_score) || 0,

        // 'good' | 'limited' | 'insufficient' — the AI must not over-claim
        // when this is not 'good'.
        confidence,
    };
}

/**
 * A plain-language summary of the context, used both as the model's grounding
 * and as the answer when no AI key is configured. Every sentence is derived
 * from the numbers above — nothing here is invented.
 */
function describeContext(ctx) {
    const money = (v) => `₹${round(v).toLocaleString('en-IN')}`;
    const lines = [];

    if (ctx.confidence === 'insufficient') {
        lines.push(
            `You have logged ${ctx.transactionCount} expense${ctx.transactionCount === 1 ? '' : 's'} this month — not enough for me to say much about your habits yet.`
        );
        if (ctx.budget > 0) {
            lines.push(`Your budget is ${money(ctx.budget)} and you have spent ${money(ctx.spentThisMonth)} of it.`);
        }
        lines.push('Log a week of spending and I can tell you where your money actually goes.');
        return lines.join(' ');
    }

    lines.push(
        `It is day ${ctx.dayOfMonth} of ${ctx.daysInMonth}. You have spent ${money(ctx.spentThisMonth)}${ctx.budget ? ` of a ${money(ctx.budget)} budget` : ''}, across ${ctx.transactionCount} transactions.`
    );

    if (ctx.overBudgetBy > 0) {
        lines.push(`You are ${money(ctx.overBudgetBy)} over budget.`);
    } else if (ctx.onPaceToOverspend) {
        lines.push(`At this pace you will finish the month around ${money(ctx.projectedMonthEnd)}, over your budget.`);
    } else if (ctx.safeToSpendPerDay > 0) {
        lines.push(`That leaves about ${money(ctx.safeToSpendPerDay)} a day for the remaining ${ctx.daysLeft} days.`);
    }

    if (ctx.topCategories.length) {
        const top = ctx.topCategories[0];
        lines.push(`Your biggest category is ${top.category} at ${money(top.amount)}.`);
    }

    if (ctx.biggestMovers.length && ctx.spentLastMonth > 0) {
        const m = ctx.biggestMovers[0];
        const direction = m.change > 0 ? 'up' : 'down';
        lines.push(
            `Compared with last month, ${m.category} is ${direction} ${money(Math.abs(m.change))} (${money(m.previous)} → ${money(m.amount)}).`
        );
    }

    if (ctx.upcomingBills > 0) {
        lines.push(`You still have ${money(ctx.upcomingBills)} of recurring bills due this month.`);
    }

    if (ctx.confidence === 'limited') {
        lines.push('This is based on limited history, so treat it as a rough picture.');
    }

    return lines.join(' ');
}

module.exports = { buildContext, describeContext, byCategory };
