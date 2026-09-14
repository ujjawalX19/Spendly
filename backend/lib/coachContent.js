/**
 * coachContent — deterministic, regulation-conscious text for the money coach.
 *
 * Earlier versions generated "plans" naming specific mutual fund schemes and
 * listed stocks, sized to the user's surplus, with broker referral links. That
 * is personalised investment advice (see FINANCIAL_CONTENT_REVIEW.md). What is
 * left here is general education: no product names, no platforms, no links,
 * no promised returns.
 */

const EDUCATION_DISCLAIMER =
    'This is general financial education, not investment advice. Vittova is not a SEBI-registered investment adviser. Consider speaking to a SEBI-registered adviser before investing.';

const money = (v) => `₹${Math.round(Number(v) || 0).toLocaleString('en-IN')}`;

function classifyIntent(query) {
    const q = String(query || '').toLowerCase();
    if (/\b(can i afford|should i buy|worth buying|afford to|can i spend)\b/.test(q)) return 'affordability';
    if (/\b(invest|investing|investment|sip|mutual fund|stock|shares?|equity|nifty|sensex|portfolio|returns|etf|gold|crypto)\b/.test(q)) return 'investing';
    if (/\b(save|saving|savings|cut|reduce|spend less|budget better)\b/.test(q)) return 'saving';
    if (/\b(spent|spending|overspend|where did|why did|expense|category|this month|last month)\b/.test(q)) return 'spending';
    return 'general';
}

/**
 * General investing education framed around the user's own surplus. Mentions
 * concepts only — never a scheme, stock, platform or projected return.
 */
function educationalInvestingNote(ctx) {
    const surplus = Math.max(0, Number(ctx.budget || 0) - Number(ctx.spentThisMonth || 0) - Number(ctx.upcomingBills || 0));

    if (!ctx.budget) {
        return 'Set a monthly budget in Settings first. Knowing what is genuinely left over each month is the starting point for any saving or investing decision.';
    }
    if (surplus <= 0) {
        return 'Right now your spending and bills use up your whole budget, so there is no surplus to invest this month. The usual order is: stop the monthly shortfall, then build an emergency fund, then think about investing.';
    }

    return [
        `On your current numbers, about ${money(surplus)} of this month's budget is not yet spent or committed to bills. A few general principles people commonly use when deciding what to do with a surplus:`,
        '• Emergency fund first — many planners suggest keeping roughly 3–6 months of essential expenses somewhere easy to access before taking investment risk.',
        '• Match the product to the time horizon — money needed within a year or two is usually kept in low-risk options; only money you will not need for many years is typically exposed to market ups and downs.',
        '• A SIP is simply a fixed amount invested at regular intervals. It builds a habit and averages the purchase price over time; it does not remove the risk of loss.',
        '• Diversification spreads money across many holdings so that one bad outcome does not dominate. Low-cost, broadly diversified options are commonly discussed for beginners.',
        '• Check costs (expense ratios, fees) and whether anything is registered with SEBI, and be wary of anyone promising fixed high returns.',
    ].join('\n');
}

const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/gi;

/**
 * Last line of defence on model output: strip links, cap length, and make sure
 * investing answers carry the education disclaimer.
 */
function sanitizeReply(text, { intent, maxChars = 3000 } = {}) {
    let out = String(text || '').replace(URL_PATTERN, '[link removed]').trim();
    if (out.length > maxChars) out = `${out.slice(0, maxChars).trimEnd()}…`;
    if (intent === 'investing' && !out.includes('not investment advice')) {
        out = `${out}\n\n${EDUCATION_DISCLAIMER}`;
    }
    return out;
}

module.exports = { classifyIntent, educationalInvestingNote, sanitizeReply, EDUCATION_DISCLAIMER };
