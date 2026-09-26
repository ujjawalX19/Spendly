/**
 * financialInsights — every number Vittova AI may say, computed here.
 *
 * The language model never does financial arithmetic. This module turns the
 * user's own rows into facts (totals, differences, projections, scenarios) and
 * a complete deterministic mentor answer for each kind of question: a short
 * answer, the user's numbers, why it matters, what to do, and the next step.
 * The model may only re-phrase that answer, and routes/ai.js rejects any reply
 * containing a rupee figure or percentage that is not in these facts.
 *
 * What Vittova stores, and therefore what can be analysed: expenses, the
 * monthly budget, the monthly savings target, recurring bills, detected
 * recurring charges, round-ups, the logging streak and Group Pool balances.
 * It does NOT store income, bank balances, savings balances, investments,
 * debts or named goals. Answers say so rather than guess.
 *
 * Pure: rows and `now` in, facts and answers out. All calendar maths in IST.
 */

const appTime = require('./appTime');
const { detectSubscriptions } = require('./subscriptions');
const { composeInvestingAnswer, composeConceptAnswer, futureValue } = require('./investingGuide');
const { computeSafeToSpend, effectiveMonthlyBudget } = require('./safeToSpend');
const { buildInvestmentContext, composeInvestmentAnswer } = require('./investmentDecision');
const { computeBurnRate } = require('./burnRate');
const { affordCheck } = require('./moneyDecisions');

const DISCRETIONARY = ['Food', 'Entertainment', 'Shopping', 'Other'];
const r = (n) => Math.round(Number(n) || 0);
const inr = (n) => `₹${r(n).toLocaleString('en-IN')}`;
const pct = (n) => `${Math.round(n)}%`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function sum(rows) {
    return rows.reduce((t, x) => t + (Number(x.amount) || 0), 0);
}

function byCategory(rows) {
    const out = {};
    for (const x of rows) out[x.category || 'Other'] = (out[x.category || 'Other'] || 0) + (Number(x.amount) || 0);
    return out;
}

function median(values) {
    if (!values.length) return 0;
    const s = [...values].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ─── Intent ─────────────────────────────────────────────────────────────────

const INVESTING_WORDS = /\b(invest|investing|investment|sip|sips|mutual funds?|index funds?|stocks?|shares|equity|etf|crypto|bitcoin|f&o|trading|gold|portfolio|returns|nifty|sensex|ppf|nps|elss|fd|fixed deposit|retire|retirement|save tax|tax saving|80c|lump ?sum|bonus|buy a (house|home|flat)|down ?payment|(house|home|flat|wedding|marriage|college) (in|by|within) \d+|saving for my (wedding|marriage|house|home))\b/;

const INTENTS = [
    // Concept questions ("what is a SIP", "explain index funds"), but not
    // "explain my spending".
    ['education', /\b(what is|what are|what's|whats|meaning of|difference between|how does .* work)\b|\bexplain (?!my\b|why\b|where\b|how\b)/],
    ['debt', /\b(debts?|loans?|emis?|credit card (bill|debt|dues|balance)|pay ?off|repay(ing|ment)?)\b/],
    // Investing questions get a personalised, education-only plan.
    ['investing', INVESTING_WORDS],
    ['what_if', /\b(what if|what happens if|if i (save|saved|put aside|cut|reduce|spend|spent|increase|stop)|(income|salary|pay) (drops?|falls?|is cut|reduces?|goes down)|how much (will|would) i have)\b/],
    ['emergency_fund', /\bemergency (fund|savings|money|corpus|buffer)\b/],
    ['priorities', /\b(what should i (improve|fix|focus on|work on|do first|change)|where (should|do) i start|first step|priorit(y|ies|ise|ize)|biggest (problem|issue|opportunity|risk|mistake)|financial health|improve first|how am i doing overall)\b/],
    ['finish_month', /\b(finish (the|this) month|end of (the|this) month|make it (to|through)|last (till|until|through)|run out|survive (the|this) month|rest of the month)\b/],
    ['safe_to_spend', /\b(safe to spend|safely spend|how much (can|do) i (spend|have)( left)?|left to spend|daily (limit|budget)|per day)\b/],
    ['affordability', /\b(can i afford|afford|should i buy|worth buying|can i spend|is it ok to (buy|spend))\b/],
    ['subscriptions', /\b(subscriptions?|recurring|autopay|mandate|netflix|spotify|prime|renewal|membership)\b/],
    ['unusual_spending', /\b(unusual|weird|strange|spike|suspicious|biggest|largest|highest (purchase|expense|payment)|out of (the )?ordinary)\b/],
    ['goal_planning', /\b(goal|save up|saving for|reach|target|how long (will it|to)|by (next|december|january|diwali)|emergency fund of)\b/],
    ['monthly_summary', /\b(summary|summari[sz]e|overview|recap|how (am i|did i) do(ing)?|this month so far|month in review)\b/],
    ['spending_analysis', /\b(why did i|overspen[dt]|where (did|does|is) (my|the) money go|spent (so )?much|spending (more|less|so high|high|too much)|why is my \w+ (spending|bill)|compared? (to|with) last month|increase|decrease|categor(y|ies)|(explain|break ?down|analy[sz]e) my (spending|expenses))\b/],
    ['budget_advice', /\b(budget|stick to|stay within|over budget|limit|allowance)\b/],
    ['savings_advice', /\b(save|saving|savings|cut (back|down)?|reduce|spend less|cheaper)\b/],
    ['education', /\b(how does|how do|compound|compounding|inflation|credit score|needs vs wants|sinking fund|opportunity cost|lifestyle inflation|cash flow)\b/],
];

function classifyIntent(question) {
    const q = String(question || '').toLowerCase();
    for (const [intent, re] of INTENTS) if (re.test(q)) return intent;
    return 'general';
}

/** First rupee amount in the question: "₹3,000", "3000 rs", "5k", "1.5 lakh". */
function extractAmount(question) {
    const q = String(question || '').toLowerCase().replace(/,/g, '');
    const m = /(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)\s*(k|lakh|lac)?|(\d+(?:\.\d+)?)\s*(k|lakh|lac)?\s*(?:rs|rupees|₹|inr)\b|\b(\d+(?:\.\d+)?)\s*(k|lakh|lac)\b|\b(\d{3,8})\b/.exec(q);
    if (!m) return null;
    const value = Number(m[1] || m[3] || m[5] || m[7]);
    const unit = m[2] || m[4] || m[6];
    const mult = unit === 'k' ? 1000 : unit === 'lakh' || unit === 'lac' ? 100000 : 1;
    const amount = value * mult;
    return Number.isFinite(amount) && amount > 0 && amount <= 100_000_000 ? Math.round(amount) : null;
}

/** "after 2 years", "for 18 months", "in 6 months" → months, or null. */
function extractMonths(question) {
    const q = String(question || '').toLowerCase();
    const y = /(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\b/.exec(q);
    if (y) return Math.min(480, Math.round(Number(y[1]) * 12));
    const m = /(\d+)\s*months?\b/.exec(q);
    if (m) return Math.min(480, Number(m[1]));
    return null;
}

/** "drops 20%", "by 20 percent" → 20, or null. */
function extractPercent(question) {
    const m = /(\d{1,2}(?:\.\d+)?)\s*(?:%|percent|per cent)/.exec(String(question || '').toLowerCase());
    return m ? Number(m[1]) : null;
}

// ─── Facts ──────────────────────────────────────────────────────────────────

/**
 * @param {object}  args
 * @param {object}  args.profile    { monthly_budget, investment_target, streak_current, total_chillar }
 * @param {Array}   args.expenses   rows from the last ~4 months: amount, category, description, occurred_at
 * @param {Array}   args.bills      recurring_bills rows (name, amount, due_day, is_active)
 * @param {object}  [args.groupPool] { groups, youOwe, owedToYou } in rupees, when loaded
 * @param {Date}    [args.now]
 */
function buildFacts({ profile = {}, expenses = [], bills = [], groupPool = null, now = new Date() }) {
    const monthStart = appTime.startOfMonth(now);
    const nextMonthStart = appTime.startOfNextMonth(now);
    const prevStart = appTime.startOfMonthsAgo(1, now);
    const day = appTime.dayOfMonth(now);
    const daysInMonth = appTime.daysInMonth(now);
    const daysLeft = appTime.daysRemainingInMonth(now);
    const t = (x) => new Date(x.occurred_at).getTime();

    // An expense dated next month (a planned payment) is not this month's spending.
    const thisMonth = expenses.filter((x) => t(x) >= monthStart.getTime() && t(x) < nextMonthStart.getTime());
    const lastMonth = expenses.filter((x) => t(x) >= prevStart.getTime() && t(x) < monthStart.getTime());

    // The three complete months before this one, and how many of them have any
    // expenses: averaging over months with no data would understate spending.
    const priorMonths = [1, 2, 3].map((n) => {
        const start = appTime.startOfMonthsAgo(n, now).getTime();
        const end = appTime.startOfMonthsAgo(n - 1, now).getTime();
        return expenses.filter((x) => t(x) >= start && t(x) < end);
    });
    const monthsWithData = priorMonths.filter((rows) => rows.length > 0).length;
    const priorThree = priorMonths.flat();

    // Same point in last month, for a fair "so far" comparison.
    const { year: py, month: pm } = appTime.zonedParts(prevStart);
    const prevDays = new Date(Date.UTC(py, pm, 0)).getUTCDate();
    const prevSamePoint = appTime.zonedTimeToUtc(py, pm, Math.min(day, prevDays), 23, 59, 59);
    const lastMonthSoFar = lastMonth.filter((x) => t(x) <= prevSamePoint.getTime());

    const budget = effectiveMonthlyBudget(profile);
    const target = Number(profile.investment_target) || 0;
    const spent = sum(thisMonth);
    const spentLast = sum(lastMonth);
    const spentLastSoFar = sum(lastMonthSoFar);

    // The dashboard's Safe-to-Spend, exactly (lib/safeToSpend).
    const sts = computeSafeToSpend({ monthlyBudget: budget, totalSpent: spent, bills, investmentTarget: target, now });
    const leftAfterCommitments = budget - spent - sts.upcomingBills - target;

    const projected = day > 0 ? (spent / day) * daysInMonth : spent;
    const dailyPace = day > 0 ? spent / day : 0;
    const burn = computeBurnRate({ expenses: thisMonth, monthlyBudget: budget, now });
    const budgetLeft = budget - spent;

    const catNow = byCategory(thisMonth);
    const catLastSoFar = byCategory(lastMonthSoFar);
    const categories = Object.keys({ ...catNow, ...catLastSoFar })
        .map((category) => ({
            category,
            thisMonth: r(catNow[category] || 0),
            lastMonthSamePoint: r(catLastSoFar[category] || 0),
            change: r((catNow[category] || 0) - (catLastSoFar[category] || 0)),
        }))
        .sort((a, b) => b.thisMonth - a.thisMonth);

    // Last 7 local days vs the 7 before.
    const dayStart = appTime.startOfDay(now).getTime();
    const DAY = 86400000;
    const last7 = sum(expenses.filter((x) => t(x) >= dayStart - 6 * DAY));
    const prev7 = sum(expenses.filter((x) => t(x) >= dayStart - 13 * DAY && t(x) < dayStart - 6 * DAY));

    // Unusual: this month's expenses far above the user's typical amount for that category.
    const history = expenses.filter((x) => t(x) < monthStart.getTime());
    const unusual = thisMonth
        .map((x) => {
            const typical = median(history.filter((h) => (h.category || 'Other') === (x.category || 'Other')).map((h) => Number(h.amount) || 0));
            return { description: x.description || x.category || 'Expense', category: x.category || 'Other', amount: r(x.amount), typical: r(typical), date: appTime.localDateKey(new Date(x.occurred_at)) };
        })
        .filter((x) => x.typical > 0 ? x.amount >= Math.max(3 * x.typical, x.typical + 500) : x.amount >= 2000)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3);

    const avgPrior = monthsWithData ? sum(priorThree) / monthsWithData : 0;
    const spikes = monthsWithData === 0 ? [] : Object.entries(catNow)
        .map(([category, amount]) => {
            const avg = sum(priorThree.filter((x) => (x.category || 'Other') === category)) / monthsWithData;
            return { category, thisMonth: r(amount), threeMonthAverage: r(avg), aboveBy: r(amount - avg) };
        })
        .filter((c) => c.threeMonthAverage > 0 && c.thisMonth > c.threeMonthAverage * 1.5 && c.thisMonth - c.threeMonthAverage >= 500)
        .sort((a, b) => b.aboveBy - a.aboveBy);

    const subs = detectSubscriptions(expenses, now);

    // Saving scenario: trim the two biggest discretionary categories by 20%.
    const cutCandidates = categories.filter((c) => DISCRETIONARY.includes(c.category) && c.thisMonth > 0).slice(0, 2);
    const cutPercent = 20;
    const cuts = cutCandidates.map((c) => ({ category: c.category, current: c.thisMonth, saving: r(c.thisMonth * cutPercent / 100) }));

    // Typical month, for emergency-fund sizing: real history first; a
    // projection from under ten days is too noisy to use.
    const typicalMonthlySpend = avgPrior || spentLast || (day >= 10 ? projected : 0);

    // What a month can realistically put aside: the savings target when set,
    // otherwise what the budget leaves at the current pace.
    const monthlySavingCapacity = target || Math.max(0, budget - projected);

    return {
        today: appTime.localDateKey(now),
        dayOfMonth: day,
        daysInMonth,
        daysLeft,
        incomeTracked: false,
        budget: r(budget),
        savingsTarget: r(target),
        spentThisMonth: r(spent),
        spentLastMonth: r(spentLast),
        spentLastMonthSamePoint: r(spentLastSoFar),
        changeVsLastMonthSamePoint: r(spent - spentLastSoFar),
        projectedMonthEnd: r(projected),
        dailyPace: r(dailyPace),
        expectedRestOfMonth: r(dailyPace * daysLeft),
        budgetUsedPercent: budget > 0 ? Math.round((spent / budget) * 100) : null,
        budgetLeft: r(budgetLeft),
        projectedOverBudgetBy: budget > 0 && projected > budget ? r(projected - budget) : 0,
        budgetRunsOut: burn.willGoBroke && budgetLeft >= 0 && burn.brokeDate ? { date: burn.brokeDate, inDays: dailyPace > 0 ? Math.floor(budgetLeft / dailyPace) : null } : null,
        upcomingBills: sts.upcomingBills,
        recurringBillsMonthly: r((bills || []).filter((b) => b && b.is_active !== false).reduce((s, b) => s + (Number(b.amount) || 0), 0)),
        nextMonthStart: appTime.localDateKey(nextMonthStart),
        budgetIsDefault: !(Number(profile.monthly_budget) > 0),
        upcomingBillList: sts.upcomingBillList.slice(0, 6),
        safeToSpendRemaining: sts.remaining,
        safeToSpendPerDay: sts.daily,
        shortfall: leftAfterCommitments < 0 ? r(-leftAfterCommitments) : 0,
        categories: categories.slice(0, 6),
        last7Days: r(last7),
        previous7Days: r(prev7),
        unusualExpenses: unusual,
        categorySpikes: spikes.slice(0, 3),
        threeMonthAverage: r(avgPrior),
        monthsOfHistory: monthsWithData,
        typicalMonthlySpend: r(typicalMonthlySpend),
        monthlySavingCapacity: r(monthlySavingCapacity),
        subscriptions: subs.subscriptions.filter((s) => s.isActive).slice(0, 6).map((s) => ({ merchant: s.merchant, monthly: s.monthlyAmount, annual: s.monthlyAmount * 12 })),
        subscriptionsMonthly: r(subs.activeMonthlyTotal),
        subscriptionsAnnual: r(subs.activeMonthlyTotal * 12),
        savingScenario: { percent: cutPercent, cuts, total: cuts.reduce((s, c) => s + c.saving, 0) },
        roundUpsTotal: Math.round((Number(profile.total_chillar) || 0) * 100) / 100,
        streakDays: Number(profile.streak_current) || 0,
        groupPool: groupPool && groupPool.groups > 0 ? { groups: groupPool.groups, youOwe: r(groupPool.youOwe), owedToYou: r(groupPool.owedToYou) } : null,
        transactionsThisMonth: thisMonth.length,
        confidence: thisMonth.length >= 10 && lastMonth.length >= 10 ? 'good' : thisMonth.length >= 5 ? 'limited' : 'insufficient',
    };
}

/**
 * The structured context sent to the language model. Only data Vittova
 * actually has; everything it lacks is listed under `notTracked` so the model
 * says so instead of assuming. No names, emails, ids or tokens.
 */
function mentorContext(f) {
    return {
        date: { today: f.today, dayOfMonth: f.dayOfMonth, daysInMonth: f.daysInMonth, daysLeftIncludingToday: f.daysLeft },
        budget: { monthly: f.budget, spentThisMonth: f.spentThisMonth, usedPercent: f.budgetUsedPercent, left: f.budgetLeft, projectedMonthEnd: f.projectedMonthEnd, projectedOverBy: f.projectedOverBudgetBy, dailyPace: f.dailyPace, runsOut: f.budgetRunsOut },
        safeToSpend: { perDay: f.safeToSpendPerDay, remainingThisMonth: f.safeToSpendRemaining, shortfall: f.shortfall, formula: 'monthly budget − spent this month − active bills due today or later − monthly savings target, spread over the days left' },
        spending: { categoriesThisMonth: f.categories, lastMonthTotal: f.spentLastMonth, lastMonthSamePoint: f.spentLastMonthSamePoint, changeVsLastMonthSamePoint: f.changeVsLastMonthSamePoint, last7Days: f.last7Days, previous7Days: f.previous7Days, averageMonthPrior: f.threeMonthAverage, monthsOfHistory: f.monthsOfHistory },
        unusualSpending: { expenses: f.unusualExpenses, categorySpikes: f.categorySpikes },
        recurringBills: { dueRestOfMonth: f.upcomingBills, bills: f.upcomingBillList },
        subscriptions: { monthly: f.subscriptionsMonthly, annual: f.subscriptionsAnnual, detected: f.subscriptions },
        savings: { monthlySavingsTarget: f.savingsTarget, roundUpsNoted: f.roundUpsTotal },
        habits: { loggingStreakDays: f.streakDays, expensesThisMonth: f.transactionsThisMonth, dataConfidence: f.confidence },
        groupPool: f.groupPool,
        notTracked: ['income', 'bank balance', 'savings balance', 'investments', 'debts and loans', 'named goals'],
    };
}

// ─── Deterministic answers ──────────────────────────────────────────────────

function answer(parts) {
    return {
        direct: parts.direct,
        numbers: (parts.numbers || []).filter(Boolean),
        priorities: (parts.priorities || []).filter(Boolean),
        missing: parts.missing || '',
        approaches: (parts.approaches || []).filter(Boolean),
        tradeoffs: parts.tradeoffs || '',
        reasoning: parts.reasoning || '',
        action: parts.action || '',
        next: parts.next || '',
        note: parts.note || '',
    };
}

function toText(a) {
    const out = [a.direct];
    if (a.numbers.length) out.push(`**Your numbers**\n${a.numbers.map((n) => `• ${n}`).join('\n')}`);
    if (a.priorities && a.priorities.length) out.push(`**Priorities**\n${a.priorities.map((p) => `• ${p}`).join('\n')}`);
    if (a.missing) out.push(`**What's missing**\n${a.missing}`);
    if (a.approaches && a.approaches.length) out.push(`**Possible approaches**\n${a.approaches.map((x) => `\u2022 ${x}`).join('\n')}`);
    if (a.tradeoffs) out.push(`**Trade-offs**\n${a.tradeoffs}`);
    if (a.reasoning) out.push(`**Why it matters**\n${a.reasoning}`);
    if (a.action) out.push(`**What I recommend**\n${a.action}`);
    if (a.next) out.push(`**Next step**\n${a.next}`);
    if (a.note) out.push(`**Note**\n${a.note}`);
    return out.join('\n\n');
}

const EDUCATION_NOTE = 'General financial education, not investment advice. Vittova is not a SEBI-registered investment adviser.';
const INCOME_NOTE = 'Vittova does not track income or bank balances, so this is based on your budget and spending.';

/** Ranked list of what most deserves attention right now. */
function priorityList(f) {
    const items = [];
    if (f.shortfall) items.push({ key: 'shortfall', title: `Close this month's ${inr(f.shortfall)} gap`, detail: `Spending, bills still due and your savings target already exceed your ${inr(f.budget)} budget by ${inr(f.shortfall)}.`, step: 'Pause non-essential spending until the month ends, or lower this month\'s savings target in Settings.' });
    else if (f.projectedOverBudgetBy && f.confidence !== 'insufficient') items.push({ key: 'pace', title: `Slow down: on pace to overshoot by ${inr(f.projectedOverBudgetBy)}`, detail: `At ${inr(f.dailyPace)} a day you'd finish near ${inr(f.projectedMonthEnd)} against a ${inr(f.budget)} budget.`, step: `Keep daily spending near ${inr(f.safeToSpendPerDay)} for the next ${plural(f.daysLeft, 'day')}.` });
    if (f.categorySpikes.length) { const s = f.categorySpikes[0]; items.push({ key: 'spike', title: `${s.category} is ${inr(s.aboveBy)} above your usual`, detail: `${s.category}: ${inr(s.thisMonth)} this month vs a ${inr(s.threeMonthAverage)} monthly average.`, step: `Set yourself a ${s.category} cap for the rest of the month.` }); }
    if (f.groupPool?.youOwe) items.push({ key: 'group', title: `Settle the ${inr(f.groupPool.youOwe)} you owe in Group Pool`, detail: 'Unsettled shared bills are money already committed.', step: 'Open Group Pool and record the payment once you have paid.' });
    if (f.subscriptionsMonthly) items.push({ key: 'subs', title: `Review ${inr(f.subscriptionsMonthly)} a month of recurring charges`, detail: `That is ${inr(f.subscriptionsAnnual)} a year.`, step: 'Open Recurring charges and cancel anything you no longer use.' });
    if (!f.savingsTarget) items.push({ key: 'target', title: 'Set a monthly savings target', detail: 'Without one, saving only happens if money is left over.', step: 'Add a monthly savings target in Settings; it is set aside in your Safe-to-Spend.' });
    if (f.confidence === 'insufficient') items.push({ key: 'data', title: 'Log expenses consistently', detail: `Only ${plural(f.transactionsThisMonth, 'expense')} logged this month, too few for reliable patterns.`, step: 'Turn on automatic UPI detection or log each expense for a week.' });
    return items;
}

function composeAnswer(intent, f, question) {
    const insufficient = f.confidence === 'insufficient';
    const top = f.categories[0];
    const amount = extractAmount(question);
    const q = String(question || '').toLowerCase();

    if (insufficient && ['spending_analysis', 'unusual_spending', 'monthly_summary', 'savings_advice'].includes(intent)) {
        return answer({
            direct: `I don't have enough of your spending yet to analyse it properly: ${plural(f.transactionsThisMonth, 'expense')} logged this month.`,
            numbers: [`Spent so far this month: ${inr(f.spentThisMonth)}`, `Safe to spend: ${inr(f.safeToSpendPerDay)} a day`],
            reasoning: 'Patterns and trends need a few weeks of expenses; with less, any analysis would be guesswork.',
            action: 'Log every expense for about a week, or turn on automatic UPI detection.',
            next: 'Ask me again next week and I will compare your categories and pace.',
        });
    }

    switch (intent) {
        case 'spending_analysis': {
            const up = f.categories.filter((c) => c.change > 0).sort((a, b) => b.change - a.change).slice(0, 2);
            const diff = f.changeVsLastMonthSamePoint;
            const direct = diff > 0
                ? `You've spent ${inr(diff)} more than at the same point last month (${inr(f.spentThisMonth)} vs ${inr(f.spentLastMonthSamePoint)}).`
                : diff < 0
                    ? `You're actually spending ${inr(-diff)} less than at the same point last month (${inr(f.spentThisMonth)} vs ${inr(f.spentLastMonthSamePoint)}).`
                    : `Your spending is level with the same point last month at ${inr(f.spentThisMonth)}.`;
            const saving = up.reduce((s, c) => s + r(c.thisMonth * 0.2), 0);
            return answer({
                direct,
                numbers: [...up.map((c) => `${c.category}: ${inr(c.thisMonth)} this month, up ${inr(c.change)}`), ...f.categorySpikes.slice(0, 1).map((s) => `${s.category} vs your monthly average: ${inr(s.thisMonth)} vs ${inr(s.threeMonthAverage)}`)],
                reasoning: up.length ? `Most of the increase comes from ${up.map((c) => c.category).join(' and ')}. Increases in flexible categories are the easiest to reverse.` : 'No category rose meaningfully.',
                action: up.length ? `Trimming ${up.map((c) => c.category).join(' and ')} by 20% would save about ${inr(saving)} for the rest of this month's pace.` : 'Keep going at your current pace.',
                next: up.length ? `Before your next ${up[0].category} purchase, check it against your ${inr(f.safeToSpendPerDay)} daily Safe-to-Spend.` : '',
                note: f.confidence === 'limited' ? 'Based on limited history, so treat it as a rough picture.' : '',
            });
        }
        case 'budget_advice': {
            const onTrack = f.projectedMonthEnd <= f.budget;
            return answer({
                direct: onTrack
                    ? `You're on track: at this pace you'll finish around ${inr(f.projectedMonthEnd)} against a ${inr(f.budget)} budget.`
                    : `At this pace you'll overshoot your ${inr(f.budget)} budget by about ${inr(f.projectedOverBudgetBy)}.`,
                numbers: [`Spent: ${inr(f.spentThisMonth)} (${pct(f.budgetUsedPercent)} of budget) on day ${f.dayOfMonth} of ${f.daysInMonth}`, f.upcomingBills ? `Bills still due: ${inr(f.upcomingBills)}` : null, `Safe to spend: ${inr(f.safeToSpendPerDay)} a day for ${plural(f.daysLeft, 'day')}`],
                reasoning: top ? `${top.category} is your biggest category at ${inr(top.thisMonth)}.` : '',
                action: onTrack ? `Keep daily spending near ${inr(f.safeToSpendPerDay)}.` : `To land on budget, keep to about ${inr(f.safeToSpendPerDay)} a day${top ? ` and ease off ${top.category}` : ''}.`,
                next: /\bplan\b/.test(q) ? `Plan the rest of the month as: bills ${inr(f.upcomingBills)}, savings ${inr(f.savingsTarget)}, and ${inr(f.safeToSpendPerDay)} a day for everything else.` : '',
            });
        }
        case 'savings_advice': {
            const s = f.savingScenario;
            const howMuch = /\bhow much (should|do) i (save|keep)\b/.test(q);
            return answer({
                direct: howMuch
                    ? (f.savingsTarget ? `Your current monthly savings target is ${inr(f.savingsTarget)}. A common guideline is 20% of take-home pay, but Vittova doesn't know your income.` : "You haven't set a savings target. A common guideline is 20% of take-home pay; Vittova doesn't know your income, so start with an amount your budget can carry.")
                    : s.total > 0 ? `Cutting your two biggest flexible categories by ${s.percent}% would free up about ${inr(s.total)} a month.` : "There isn't enough flexible spending logged this month to suggest specific cuts.",
                numbers: [...s.cuts.map((c) => `${c.category}: ${inr(c.current)} now → save ${inr(c.saving)}`), f.subscriptionsMonthly ? `Recurring charges: ${inr(f.subscriptionsMonthly)}/month (${inr(f.subscriptionsAnnual)}/year)` : null, `What your budget pace leaves this month: ${inr(Math.max(0, f.budget - f.projectedMonthEnd))}`],
                reasoning: 'Flexible categories (food, shopping, entertainment) are usually the easiest to change without affecting essentials. Saving first, then spending what is left, works better than saving whatever remains.',
                action: s.cuts.length ? `Pick one concrete habit in ${s.cuts[0].category}, such as fewer delivery orders, and review your recurring charges.` : 'Log expenses for a week so I can see where savings could come from.',
                next: f.savingsTarget ? 'Set your savings target aside as soon as money comes in, before spending.' : 'Set a monthly savings target in Settings so Safe-to-Spend reserves it for you.',
            });
        }
        case 'goal_planning': {
            const monthlyCapacity = f.monthlySavingCapacity;
            if (!amount) {
                return answer({
                    direct: f.savingsTarget ? `Your monthly savings target is ${inr(f.savingsTarget)}. Vittova doesn't store named goals yet, so tell me the amount.` : "You haven't set a monthly savings target, and Vittova doesn't store named goals yet.",
                    action: 'Ask "How long to save ₹50,000?" with your goal amount and I will work out the timeline.',
                    next: f.savingsTarget ? '' : 'Set a monthly savings target in Settings first.',
                });
            }
            if (!monthlyCapacity) {
                return answer({
                    direct: `I can't estimate a timeline for ${inr(amount)} yet: there's no savings target set and your spending pace uses the whole budget.`,
                    numbers: [`Projected month end: ${inr(f.projectedMonthEnd)} vs budget ${inr(f.budget)}`],
                    action: 'Set a monthly savings target in Settings, then ask again.',
                });
            }
            const months = Math.ceil(amount / monthlyCapacity);
            const faster = f.savingScenario.total ? Math.ceil(amount / (monthlyCapacity + f.savingScenario.total)) : null;
            return answer({
                direct: `Putting aside ${inr(monthlyCapacity)} a month, reaching ${inr(amount)} would take about ${plural(months, 'month')}.`,
                numbers: [`Goal: ${inr(amount)}`, `Monthly amount used: ${inr(monthlyCapacity)} (${f.savingsTarget ? 'your savings target' : 'what your budget pace leaves over'})`],
                reasoning: 'A fixed monthly amount set aside first is the most reliable way to reach a goal.',
                action: faster && faster < months ? `Adding the ${inr(f.savingScenario.total)} from trimming ${f.savingScenario.cuts.map((c) => c.category).join(' and ')} would bring it down to about ${plural(faster, 'month')}.` : '',
                next: 'Keep the goal money separate from your spending account so it is not spent by accident.',
                note: 'This ignores interest and assumes the same amount every month.',
            });
        }
        case 'safe_to_spend':
            return answer({
                direct: f.shortfall ? `Nothing is safe to spend right now: bills and your savings target already exceed what's left by ${inr(f.shortfall)}.` : `You can safely spend about ${inr(f.safeToSpendPerDay)} a day for the next ${plural(f.daysLeft, 'day')} (${inr(f.safeToSpendRemaining)} in total).`,
                numbers: [`Budget: ${inr(f.budget)}`, `Spent: ${inr(f.spentThisMonth)}`, `Bills still due: ${inr(f.upcomingBills)}`, `Savings target: ${inr(f.savingsTarget)}`, f.dailyPace ? `Your pace so far: ${inr(f.dailyPace)} a day` : null],
                reasoning: 'Safe to spend = budget − spent − bills still due − savings target, spread over the days left. It changes as you spend, add bills or change your target.',
                action: f.dailyPace > f.safeToSpendPerDay && !f.shortfall ? `Your pace is above it, so aim a little lower than ${inr(f.safeToSpendPerDay)} on some days to keep a buffer.` : '',
                next: f.upcomingBillList.length ? `Your next bill: ${f.upcomingBillList[0].name} ${inr(f.upcomingBillList[0].amount)} on day ${f.upcomingBillList[0].dueDay}.` : '',
                note: INCOME_NOTE,
            });
        case 'finish_month': {
            const room = f.safeToSpendRemaining;
            const risky = f.shortfall || f.expectedRestOfMonth > room;
            return answer({
                direct: f.shortfall
                    ? `This month is already ${inr(f.shortfall)} over once bills and your savings target are counted, so the goal is to spend only on essentials.`
                    : risky
                        ? `At your current pace you'd need about ${inr(f.expectedRestOfMonth)} for the rest of the month, but only ${inr(room)} is safe to spend.`
                        : `You're on track to finish the month: your pace needs about ${inr(f.expectedRestOfMonth)} and ${inr(room)} is safe to spend.`,
                numbers: [`Safe to spend: ${inr(f.safeToSpendPerDay)} a day for ${plural(f.daysLeft, 'day')}`, f.dailyPace ? `Your pace: ${inr(f.dailyPace)} a day` : null, f.budgetRunsOut ? `At this pace your budget runs out around ${f.budgetRunsOut.date}` : null, f.upcomingBills ? `Bills still due: ${inr(f.upcomingBills)}` : null],
                reasoning: risky ? 'Running out before month end usually means paying for essentials on credit or dipping into savings.' : 'Keeping a small buffer protects you from one unexpected expense.',
                action: risky ? `Cap spending at ${inr(f.safeToSpendPerDay)} a day${top && DISCRETIONARY.includes(top.category) ? ` and pause ${top.category} extras` : ''} until the month ends.` : `Keep to about ${inr(f.safeToSpendPerDay)} a day and you'll finish with room to spare.`,
                next: 'Check your Safe-to-Spend each morning before your first purchase.',
                note: INCOME_NOTE,
            });
        }
        case 'unusual_spending': {
            const u = f.unusualExpenses;
            const s = f.categorySpikes;
            if (!u.length && !s.length) return answer({ direct: 'Nothing unusual stands out this month compared with your recent history.', note: f.monthsOfHistory ? '' : "I don't have previous months to compare with yet." });
            return answer({
                direct: u.length ? `Your most unusual expense this month is ${u[0].description} at ${inr(u[0].amount)}.` : `${s[0].category} is well above your usual level this month.`,
                numbers: [...u.map((x) => `${x.description} (${x.category}, ${x.date}): ${inr(x.amount)}${x.typical ? `, typical ${inr(x.typical)}` : ''}`), ...s.map((c) => `${c.category}: ${inr(c.thisMonth)} vs monthly average ${inr(c.threeMonthAverage)}`)],
                reasoning: 'One-off large purchases are fine when planned; unplanned ones are where budgets usually slip.',
                action: 'Check these are expected. If a charge looks wrong, contact your bank or the merchant.',
            });
        }
        case 'subscriptions':
            return answer({
                direct: f.subscriptions.length ? `You have ${plural(f.subscriptions.length, 'recurring charge')} still active, costing ${inr(f.subscriptionsMonthly)} a month (${inr(f.subscriptionsAnnual)} a year).` : 'I have not found any active recurring charges in your last four months of expenses.',
                numbers: f.subscriptions.map((s) => `${s.merchant}: ${inr(s.monthly)}/month (${inr(s.annual)}/year)`),
                reasoning: f.subscriptions.length ? 'Small monthly charges are easy to forget, but they add up over a year.' : '',
                action: f.subscriptions.length ? 'Open Recurring charges to see cancellation steps, and revoke unused UPI AutoPay mandates in your UPI app.' : '',
                next: f.subscriptions.length ? 'Cancel the one you used least in the last month first.' : '',
                note: 'Vittova detects these from repeated payments; it cannot see whether you actually use a service.',
            });
        case 'monthly_summary':
            return answer({
                direct: `Day ${f.dayOfMonth} of ${f.daysInMonth}: you've spent ${inr(f.spentThisMonth)} of your ${inr(f.budget)} budget.`,
                numbers: [top ? `Top category: ${top.category} ${inr(top.thisMonth)}` : null, `Last 7 days: ${inr(f.last7Days)} (previous 7 days: ${inr(f.previous7Days)})`, `Projected month end: ${inr(f.projectedMonthEnd)}`, `Recurring charges: ${inr(f.subscriptionsMonthly)}/month`, f.streakDays ? `Logging streak: ${plural(f.streakDays, 'day')}` : null],
                reasoning: f.projectedMonthEnd > f.budget ? 'Your pace is above your budget, so small daily changes now matter more than a big cut later.' : 'You are within your budget at the current pace.',
                action: f.projectedMonthEnd > f.budget ? `Keep to about ${inr(f.safeToSpendPerDay)} a day to stay within budget.` : 'Keep your current pace and put any leftover towards savings.',
            });
        case 'affordability': {
            if (!amount) return answer({ direct: 'Tell me the price, e.g. "Can I afford ₹3,000 headphones?", and I will check it against your budget, bills and spending pace.' });
            // The Afford-It Check itself (lib/moneyDecisions), so the answer
            // matches the dashboard's check exactly.
            const check = affordCheck(f, { amount });
            return answer({
                direct: `${check.headline} ${check.detail}`,
                numbers: [
                    `Safe to spend remaining: ${inr(check.safeToSpendRemaining)}`,
                    check.shortfall ? `Shortfall: ${inr(check.shortfall)}` : `Left afterwards: ${inr(check.leftAfter)}, about ${inr(check.leftAfterPerDay)} a day for ${plural(f.daysLeft, 'day')}`,
                    check.expectedRestOfMonth !== null ? `Your usual spending for the rest of the month: about ${inr(check.expectedRestOfMonth)}` : null,
                    f.upcomingBills ? `Bills still due: ${inr(f.upcomingBills)}` : null,
                ],
                reasoning: check.verdict === 'can_afford' ? 'Safe to spend already accounts for bills still due and your savings target, and your normal spending still fits afterwards.'
                    : check.verdict === 'wait' ? 'The purchase would use most of your remaining buffer, so ordinary spending later this month could push you over.'
                        : 'Buying now would mean going over budget or dipping into money set aside for bills or savings.',
                action: check.verdict === 'can_afford' ? 'Go ahead if it is planned, and keep to your daily Safe-to-Spend afterwards.'
                    : check.saferDate ? `If it can wait, buy it from ${check.saferDate.label}.`
                        : check.monthsToSave ? `Set aside ${inr(f.monthlySavingCapacity)} a month and you could cover the gap in about ${plural(check.monthsToSave, 'month')}.`
                            : check.verdict === 'wait' ? `If you buy it now, keep other spending under ${inr(check.leftAfterPerDay)} a day.`
                                : 'Treat it as a savings goal rather than a purchase this month.',
                next: check.verdict === 'can_afford' ? '' : `Treat ${inr(amount)} as a savings goal rather than a purchase this month.`,
                note: INCOME_NOTE,
            });
        }
        case 'what_if': {
            if (/\b(income|salary|pay)\b/.test(q)) {
                const p = extractPercent(question);
                const reduced = p ? r(f.budget * (1 - p / 100)) : null;
                return answer({
                    direct: "I can't model an income change because Vittova doesn't track your income.",
                    numbers: p ? [`If your budget had to shrink by ${pct(p)}: ${inr(f.budget)} → ${inr(reduced)}`, `Your projected spending this month: ${inr(f.projectedMonthEnd)}`, f.typicalMonthlySpend ? `Your typical month: ${inr(f.typicalMonthlySpend)}` : null] : [`Your budget: ${inr(f.budget)}`, `Projected spending this month: ${inr(f.projectedMonthEnd)}`],
                    reasoning: p && f.projectedMonthEnd > reduced ? `At your current pace you'd be ${inr(f.projectedMonthEnd - reduced)} over that smaller budget, so the gap would have to come from flexible spending.` : 'An income drop is easier to absorb when essentials fit well inside your budget.',
                    action: 'Know which categories you would cut first, and build an emergency fund of at least one month of spending.',
                    next: p ? `Try living on ${inr(reduced)} next month as a test.` : 'Ask "What if my income drops 20%?" and I will compare it with your budget.',
                    note: 'Income tracking is not available in Vittova yet; set your budget to what your income comfortably supports.',
                });
            }
            const months = extractMonths(question) || 12;
            const monthly = amount || f.savingsTarget;
            if (!monthly) {
                return answer({
                    direct: 'Tell me the monthly amount, e.g. "What if I save ₹3,000 more each month?", and I will project it.',
                    next: 'Set a monthly savings target in Settings so I can project your current plan.',
                });
            }
            const more = /\bmore\b/.test(q) && f.savingsTarget && amount;
            const total = more ? f.savingsTarget + amount : monthly;
            const illustration = futureValue(total, months / 12, 0.06);
            const newSafeTotal = more || amount ? Math.max(0, f.safeToSpendRemaining - (more ? amount : Math.max(0, amount - f.savingsTarget))) : f.safeToSpendRemaining;
            return answer({
                direct: `Saving ${inr(total)} a month for ${plural(months, 'month')} adds up to ${inr(total * months)}, before any interest.`,
                numbers: [more ? `Current target ${inr(f.savingsTarget)} + ${inr(amount)} more = ${inr(total)} a month` : `Monthly amount: ${inr(total)}`, `After 12 months: ${inr(total * 12)}`, `Illustration at an assumed 6% a year: about ${inr(illustration)}`, newSafeTotal !== f.safeToSpendRemaining ? `This month's Safe-to-Spend would drop from ${inr(f.safeToSpendRemaining)} to ${inr(newSafeTotal)}` : null],
                reasoning: total > Math.max(0, f.budget - f.projectedMonthEnd) ? 'At your current spending pace your budget does not leave this much, so the extra would have to come from cutting spending.' : 'Your current spending pace leaves room for this within your budget.',
                action: f.savingScenario.total ? `Trimming ${f.savingScenario.cuts.map((c) => c.category).join(' and ')} by 20% would fund about ${inr(f.savingScenario.total)} of it.` : 'Set the amount aside as soon as money comes in, before spending.',
                next: `Update your monthly savings target in Settings to ${inr(total)} if you want Safe-to-Spend to reserve it.`,
                note: 'The illustration uses an assumed constant rate, not a forecast.',
            });
        }
        case 'emergency_fund': {
            const base = f.typicalMonthlySpend;
            const capacity = f.monthlySavingCapacity;
            const starter = 10000;
            const toStarter = capacity ? Math.ceil(starter / capacity) : null;
            const toThree = capacity && base ? Math.ceil((base * 3) / capacity) : null;
            return answer({
                direct: base
                    ? `Based on your typical month of about ${inr(base)}, aim first for ${inr(starter)}, then ${inr(base)} (one month), then ${inr(base * 3)} to ${inr(base * 6)} (three to six months).`
                    : `Start with a ${inr(starter)} emergency fund, then grow it to three to six months of your essential expenses.`,
                numbers: [base ? `Typical monthly spending: ${inr(base)}` : null, capacity ? `Monthly amount you could put aside: ${inr(capacity)}${f.savingsTarget ? ' (your savings target)' : ' (what your budget pace leaves)'}` : null, toStarter ? `Time to reach ${inr(starter)}: about ${plural(toStarter, 'month')}` : null, toThree ? `Time to reach three months: about ${plural(toThree, 'month')}` : null, f.roundUpsTotal ? `Round-ups noted so far: ${inr(f.roundUpsTotal)}` : null],
                reasoning: 'An emergency fund covers medical bills, urgent travel or a job loss without borrowing or breaking investments at a bad time.',
                action: 'Keep it separate from your spending account, somewhere safe and quick to withdraw, such as a savings account or sweep FD.',
                next: capacity ? `Move ${inr(capacity)} into it this month.` : 'Set a monthly savings target in Settings so this has a fixed amount each month.',
                note: base ? 'Vittova does not track savings balances, so I cannot see how much you already have set aside.' : "I don't have enough spending history to size this yet; log a few weeks of expenses. Vittova also does not track savings balances.",
            });
        }
        case 'debt': {
            const room = Math.max(0, f.safeToSpendRemaining - f.expectedRestOfMonth);
            return answer({
                direct: "Vittova doesn't track loans or card balances yet, so I can't see your debts, but the order that usually works is clear.",
                numbers: [room ? `Budget room beyond your usual pace this month: ${inr(room)}` : `Safe to spend remaining: ${inr(f.safeToSpendRemaining)}`, f.savingsTarget ? `Monthly savings target: ${inr(f.savingsTarget)}` : null],
                reasoning: 'Credit card and personal loan interest is usually far higher than what savings earn, so paying it down is often the best guaranteed return.',
                action: '1. Pay at least the minimum on every debt, on time.\n2. Put extra money on the highest-interest debt first.\n3. Keep a small emergency fund so a surprise does not add new card debt.\n4. Stop adding to card balances you cannot clear in full.',
                next: room ? `If this month ends as expected, put ${inr(room)} towards your highest-interest debt.` : 'List each debt with its interest rate and minimum payment, highest rate first.',
                note: 'General guidance, not advice on a specific loan. For serious debt stress, speak to your lender about restructuring early.',
            });
        }
        case 'priorities': {
            const items = priorityList(f);
            const doingWell = [f.projectedMonthEnd <= f.budget && f.confidence !== 'insufficient' ? `staying within your ${inr(f.budget)} budget` : null, f.savingsTarget ? `saving ${inr(f.savingsTarget)} a month` : null, f.streakDays >= 3 ? `a ${plural(f.streakDays, 'day')} logging streak` : null].filter(Boolean);
            if (!items.length) {
                return answer({
                    direct: 'Nothing urgent stands out: you are on budget and your commitments are covered.',
                    numbers: [`Safe to spend: ${inr(f.safeToSpendPerDay)} a day`, `Projected month end: ${inr(f.projectedMonthEnd)} of ${inr(f.budget)}`],
                    reasoning: doingWell.length ? `You are doing well in ${doingWell.join(', ')}.` : '',
                    action: 'Build or top up your emergency fund, then consider raising your savings target.',
                    next: 'Ask "Build my emergency fund" for a target based on your spending.',
                });
            }
            return answer({
                direct: `My first priority for you: ${items[0].title.charAt(0).toLowerCase()}${items[0].title.slice(1)}.`,
                priorities: items.slice(0, 3).map((it, i) => `${i + 1}. ${it.title}`),
                numbers: [`Safe to spend: ${inr(f.safeToSpendPerDay)} a day`, f.budget ? `Projected month end: ${inr(f.projectedMonthEnd)} of ${inr(f.budget)}` : null],
                reasoning: `${items[0].detail}${doingWell.length ? ` You are doing well in ${doingWell.join(', ')}.` : ''}`,
                action: items.slice(1, 3).map((it) => `Then: ${it.step}`).join('\n'),
                next: items[0].step,
            });
        }
        case 'investing': {
            // Decide from the user's own figures first. Goal-shaped questions
            // (retirement, a house, tax saving) keep the horizon guide, which
            // already plans around the goal rather than this month's cash.
            // Speculation (crypto, F&O, gold) and goal-shaped questions keep the
            // horizon guide, which answers those directly rather than planning
            // this month's spare cash.
            const goalShaped = /\b(retire|retirement|tax|80c|elss|house|home|flat|down ?payment|wedding|marriage|college|child|crypto|bitcoin|f&o|futures|options|intraday|trading|gold)\b/.test(q);
            if (goalShaped) return answer(composeInvestingAnswer(f, question, amount));
            return answer(composeInvestmentAnswer(buildInvestmentContext(f, question, amount)));
        }
        case 'education':
            return answer(composeConceptAnswer(question));
        default: {
            const items = priorityList(f);
            return answer({
                direct: `So far this month you've spent ${inr(f.spentThisMonth)} of your ${inr(f.budget)} budget, and ${inr(f.safeToSpendPerDay)} a day is safe to spend.`,
                numbers: items.slice(0, 2).map((it) => it.title),
                action: 'Ask me what you can afford, why your spending changed, how to finish the month, or what to improve first.',
            });
        }
    }
}

// ─── Proactive insight and suggestions ──────────────────────────────────────

/**
 * "Your money today": one headline, one opportunity, one next move, chosen
 * from the most important signal in the user's own data.
 */
function buildDailyInsight(f) {
    const figure = { label: 'Safe to spend today', value: f.safeToSpendPerDay };
    if (f.transactionsThisMonth === 0) {
        return { tone: 'neutral', headline: 'No expenses logged this month yet.', figure, opportunity: `Your budget is ${inr(f.budget)} with ${plural(f.daysLeft, 'day')} left.`, nextMove: 'Log today\'s spending, or turn on automatic UPI detection, so I can track your pace.', confidence: 'insufficient' };
    }
    if (f.shortfall) {
        return { tone: 'alert', headline: `This month is ${inr(f.shortfall)} over once bills and savings are counted.`, figure, opportunity: f.categories[0] ? `Your biggest category is ${f.categories[0].category} at ${inr(f.categories[0].thisMonth)}.` : '', nextMove: 'Spend only on essentials until the month ends.', confidence: f.confidence };
    }
    if (f.budgetRunsOut && f.confidence !== 'insufficient') {
        return { tone: 'watch', headline: `At your current pace, your budget runs out around ${f.budgetRunsOut.date}.`, figure, opportunity: f.categorySpikes[0] ? `${f.categorySpikes[0].category} is ${inr(f.categorySpikes[0].aboveBy)} above your monthly average.` : `You're spending ${inr(f.dailyPace)} a day.`, nextMove: `Keep spending under ${inr(f.safeToSpendPerDay)} a day for the next few days.`, confidence: f.confidence };
    }
    if (f.categorySpikes.length) {
        const s = f.categorySpikes[0];
        return { tone: 'watch', headline: `${s.category} spending is higher than usual this month.`, figure, opportunity: `${s.category}: ${inr(s.thisMonth)} vs a ${inr(s.threeMonthAverage)} monthly average.`, nextMove: `Set a ${s.category} limit for the rest of the month.`, confidence: f.confidence };
    }
    if (f.subscriptionsMonthly) {
        return { tone: 'good', headline: "You're within budget at your current pace.", figure, opportunity: `Recurring charges cost ${inr(f.subscriptionsMonthly)} a month (${inr(f.subscriptionsAnnual)} a year).`, nextMove: 'Review your recurring charges and cancel one you no longer use.', confidence: f.confidence };
    }
    return {
        tone: 'good',
        headline: f.confidence === 'insufficient' ? "You're within budget so far." : "You're within budget at your current pace.",
        figure,
        opportunity: f.savingsTarget ? `Your savings target of ${inr(f.savingsTarget)} is already reserved.` : 'You have no monthly savings target yet.',
        nextMove: f.savingsTarget ? 'Put any money left at month end towards your emergency fund.' : 'Set a monthly savings target in Settings.',
        confidence: f.confidence,
    };
}

/**
 * Quick prompts, most relevant first. `prefill` chips put text in the input
 * for the user to finish (e.g. a price) instead of sending immediately.
 */
function suggestPrompts(f) {
    const list = [];
    const add = (label, extra = {}) => { if (!list.some((s) => s.label === label)) list.push({ label, ...extra }); };
    if (f.shortfall || f.budgetRunsOut) add('How do I finish the month safely?');
    if (f.categorySpikes[0]) add(`Why is my ${f.categorySpikes[0].category.toLowerCase()} spending high?`);
    add('Can I afford this?', { prefill: 'Can I afford ₹' });
    if (f.confidence !== 'insufficient') add('Where am I overspending?');
    add('What should I improve first?');
    if (f.subscriptionsMonthly) add('Review my subscriptions');
    add('How much can I safely spend?');
    add(f.savingsTarget ? 'What if I save ₹1,000 more each month?' : 'How much should I save?');
    add('Build my emergency fund');
    add('Plan this month\'s budget');
    add('How long to reach my goal?', { prefill: 'How long to save ₹' });
    return list.slice(0, 8);
}

// ─── Guard against invented numbers ─────────────────────────────────────────

function collectNumbers(value, out = new Set()) {
    if (value === null || value === undefined) return out;
    if (typeof value === 'number') { out.add(Math.round(value)); return out; }
    if (typeof value === 'string') {
        for (const m of value.replace(/,/g, '').matchAll(/\d+(?:\.\d+)?/g)) out.add(Math.round(Number(m[0])));
        return out;
    }
    if (Array.isArray(value)) { value.forEach((v) => collectNumbers(v, out)); return out; }
    if (typeof value === 'object') Object.values(value).forEach((v) => collectNumbers(v, out));
    return out;
}

/**
 * True when every rupee amount and percentage in `reply` appears in the facts,
 * the deterministic answer, or the user's own question (±1 for rounding).
 */
function numbersAreGrounded(reply, ...sources) {
    const allowed = new Set();
    sources.forEach((s) => collectNumbers(s, allowed));
    const found = [...String(reply || '').replace(/,/g, '').matchAll(/(?:₹\s?(\d+(?:\.\d+)?))|(\d+(?:\.\d+)?)\s?%/g)]
        .map((m) => Math.round(Number(m[1] || m[2])));
    return found.every((n) => allowed.has(n) || allowed.has(n - 1) || allowed.has(n + 1));
}

module.exports = {
    classifyIntent,
    extractAmount,
    extractMonths,
    extractPercent,
    buildFacts,
    mentorContext,
    composeAnswer,
    toText,
    buildDailyInsight,
    suggestPrompts,
    numbersAreGrounded,
    EDUCATION_NOTE,
};
