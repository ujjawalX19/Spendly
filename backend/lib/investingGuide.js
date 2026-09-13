/**
 * investingGuide — personalised, education-only investing answers.
 *
 * Built from the user's own numbers and the question's own details (amount,
 * time horizon, goal). Explains priorities, suitable *asset classes and product
 * types* for the horizon, and a compounding illustration at clearly assumed
 * rates. It never names a specific stock, fund scheme, broker or platform and
 * never predicts returns. See FINANCIAL_CONTENT_REVIEW.md.
 */

const r = (n) => Math.round(Number(n) || 0);
const inr = (n) => `₹${r(n).toLocaleString('en-IN')}`;

const NOTE = 'General financial education, not investment advice. Spendly is not a SEBI-registered investment adviser; consider one for decisions about your situation.';

/** "in 5 years", "for 18 months", "10 yr", "long term", "retirement" → years, or null. */
function extractHorizonYears(question) {
    const q = String(question || '').toLowerCase();
    const y = /(\d+(?:\.\d+)?)\s*(?:\+\s*)?(years?|yrs?|y)\b/.exec(q);
    if (y) return Math.min(40, Number(y[1]));
    const m = /(\d+)\s*months?\b/.exec(q);
    if (m) return Math.max(0.1, Number(m[1]) / 12);
    if (/\bretire(ment)?\b/.test(q)) return 20;
    if (/\blong[- ]term\b/.test(q)) return 10;
    if (/\bshort[- ]term\b|\bnext year\b/.test(q)) return 1;
    return null;
}

function detectGoal(question) {
    const q = String(question || '').toLowerCase();
    if (/\b(tax|80c|save tax|elss)\b/.test(q)) return 'tax';
    if (/\bretire(ment)?\b/.test(q)) return 'retirement';
    if (/\b(house|home|flat|down ?payment)\b/.test(q)) return 'home';
    if (/\b(child|kid|education|college)\b/.test(q)) return 'education';
    if (/\bemergency\b/.test(q)) return 'emergency';
    if (/\b(crypto|bitcoin|f&o|futures|options|intraday|trading)\b/.test(q)) return 'speculation';
    if (/\bgold\b/.test(q)) return 'gold';
    return null;
}

/** Future value of a monthly contribution at an assumed constant annual rate. */
function futureValue(monthly, years, annual) {
    const n = Math.round(years * 12);
    const i = annual / 12;
    return i === 0 ? monthly * n : monthly * (((1 + i) ** n - 1) / i) * (1 + i);
}

function horizonPlan(years) {
    const yr = (y) => (y < 1 ? 'less-than-a-year' : `${Math.round(y * 10) / 10}-year`);
    if (years < 3) {
        return {
            label: yr(years),
            mix: 'mostly low-risk options',
            options: 'bank FDs or RDs, liquid or short-duration debt mutual funds',
            why: 'money needed soon should not be exposed to stock-market falls, which can take years to recover',
        };
    }
    if (years < 5) {
        return {
            label: yr(years),
            mix: 'a balanced mix, commonly around 60% lower-risk and 40% equity',
            options: 'FDs or debt funds for the stable part, and a diversified equity or index fund for growth',
            why: 'there is some time to recover from a fall, but not enough to take full equity risk',
        };
    }
    return {
        label: yr(years),
        mix: 'mostly equity for growth, commonly around 70% equity and 30% debt, shifting safer as the goal nears',
        options: 'low-cost diversified index funds through a monthly SIP, with PPF or debt funds for stability',
        why: 'over long periods equity has historically grown faster than inflation, though with large ups and downs along the way',
    };
}

/**
 * @param {object} f        facts from financialInsights.buildFacts
 * @param {string} question
 * @param {number|null} amount amount mentioned in the question
 */
function composeInvestingAnswer(f, question, amount) {
    const goal = detectGoal(question);
    const years = extractHorizonYears(question);
    // Typical monthly spending: prefer real history. Early in the month a
    // projection from a few days is too noisy to size an emergency fund on.
    const monthlySpend = f.threeMonthAverage || f.spentLastMonth || (f.dayOfMonth >= 10 ? f.projectedMonthEnd : 0);
    const emergencyTarget = r(monthlySpend * 6);
    const lumpSum = amount && /\b(lump|one[- ]?time|at once|bonus|lakh|have|got)\b/i.test(question) ? amount : null;
    const monthly = (!lumpSum && amount) || f.savingsTarget || Math.max(0, f.budget - f.projectedMonthEnd) || 0;

    if (goal === 'speculation') {
        return {
            direct: 'Crypto, futures & options and intraday trading are speculation, not a way to build savings. Most retail traders in India lose money in F&O.',
            numbers: [monthly ? `Amount you could invest regularly instead: ${inr(monthly)} a month` : null],
            reasoning: 'Crypto is unregulated in India and very volatile; derivatives can lose more than you put in. Regular investing in diversified, regulated options is how most people actually grow money.',
            action: 'If you still want exposure, cap it at money you can afford to lose entirely, and build your emergency fund first.',
            note: NOTE,
        };
    }

    if (goal === 'emergency' || (!f.budget && !amount)) {
        return {
            direct: emergencyTarget
                ? `A common emergency-fund target for you is about ${inr(emergencyTarget)}, six months of your typical spending.`
                : 'Start with an emergency fund of about six months of your essential spending before investing.',
            numbers: [monthlySpend ? `Your typical monthly spending: ${inr(monthlySpend)}` : null, monthly ? `At ${inr(monthly)} a month it takes about ${Math.ceil(emergencyTarget / monthly)} months to build` : null],
            reasoning: 'An emergency fund stops a job loss or medical bill from forcing you to sell investments at a bad time or borrow at high interest.',
            action: 'Keep it somewhere safe and quick to withdraw, such as a savings account, sweep FD or liquid fund, separate from your spending account.',
            note: NOTE,
        };
    }

    if (goal === 'tax') {
        return {
            direct: 'Under the old tax regime, section 80C lets you deduct up to ₹1,50,000 a year of eligible investments; under the new regime most of these deductions do not apply.',
            numbers: [monthly ? `Spread over a year, ${inr(monthly)} a month is ${inr(monthly * 12)}` : null],
            reasoning: 'Common 80C options differ a lot: PPF is government-backed with a 15-year lock-in; ELSS funds invest in equity with a 3-year lock-in and higher risk; tax-saver FDs lock in for 5 years; EPF contributions already count.',
            action: 'Check which tax regime you file under first. If it is the old regime, count what EPF and insurance premiums already cover before adding more.',
            note: NOTE,
        };
    }

    const plan = horizonPlan(years ?? (goal === 'retirement' ? 20 : goal === 'home' || goal === 'education' ? 7 : 5));
    const illYears = years ? Math.max(1, Math.round(years)) : 5;
    const lines = [];
    if (monthly) {
        const low = futureValue(monthly, illYears, 0.06);
        const high = futureValue(monthly, illYears, 0.10);
        lines.push(`Monthly amount used: ${inr(monthly)}${amount ? '' : f.savingsTarget ? ' (your savings target)' : ' (what your budget pace leaves over)'}`);
        lines.push(`Put in over ${illYears} years: ${inr(monthly * illYears * 12)}`);
        lines.push(`Illustration at an assumed 6% a year: ${inr(low)}; at an assumed 10% a year: ${inr(high)}`);
    }
    if (lumpSum) lines.push(`One-time amount mentioned: ${inr(lumpSum)}`);
    if (emergencyTarget) lines.push(`Emergency fund to have first: about ${inr(emergencyTarget)} (6 months of your spending)`);
    if (f.shortfall) lines.push(`This month you are ${inr(f.shortfall)} short after bills and your target`);

    const direct = f.shortfall
        ? `Before investing, close this month's gap: your spending and bills already exceed your budget by ${inr(f.shortfall)}.`
        : `For a ${plan.label} horizon, people usually choose ${plan.mix}.`;

    return {
        direct,
        numbers: lines,
        reasoning: `${plan.why[0].toUpperCase()}${plan.why.slice(1)}. Typical choices at this horizon: ${plan.options}.${lumpSum ? ' A large one-time amount can be moved in gradually over a few months to reduce the risk of investing just before a fall.' : ''}`,
        action: [
            emergencyTarget ? `1. Build the ${inr(emergencyTarget)} emergency fund first if you do not have it.` : null,
            monthly ? `2. Automate ${inr(monthly)} a month on the day after your salary arrives.` : '2. Set a monthly savings target in Settings so I can plan with real numbers.',
            '3. Prefer low-cost, diversified options: check the expense ratio, choose direct plans, and confirm the fund or adviser is SEBI-registered.',
        ].filter(Boolean).join('\n'),
        note: `Illustrations use assumed constant rates, not forecasts; real returns vary and can be negative. ${years ? '' : 'Tell me your time horizon (e.g. "in 3 years") for a more specific answer. '}${NOTE}`,
    };
}

/** Short, topic-specific explanations for concept questions. */
const CONCEPTS = [
    [/\bsip\b/, 'A SIP (systematic investment plan) invests a fixed amount in a mutual fund every month. It builds a habit and averages the price you pay over time, but it does not remove the risk of loss.'],
    [/\bindex fund|\betf\b/, 'An index fund or ETF simply holds all the companies in a market index, such as the 50 largest listed companies. Costs are low and you get broad diversification instead of betting on a few stocks.'],
    [/\bemergency fund\b/, 'An emergency fund is money kept safe and easy to withdraw, commonly 3–6 months of essential expenses, so surprises do not force you into debt or into selling investments at a loss.'],
    [/\bcompound/, 'Compounding means your returns start earning returns of their own. The longer money stays invested, the bigger this effect, which is why starting early matters more than starting big.'],
    [/\binflation\b/, 'Inflation is the rise in prices over time. Money that earns less than inflation loses buying power, even though the number in your account grows.'],
    [/\bppf\b/, 'PPF is a government-backed savings scheme with a 15-year lock-in, tax benefits under the old regime and an interest rate set by the government each quarter. It suits long-term, low-risk saving.'],
    [/\bnps\b/, 'NPS is a government-regulated retirement scheme mixing equity and debt. Money is largely locked until 60, and part of it must buy a pension at retirement.'],
    [/\b(fd|fixed deposit)\b/, 'A fixed deposit locks money with a bank for a set period at a fixed interest rate. It is predictable and low-risk, but interest is fully taxable and may not beat inflation after tax.'],
    [/\bcredit score\b/, 'A credit score (300–900 in India) reflects how reliably you repay loans and cards. Paying on time and keeping card usage low raise it. Spendly\'s Spend Score is not a credit score.'],
    [/\bmutual fund/, 'A mutual fund pools many investors\' money and invests it in stocks, bonds or both. Equity funds aim for growth with more risk; debt funds are steadier; costs (expense ratio) reduce your returns every year.'],
    [/\bgold\b/, 'Gold can diversify a portfolio because it often behaves differently from stocks, but it pays no interest or dividends. Many planners keep it to a small share, often 5–10%.'],
    [/\b(stock|share|equity)\b/, 'Buying a stock means owning a small part of a company. Single stocks can swing sharply; most beginners get equity exposure through diversified funds instead of picking individual companies.'],
];

function composeConceptAnswer(question) {
    const q = String(question || '').toLowerCase();
    const hit = CONCEPTS.find(([re]) => re.test(q));
    return {
        direct: hit ? hit[1] : 'I can explain money concepts like SIPs, index funds, emergency funds, compounding, inflation, FDs, PPF, NPS, gold or credit scores. Which one?',
        numbers: [],
        reasoning: '',
        action: hit ? 'Ask "how should I invest for 5 years?" to see how this applies to your own numbers.' : '',
        note: NOTE,
    };
}

module.exports = { composeInvestingAnswer, composeConceptAnswer, extractHorizonYears, detectGoal, futureValue, INVESTING_NOTE: NOTE };
