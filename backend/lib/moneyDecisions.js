/**
 * moneyDecisions — the v1.1 decision engine: Afford-It Check, Month Shape,
 * Safe-to-Invest and the SIP Stress Test.
 *
 * ONE SOURCE OF TRUTH. Every figure here comes from the facts built by
 * lib/financialInsights.buildFacts, which in turn uses lib/safeToSpend for the
 * Safe-to-Spend number the dashboard shows. The dashboard cards, the
 * /api/decisions routes and Vittova AI all call these functions; none of them
 * has its own formula.
 *
 * What Vittova knows: the monthly budget, spending, recurring bills, the
 * monthly savings target and spending history. What it does NOT know: income,
 * bank balances, savings, investments and debts. Results say so instead of
 * guessing, and never claim certainty the data does not support.
 *
 * Pure: facts in, results out. No database, no clock (dates come from facts).
 */

const r = (n) => Math.round(Number(n) || 0);
const inr = (n) => `₹${r(n).toLocaleString('en-IN')}`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

const EDUCATION_NOTE = 'General financial education, not investment advice. Vittova is not a SEBI-registered investment adviser.';

/** Below this share of the budget left over, a month is "watch", not "comfortable". */
const BUFFER_SHARE = 0.1;

/** '2026-10-01' → '1 Oct'. The date key is already a local calendar date. */
function dayLabel(dateKey) {
    const [y, m, d] = String(dateKey).split('-').map(Number);
    return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/**
 * How much ordinary spending the rest of the month is likely to need.
 *
 * Uses the higher of this month's pace and the user's usual pace from past
 * months: an affordability check should err towards caution, and a quiet
 * start to the month is not proof the rest will be quiet. With under five
 * expenses this month and no history there is no reliable pace at all, and
 * the result says so (`known: false`).
 */
function expectedSpending(f) {
    const paceNow = f.transactionsThisMonth >= 5 ? f.dailyPace : 0;
    const paceUsual = f.threeMonthAverage > 0 && f.daysInMonth ? f.threeMonthAverage / f.daysInMonth : 0;
    const perDay = Math.max(paceNow, paceUsual);
    return {
        known: perDay > 0,
        perDay: r(perDay),
        restOfMonth: r(perDay * f.daysLeft),
        basis: paceUsual > paceNow ? 'usual' : paceNow > 0 ? 'this_month' : 'none',
    };
}

/**
 * What a fresh month leaves after bills, the savings target and usual
 * spending. Usual spending is the higher of past months and this month's
 * projection (once there are five expenses), for the same reason as above.
 */
function typicalMonth(f) {
    const commitments = f.recurringBillsMonthly + f.savingsTarget;
    const spending = Math.max(f.typicalMonthlySpend || 0, f.transactionsThisMonth >= 5 ? f.projectedMonthEnd : 0);
    return {
        commitments: r(commitments),
        spending: r(spending),
        spendingKnown: spending > 0,
        left: r(f.budget - commitments - spending),
    };
}

function missingData(f, expected) {
    const missing = ['income and bank balance (Vittova does not track them)'];
    if (f.budgetIsDefault) missing.push('your monthly budget (the default of ₹5,000 is being used)');
    if (!expected.known) missing.push('enough spending history to know your usual pace');
    return missing;
}

function confidenceOf(f, expected) {
    if (!expected.known) return 'low';
    return f.confidence === 'good' ? 'good' : 'limited';
}

// ─── Afford-It Check ────────────────────────────────────────────────────────

/**
 * Can the user afford a purchase of `amount` this month?
 *
 * verdict:
 *   'can_afford'       fits within Safe-to-Spend and usual spending still fits after it
 *   'wait'             fits, but leaves less than the rest of the month usually needs
 *   'not_comfortable'  more than can be safely spent this month
 *
 * @param {object} f        facts from buildFacts
 * @param {{amount:number, label?:string}} purchase
 */
function affordCheck(f, { amount, label = null }) {
    const price = r(amount);
    const expected = expectedSpending(f);
    const room = f.safeToSpendRemaining;
    const leftAfter = room - price;
    const fits = price <= room;
    const comfortable = fits && leftAfter >= expected.restOfMonth;
    const verdict = !fits ? 'not_comfortable' : comfortable ? 'can_afford' : 'wait';

    // Waiting within this month never adds room (the budget only resets on the
    // 1st), so the safer date, when there is one, is the start of next month —
    // and only if a typical month would take the purchase comfortably.
    const month = typicalMonth(f);
    const nextMonthFits = verdict !== 'can_afford' && month.spendingKnown && price <= month.left - r(f.budget * BUFFER_SHARE);
    const saferDate = nextMonthFits ? { dateKey: f.nextMonthStart, label: dayLabel(f.nextMonthStart) } : null;
    const capacity = f.monthlySavingCapacity;
    const monthsToSave = verdict === 'not_comfortable' && !saferDate && capacity > 0 ? Math.ceil((price - room) / capacity) : null;

    const nextBill = f.upcomingBillList && f.upcomingBillList.length ? f.upcomingBillList[0] : null;
    const what = label ? `${inr(price)} for ${label}` : inr(price);

    let headline;
    let detail;
    if (verdict === 'can_afford') {
        headline = expected.known ? 'You can afford this purchase.' : 'This looks affordable on the data so far.';
        detail = expected.known
            ? `${what} fits within the ${inr(room)} you can safely spend this month, and your usual spending still fits afterwards.`
            : `${what} fits within the ${inr(room)} you can safely spend this month. There isn't enough spending history yet to check it against your usual pace.`;
    } else if (verdict === 'wait') {
        headline = 'You can afford it, but waiting would give you more breathing room.';
        detail = `After buying, ${inr(leftAfter)} would be left for ${plural(f.daysLeft, 'day')}, while your usual spending needs about ${inr(expected.restOfMonth)}.`;
    } else {
        headline = 'This purchase would put your current month under pressure.';
        detail = room > 0
            ? `${what} is ${inr(price - room)} more than the ${inr(room)} you can safely spend for the rest of this month.`
            : f.shortfall > 0
                ? `Spending, bills still due and your savings target already exceed this month's budget by ${inr(f.shortfall)}.`
                : "Nothing is left to spend safely this month after spending, bills still due and your savings target.";
    }
    if (saferDate) detail += ` From ${saferDate.label}, a new month's budget should cover it comfortably.`;
    else if (monthsToSave) detail += ` Setting aside ${inr(capacity)} a month would cover the gap in about ${plural(monthsToSave, 'month')}.`;

    return {
        verdict,
        headline,
        detail,
        amount: price,
        label,
        safeToSpendRemaining: room,
        leftAfter: fits ? r(leftAfter) : 0,
        leftAfterPerDay: fits && f.daysLeft ? r(leftAfter / f.daysLeft) : 0,
        shortfall: fits ? 0 : r(price - room),
        expectedRestOfMonth: expected.known ? expected.restOfMonth : null,
        budgetImpactPercent: f.budget > 0 ? Math.round((price / f.budget) * 100) : null,
        budgetUsedAfterPercent: f.budget > 0 ? Math.round(((f.spentThisMonth + price) / f.budget) * 100) : null,
        nextBill,
        upcomingBills: f.upcomingBills,
        daysLeft: f.daysLeft,
        saferDate,
        monthsToSave,
        confidence: confidenceOf(f, expected),
        missing: missingData(f, expected),
        assumptions: [
            'Safe to spend = monthly budget − spent this month − bills still due − monthly savings target.',
            expected.known
                ? `Your usual spending is taken as about ${inr(expected.perDay)} a day (${expected.basis === 'usual' ? 'your average from past months' : "this month's pace"}).`
                : 'Your usual spending pace is not known yet.',
        ],
    };
}

// ─── Month Shape ────────────────────────────────────────────────────────────

/**
 * How the rest of the month may look. A projection, never a promise.
 *
 * state: 'comfortable' | 'watch' | 'tight'
 */
function monthShape(f) {
    const expected = expectedSpending(f);
    const projectedSpend = f.spentThisMonth + expected.restOfMonth;
    const projectedEnd = f.budget - projectedSpend - f.upcomingBills - f.savingsTarget;
    const buffer = f.budget * BUFFER_SHARE;

    const state = f.shortfall > 0 || projectedEnd < 0 ? 'tight' : projectedEnd < buffer ? 'watch' : 'comfortable';

    const headline = {
        comfortable: expected.known ? 'Comfortable: at this pace the month should end with room to spare.' : 'Comfortable so far. Log a few more expenses for a sharper forecast.',
        watch: 'Watch spending: the month may end with very little to spare.',
        tight: f.shortfall > 0 ? "Tight: this month's commitments already exceed the budget." : 'Tight: at this pace, spending may go over the budget.',
    }[state];

    return {
        state,
        headline,
        budget: f.budget,
        spent: f.spentThisMonth,
        budgetUsedPercent: f.budgetUsedPercent,
        upcomingBills: f.upcomingBills,
        upcomingBillList: f.upcomingBillList,
        savingsTarget: f.savingsTarget,
        remainingDiscretionary: f.safeToSpendRemaining,
        safePerDay: f.safeToSpendPerDay,
        dailyPace: expected.known ? expected.perDay : null,
        expectedRestOfMonth: expected.known ? expected.restOfMonth : null,
        projectedSpend: r(projectedSpend),
        projectedMonthEnd: r(projectedEnd),
        shortfall: f.shortfall,
        dayOfMonth: f.dayOfMonth,
        daysInMonth: f.daysInMonth,
        daysLeft: f.daysLeft,
        confidence: confidenceOf(f, expected),
        missing: missingData(f, expected),
        assumptions: [
            'Projected month end = budget − spent − expected spending for the days left − bills still due − savings target.',
            'A forecast from your own data, not a guarantee.',
        ],
    };
}

// ─── Safe-to-Invest ─────────────────────────────────────────────────────────

/**
 * How much of this month's budget appears spare for investing: what is left
 * after spending so far, bills still due, the savings target (already set
 * aside) and the spending the rest of the month is likely to need.
 */
function safeToInvest(f) {
    const expected = expectedSpending(f);
    const amount = Math.max(0, r(f.safeToSpendRemaining - expected.restOfMonth));

    let statement;
    if (f.shortfall > 0) statement = `Nothing appears available for investing this month: commitments already exceed the budget by ${inr(f.shortfall)}.`;
    else if (amount === 0) statement = 'Nothing appears spare for investing this month after spending, bills and your savings target.';
    else statement = `Based on your current cash flow, approximately ${inr(amount)} appears available for investing this month.`;

    return {
        amount,
        statement,
        safeToSpendRemaining: f.safeToSpendRemaining,
        expectedRestOfMonth: expected.known ? expected.restOfMonth : null,
        upcomingBills: f.upcomingBills,
        savingsTarget: f.savingsTarget,
        shortfall: f.shortfall,
        confidence: confidenceOf(f, expected),
        missing: [...missingData(f, expected), 'whether you have an emergency fund, and any debts'],
        assumptions: [
            'Uses this month\'s budget, not your income.',
            f.savingsTarget ? `Your ${inr(f.savingsTarget)} monthly savings target is already set aside and not included.` : 'No monthly savings target is set.',
            expected.known ? `Keeps about ${inr(expected.restOfMonth)} for your usual spending over the ${plural(f.daysLeft, 'day')} left.` : 'Your usual spending pace is not known yet, so nothing is kept back for it.',
        ],
        note: EDUCATION_NOTE,
    };
}

// ─── SIP Stress Test ────────────────────────────────────────────────────────

/**
 * Would a recurring monthly investment of `monthlyAmount` fit a typical month?
 * A cash-flow test only: it never names or recommends a product.
 *
 * state: 'comfortable' | 'watch' | 'tight'
 */
function sipStressTest(f, { monthlyAmount }) {
    const sip = r(monthlyAmount);
    const month = typicalMonth(f);
    const leftAfter = month.left - sip;
    const state = leftAfter < 0 ? 'tight' : leftAfter < f.budget * BUFFER_SHARE ? 'watch' : 'comfortable';
    const thisMonthAfter = f.safeToSpendRemaining - sip;

    const headline = {
        comfortable: `A ${inr(sip)} monthly SIP fits your typical month with room to spare.`,
        watch: `A ${inr(sip)} monthly SIP fits, but it would leave little room in a typical month.`,
        tight: `A ${inr(sip)} monthly SIP would make a typical month tight.`,
    }[state];

    const missing = ['income and bank balance (Vittova does not track them)'];
    if (f.budgetIsDefault) missing.push('your monthly budget (the default of ₹5,000 is being used)');
    if (!month.spendingKnown) missing.push('a typical month of spending (log expenses for a few weeks)');

    return {
        state,
        headline,
        monthlyAmount: sip,
        budget: f.budget,
        recurringBills: f.recurringBillsMonthly,
        savingsTarget: f.savingsTarget,
        typicalSpending: month.spendingKnown ? month.spending : null,
        leftBefore: month.left,
        leftAfter: r(leftAfter),
        shareOfBudgetPercent: f.budget > 0 ? Math.round((sip / f.budget) * 100) : null,
        thisMonth: {
            safeToSpendRemaining: f.safeToSpendRemaining,
            afterSip: r(Math.max(0, thisMonthAfter)),
            fits: thisMonthAfter >= 0,
        },
        confidence: month.spendingKnown ? (f.monthsOfHistory >= 2 ? 'good' : 'limited') : 'low',
        missing,
        assumptions: [
            'Typical month = budget − all recurring bills − savings target − your usual monthly spending.',
            f.savingsTarget ? `The SIP is treated as extra to your ${inr(f.savingsTarget)} savings target. If it replaces the target, lower the target in Settings.` : 'No savings target is set.',
            'A cash-flow check only. It does not judge any fund or product, and returns are never guaranteed.',
        ],
        note: EDUCATION_NOTE,
    };
}

module.exports = { affordCheck, monthShape, safeToInvest, sipStressTest, expectedSpending, typicalMonth, dayLabel, EDUCATION_NOTE };
