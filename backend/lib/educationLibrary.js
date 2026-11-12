/**
 * educationLibrary — short, general explanations of money concepts, each tied
 * to a public Indian source and the date Vittova last reviewed the text.
 *
 * Rules: general education only; no products, platforms or promised returns;
 * no tax rates or slabs (they change every year: point to the official
 * portal instead). Where the user's own figures help, they are computed here
 * from their facts, never by the model.
 *
 * Review every entry at least once a year and update REVIEWED.
 */
const REVIEWED = '12 Nov 2026';
const SOURCES = {
    rbi: 'RBI Financial Education (rbi.org.in/FinancialEducation)',
    sebi: 'SEBI Investor Website (investor.sebi.gov.in)',
    ncfe: 'National Centre for Financial Education (ncfe.org.in)',
    sachet: 'RBI Sachet (sachet.rbi.org.in) and the National Cyber Crime Helpline 1930',
    tax: 'Income Tax Department e-filing portal (incometax.gov.in)',
    irdai: 'IRDAI, the insurance regulator (irdai.gov.in)',
};

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

const TOPICS = [
    {
        key: 'scams', source: 'sachet',
        match: /\b(scam|fraud|otp|phishing|fake (call|message|link|app)|kyc (update|expired)|lottery|someone asked (for )?my (pin|otp|password))\b/,
        explain: () => ({
            direct: 'No bank, app or government office will ever ask for your OTP, UPI PIN, card PIN or password. Anyone who asks is trying to take your money.',
            numbers: [],
            reasoning: 'You only enter your UPI PIN to send money, never to receive it. "KYC expired", prize, refund and urgent-block messages are common tricks; links in them often lead to fake pages.',
            action: 'Do not share the code, do not click the link, and call your bank on the number printed on your card or on its official website.',
            next: 'If money has already gone, call 1930 or report at cybercrime.gov.in straight away, and tell your bank. Speed matters.',
        }),
    },
    {
        key: 'emergency_fund', source: 'ncfe',
        match: /\bemergency (fund|savings|corpus|buffer)\b/,
        explain: (f) => ({
            direct: 'An emergency fund is money kept aside, safe and easy to withdraw, for surprises like a job loss, medical bill or urgent repair, so you do not have to borrow.',
            numbers: f.typicalMonthlySpend ? [`Your typical month of spending: ${inr(f.typicalMonthlySpend)}`, `3 months of that: ${inr(f.typicalMonthlySpend * 3)}`, `6 months of that: ${inr(f.typicalMonthlySpend * 6)}`] : [],
            reasoning: 'A common guideline is three to six months of essential expenses: nearer six if your income is irregular or others depend on you.',
            action: f.typicalMonthlySpend ? `Start with one month, ${inr(f.typicalMonthlySpend)}, then build towards three.` : 'Log a few weeks of spending and I can size it from your own numbers.',
            next: 'Keep it separate from your spending account so it is not used by accident.',
        }),
    },
    {
        key: 'inflation', source: 'rbi',
        match: /\binflation\b|\bprices (keep )?(rising|going up)\b/,
        explain: (f) => ({
            direct: 'Inflation means prices rise over time, so the same money buys a little less each year.',
            numbers: f.typicalMonthlySpend ? [`Your typical month today: ${inr(f.typicalMonthlySpend)}`, `The same things after one year at an assumed 6% inflation: about ${inr(f.typicalMonthlySpend * 1.06)}`] : [],
            reasoning: 'Money that earns less than inflation slowly loses buying power, even if the number stays the same. The 6% above is an assumption for illustration, not a forecast.',
            action: 'Keep short-term money safe and accessible; money for goals years away usually needs to grow faster than prices.',
        }),
    },
    {
        key: 'compounding', source: 'sebi',
        match: /\bcompound(ing)?\b|\binterest on interest\b/,
        explain: () => ({
            direct: 'Compounding means your returns start earning returns of their own, so growth speeds up the longer money stays invested.',
            numbers: [],
            reasoning: 'Time does most of the work: starting earlier usually matters more than starting with a bigger amount. Returns are never guaranteed, and some years can be negative.',
            action: 'A small amount saved every month, started early, is the simplest way to put compounding on your side.',
        }),
    },
    {
        key: 'budgeting', source: 'ncfe',
        match: /\b(50[\s/-]?30[\s/-]?20|how (do i|to) (make|create|plan) a budget|budgeting basics|needs (vs|and|versus) wants)\b/,
        explain: (f) => ({
            direct: 'A simple starting rule is 50/30/20: about half for needs, 30% for wants and 20% for saving. It is a guide, not a law; adjust it to your life.',
            numbers: f.budget ? [`Your monthly budget: ${inr(f.budget)}`, `Half for needs: ${inr(f.budget * 0.5)}`, `30% for wants: ${inr(f.budget * 0.3)}`, `20% for saving: ${inr(f.budget * 0.2)}`] : [],
            reasoning: 'Needs are what you must pay (rent, food, transport, bills). Wants are choices. Saving first, then spending what is left, works better than saving what is left.',
            action: 'Set your savings target in Profile and category limits in Budgets, and Vittova keeps track for you.',
        }),
    },
    {
        key: 'credit_score', source: 'rbi',
        match: /\b(credit score|cibil|credit report|credit history)\b/,
        explain: () => ({
            direct: 'A credit score (300 to 900 in India) shows lenders how reliably you repay loans and cards. Higher scores usually mean easier, cheaper credit.',
            numbers: [],
            reasoning: 'Paying every EMI and card bill on time matters most. Using only a small part of your card limit, and not applying for many loans at once, also help.',
            action: 'You can get a free full credit report once a year from each credit bureau. Check it for mistakes.',
            next: 'Vittova does not see your credit score; its Spend Score is about spending habits, not credit.',
        }),
    },
    {
        key: 'loans_emi', source: 'rbi',
        match: /\b(what is (an? )?emi|how (does|do) (an? )?(emi|loan)s? work|principal|interest rate on (a )?loan|prepay(ment)?|personal loan|credit card interest)\b/,
        explain: () => ({
            direct: 'An EMI is a fixed monthly payment made of two parts: interest on what you still owe, and principal that reduces the loan.',
            numbers: [],
            reasoning: 'In the early months most of the EMI is interest; later, more of it reduces the loan. Paying extra early (prepayment) cuts total interest, but check for prepayment charges. Credit card dues carried forward usually cost far more than most loans.',
            action: 'Compare loans by their total cost, not just the EMI. Taking a new loan to pay an existing one usually makes things worse unless it is clearly cheaper overall.',
            next: 'Vittova does not track loans yet. If repayments feel unmanageable, talk to your lender early: options are better before you miss payments.',
        }),
    },
    {
        key: 'insurance', source: 'irdai',
        match: /\b(insurance|term (plan|cover|insurance)|health cover|mediclaim)\b/,
        explain: () => ({
            direct: 'Insurance protects you from costs you could not cover alone. Health cover and, if others depend on your income, term life cover are the usual basics.',
            numbers: [],
            reasoning: 'Term life cover pays only if the insured person dies during the term, which keeps it affordable. Policies that mix insurance with investment are usually costlier and harder to compare.',
            action: 'Before buying, read what is excluded, the waiting periods and the claim process, and buy only from insurers registered with IRDAI.',
            note: 'Vittova does not recommend any policy or insurer.',
        }),
    },
    {
        key: 'tax', source: 'tax',
        match: /\b(income tax|tax (regime|slab|saving|return)|itr|80c|tds)\b/,
        explain: () => ({
            direct: 'Income tax in India depends on your income and the regime you choose each year: the new regime (lower rates, few deductions) or the old one (more deductions).',
            numbers: [],
            reasoning: 'Rates, slabs and limits change in the Union Budget, so always check the current year. Tax-saving products often lock your money in for years: choose them for the product, not only the tax saving.',
            action: 'Use the official tax calculator on the e-filing portal to compare both regimes with your own figures.',
            note: 'Vittova does not track income tax and cannot give tax advice.',
        }),
    },
    {
        key: 'diversification', source: 'sebi',
        match: /\b(diversif\w*|investment risk|risk and return|don'?t put all)\b/,
        explain: () => ({
            direct: 'Diversification means spreading money across different kinds of investments, so one bad result does not sink everything.',
            numbers: [],
            reasoning: 'Higher possible returns come with higher risk of losses. Money needed within a few years usually belongs somewhere steadier than shares.',
            action: 'Match each pot of money to when you will need it, and never invest money you might need soon.',
        }),
    },
];

/** A sourced education answer, or null when no topic matches. */
function composeEducation(question, facts = {}) {
    const q = String(question || '').toLowerCase();
    const topic = TOPICS.find((t) => t.match.test(q));
    if (!topic) return null;
    const parts = topic.explain(facts);
    const source = `Source: ${SOURCES[topic.source]}, reviewed ${REVIEWED}. General financial education, not personal advice.`;
    return { topic: topic.key, parts: { ...parts, note: [parts.note, source].filter(Boolean).join(' ') } };
}

module.exports = { composeEducation, TOPICS, SOURCES, REVIEWED };
