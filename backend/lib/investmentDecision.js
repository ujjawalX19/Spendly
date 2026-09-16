/**
 * investmentDecision — the deterministic layer behind "where should I invest?".
 *
 * Vittova cannot answer that from stored data alone: it does not know income,
 * bank or savings balances, existing investments, debts or the user's risk
 * comfort. What it does know is whether the amount is money the month still
 * needs.
 *
 * So this module decides, from the user's own figures:
 *   - how much of the amount is genuinely spare this month (safeToInvest),
 *   - what is missing before a sensible answer is possible,
 *   - which approaches fit the stated time horizon, and their trade-offs.
 *
 * The result changes when the amount, bills, spending pace, horizon or the
 * user's own statements change — never randomly. Gemini only words it.
 *
 * Education only: no named scheme, stock, broker or platform, and no promised
 * returns (FINANCIAL_CONTENT_REVIEW.md).
 */

const { extractHorizonYears, detectGoal, futureValue, INVESTING_NOTE } = require('./investingGuide');

const r = (n) => Math.round(Number(n) || 0);
const inr = (n) => `₹${r(n).toLocaleString('en-IN')}`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** What the user told us in the question itself. Never assumed. */
function statedFacts(question) {
    const q = String(question || '').toLowerCase();
    const noEmergency = /\b(no|without|don'?t have|dont have|haven'?t got|havent got)\b[^.]{0,20}\bemergency (fund|savings)\b/.test(q);
    const hasEmergency = /\b(have|got|built|already have)\b[^.]{0,20}\bemergency (fund|savings)\b/.test(q);
    return {
        hasEmergencyFund: noEmergency ? false : hasEmergency ? true : null,
        // "where should I invest" is a question, not a statement that they invest.
        alreadyInvests: /\b(already|currently)\s+(invest|investing)\b|\balready have (a )?sip\b|\bi invest in\b|\bmy (sip|portfolio|investments)\b/.test(q) ? true : null,
        monthly: /\b(every|per|each|a)\s+month\b|\bmonthly\b/.test(q),
        wantsProduct: /\bwhere (should|do|can) i invest\b|\bwhich (fund|option|scheme|instrument)\b|\bwhat should i invest in\b/.test(q),
        riskComfort: /\b(safe|safely|safest|low risk|no risk|without risk|guaranteed)\b/.test(q) ? 'low'
            : /\b(high returns?|aggressive|high risk|maximum returns?)\b/.test(q) ? 'high' : null,
    };
}

function horizonPlan(years) {
    if (years < 3) {
        return {
            label: years < 1 ? plural(Math.max(1, Math.round(years * 12)), 'month') : `${Math.round(years * 10) / 10}-year`,
            approaches: [
                'Mostly low-risk options: a savings account or sweep FD, available any day with no market risk.',
                'A fixed or recurring deposit for exactly that period: a known return, locked until maturity.',
                'Liquid or short-duration debt mutual funds: small ups and downs, usually accessible within a day or two.',
            ],
            tradeoffs: 'Money needed this soon should not sit in shares or equity funds: a fall can take years to recover and you would have to sell at the worst time.',
        };
    }
    if (years < 5) {
        return {
            label: `${Math.round(years * 10) / 10}-year`,
            approaches: [
                'A balanced mix, commonly around 60% in deposits or debt funds and 40% in a diversified equity or index fund.',
                'All in deposits or debt funds if a temporary fall would worry you.',
            ],
            tradeoffs: 'There is some time to recover from a fall, but not enough for full equity risk. More equity widens the range of outcomes in both directions.',
        };
    }
    return {
        label: `${Math.round(years * 10) / 10}-year`,
        approaches: [
            'For growth: mostly equity through a low-cost diversified index fund, commonly around 70% equity and 30% debt, moving safer as the goal nears.',
            'A fixed amount invested every month rather than one lump sum, so the purchase price averages out.',
            'PPF or debt funds for the stable part, especially if the money must be there on a fixed date.',
        ],
        tradeoffs: 'Over long periods equity has historically grown faster than inflation, but with large falls along the way. Returns are never guaranteed and the value can fall below what you put in.',
    };
}

/**
 * Structured investment context from stored data and what the user said.
 * `null` means "not known", never a guess.
 *
 * @param {object} f            facts from financialInsights.buildFacts
 * @param {string} question
 * @param {number|null} amount  amount mentioned in the question
 */
function buildInvestmentContext(f, question, amount) {
    const said = statedFacts(question);
    const years = extractHorizonYears(question);
    const goal = detectGoal(question);

    // What the rest of this month still needs at the current pace (bills and
    // the savings target are already inside Safe-to-Spend).
    const neededThisMonth = f.expectedRestOfMonth;
    const spareThisMonth = Math.max(0, f.safeToSpendRemaining - neededThisMonth);
    const safeToInvest = amount === null ? spareThisMonth : Math.min(amount, spareThisMonth);

    const emergencyTarget = f.typicalMonthlySpend ? r(f.typicalMonthlySpend * 6) : null;
    const emergencyFundStatus = said.hasEmergencyFund === true ? 'stated: has one'
        : said.hasEmergencyFund === false ? 'stated: has none'
            : 'not tracked by Vittova';

    const missingInformation = [];
    if (years === null) missingInformation.push('how long this money can stay invested');
    if (said.hasEmergencyFund === null) missingInformation.push('whether you already have an emergency fund');
    if (said.alreadyInvests === null) missingInformation.push('what you already invest in');
    if (said.riskComfort === null) missingInformation.push('how large a fall you could tolerate');
    missingInformation.push('your income, bank balance and any debts, which Vittova does not track');

    const plan = years === null ? null : horizonPlan(years);
    const monthly = said.monthly && amount ? amount : null;

    return {
        amount,
        monthly,
        safeToInvest,
        spareThisMonth,
        amountExceedsSpare: amount !== null && amount > spareThisMonth,
        spendingPace: f.dailyPace,
        neededThisMonth,
        upcomingBills: f.upcomingBills,
        safeToSpendRemaining: f.safeToSpendRemaining,
        shortfall: f.shortfall,
        emergencyFundStatus,
        emergencyTarget,
        investmentContext: goal || (said.wantsProduct ? 'product choice' : 'general'),
        missingInformation,
        riskInformation: plan ? plan.tradeoffs : 'Without a time frame the right level of risk cannot be judged: the same option can suit 10 years and be wrong for 6 months.',
        timeHorizon: years === null ? null : { years, label: plan.label },
        possibleApproaches: plan ? plan.approaches : [],
        stated: said,
        illustration: monthly && years
            ? {
                years: Math.max(1, Math.round(years)),
                putIn: r(monthly * Math.max(1, Math.round(years)) * 12),
                atSixPercent: r(futureValue(monthly, Math.max(1, Math.round(years)), 0.06)),
                atTenPercent: r(futureValue(monthly, Math.max(1, Math.round(years)), 0.10)),
            }
            : null,
    };
}

/** Turn the context into the mentor answer sections. */
function composeInvestmentAnswer(ctx) {
    const numbers = [];
    if (ctx.amount !== null) numbers.push(`Amount you mentioned: ${inr(ctx.amount)}${ctx.monthly ? ' a month' : ''}`);
    numbers.push(`Safe to spend left this month: ${inr(ctx.safeToSpendRemaining)}`);
    if (ctx.spendingPace) numbers.push(`Your spending pace needs about ${inr(ctx.neededThisMonth)} for the rest of the month`);
    if (ctx.upcomingBills) numbers.push(`Bills still due: ${inr(ctx.upcomingBills)}`);
    numbers.push(`Spare from this month's budget on those numbers: ${inr(ctx.spareThisMonth)}`);
    if (ctx.emergencyTarget) numbers.push(`Six months of your typical spending: ${inr(ctx.emergencyTarget)}`);
    if (ctx.illustration) numbers.push(`${inr(ctx.monthly)} a month for ${plural(ctx.illustration.years, 'year')}: ${inr(ctx.illustration.putIn)} put in; about ${inr(ctx.illustration.atSixPercent)} at an assumed 6% a year, ${inr(ctx.illustration.atTenPercent)} at an assumed 10%`);

    let direct;
    if (ctx.shortfall) {
        direct = `Based on your current numbers I would not invest this month: bills and your savings target already exceed your budget by ${inr(ctx.shortfall)}.`;
    } else if (ctx.amount === null) {
        direct = `On your current numbers about ${inr(ctx.spareThisMonth)} of this month's budget looks spare. Tell me the amount and how long it can stay invested and I will go further.`;
    } else if (ctx.amountExceedsSpare) {
        direct = `Based on your current numbers only about ${inr(ctx.safeToInvest)} of that ${inr(ctx.amount)} looks genuinely spare this month.`;
    } else if (ctx.timeHorizon) {
        direct = `${inr(ctx.amount)} fits inside what your budget leaves this month, and for a ${ctx.timeHorizon.label} horizon the usual choices are clear.`;
    } else {
        direct = `${inr(ctx.amount)} fits inside what your budget leaves this month, but I need one more thing before saying where it should go.`;
    }

    const stated = [];
    if (ctx.stated.hasEmergencyFund === false) stated.push('You said you have no emergency fund, so the usual order is to build that first: it stops a surprise becoming borrowing.');
    if (ctx.stated.hasEmergencyFund === true) stated.push('You said you already have an emergency fund, so this money can be treated as longer-term.');
    if (ctx.stated.alreadyInvests) stated.push('You said you already invest, so the real question is whether to add to what you hold or spread wider.');
    if (ctx.stated.riskComfort === 'low') stated.push('You asked for something safe, so deposit-style options fit better than market-linked ones.');
    if (ctx.stated.riskComfort === 'high') stated.push('Higher expected returns always come with larger falls; nothing pays more without more risk.');

    const approaches = ctx.possibleApproaches.length
        ? ctx.possibleApproaches
        : ['Once you tell me the time frame, I can lay out the options that fit it.'];

    const next = ctx.timeHorizon
        ? (ctx.stated.hasEmergencyFund === false && ctx.emergencyTarget
            ? `Put this month's spare ${inr(ctx.safeToInvest)} towards an emergency fund first: ${inr(ctx.emergencyTarget)} is six months of your spending.`
            : `Decide the amount you can leave untouched for that period, then move it on the day your income arrives.`)
        : 'Tell me how long this money can stay invested (for example "for 3 months" or "for 5 years") and whether you already have an emergency fund.';

    return {
        direct,
        numbers,
        missing: ctx.missingInformation.map((m) => `Not known: ${m}.`).join(' '),
        approaches,
        tradeoffs: `${ctx.riskInformation}${stated.length ? ` ${stated.join(' ')}` : ''}`,
        action: ctx.amountExceedsSpare
            ? 'Invest only what the month does not need; leave the rest in your spending account until the month closes.'
            : 'Invest only money you will not need during the period you choose, and keep the rest accessible.',
        next,
        note: `These are figures Vittova calculated, plus general education — not a recommendation of any product. ${INVESTING_NOTE}`,
    };
}

module.exports = { buildInvestmentContext, composeInvestmentAnswer, statedFacts };
