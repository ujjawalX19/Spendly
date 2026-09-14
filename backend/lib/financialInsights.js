/**
 * financialInsights — every number the money coach may say, computed here.
 *
 * The language model never does financial arithmetic. This module turns the
 * user's own rows into facts (totals, differences, projections, scenarios) and
 * a complete deterministic answer for each kind of question. The model may only
 * re-phrase that answer, and routes/ai.js rejects any reply containing a rupee
 * figure that is not in these facts.
 *
 * Pure: rows and `now` in, facts and answers out. All calendar maths in IST.
 */

const appTime = require('./appTime');
const { detectSubscriptions } = require('./subscriptions');
const { composeInvestingAnswer, composeConceptAnswer } = require('./investingGuide');

const DISCRETIONARY = ['Food', 'Entertainment', 'Shopping', 'Other'];
const r = (n) => Math.round(Number(n) || 0);
const inr = (n) => `₹${r(n).toLocaleString('en-IN')}`;
const pct = (n) => `${Math.round(n)}%`;

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

const INTENTS = [
    // Concept questions ("what is a SIP", "explain index funds").
    ['education', /\b(what is|what are|what's|whats|meaning of|explain|difference between|how does .* work)\b/],
    // Investing questions get a personalised, education-only plan, even when
    // they also mention saving ("where should I invest my savings").
    ['investing', /\b(invest|investing|investment|sip|sips|mutual funds?|index funds?|stocks?|shares|equity|etf|crypto|bitcoin|f&o|trading|gold|portfolio|returns|nifty|sensex|ppf|nps|elss|fd|fixed deposit|retire|retirement|save tax|tax saving|80c|lump ?sum|bonus|buy a (house|home|flat)|down ?payment|(house|home|flat|wedding|marriage|college) (in|by|within) \d+|saving for my (wedding|marriage|house|home))\b/],
    ['safe_to_spend', /\b(safe to spend|how much (can|do) i (spend|have)( left)?|left to spend|daily (limit|budget)|per day)\b/],
    ['affordability', /\b(can i afford|afford|should i buy|worth buying|can i spend|is it ok to (buy|spend))\b/],
    ['subscriptions', /\b(subscriptions?|recurring|autopay|mandate|netflix|spotify|prime|renewal|membership)\b/],
    ['unusual_spending', /\b(unusual|weird|strange|spike|suspicious|biggest|largest|highest (purchase|expense|payment)|out of (the )?ordinary)\b/],
    ['goal_planning', /\b(goal|save up|saving for|reach|target|how long (will it|to)|by (next|december|january|diwali)|emergency fund of)\b/],
    ['monthly_summary', /\b(summary|summari[sz]e|overview|recap|how (am i|did i) do(ing)?|this month so far|month in review)\b/],
    ['spending_analysis', /\b(why did i|overspen[dt]|where (did|does) (my|the) money go|spent (so )?much|spending (more|less)|compared? (to|with) last month|increase|decrease|category|categories)\b/],
    ['budget_advice', /\b(budget|stick to|stay within|over budget|limit|allowance)\b/],
    ['savings_advice', /\b(save|saving|savings|cut (back|down)?|reduce|spend less|cheaper)\b/],
    ['education', /\b(how does|how do|emergency fund|compound|compounding|inflation|credit score)\b/],
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

// ─── Facts ──────────────────────────────────────────────────────────────────

/**
 * @param {object}  args
 * @param {object}  args.profile   { monthly_budget, investment_target, streak_current }
 * @param {Array}   args.expenses  rows from the last ~4 months: amount, category, description, occurred_at
 * @param {Array}   args.bills     recurring_bills rows
 * @param {Date}    [args.now]
 */
function buildFacts({ profile = {}, expenses = [], bills = [], now = new Date() }) {
    const monthStart = appTime.startOfMonth(now);
    const prevStart = appTime.startOfMonthsAgo(1, now);
    const threeMonthsStart = appTime.startOfMonthsAgo(3, now);
    const day = appTime.dayOfMonth(now);
    const daysInMonth = appTime.daysInMonth(now);
    const daysLeft = appTime.daysRemainingInMonth(now);
    const t = (x) => new Date(x.occurred_at).getTime();

    const thisMonth = expenses.filter((x) => t(x) >= monthStart.getTime());
    const lastMonth = expenses.filter((x) => t(x) >= prevStart.getTime() && t(x) < monthStart.getTime());
    const priorThree = expenses.filter((x) => t(x) >= threeMonthsStart.getTime() && t(x) < monthStart.getTime());

    // Same point in last month, for a fair "so far" comparison.
    const { year: py, month: pm } = appTime.zonedParts(prevStart);
    const prevDays = new Date(Date.UTC(py, pm, 0)).getUTCDate();
    const prevSamePoint = appTime.zonedTimeToUtc(py, pm, Math.min(day, prevDays), 23, 59, 59);
    const lastMonthSoFar = lastMonth.filter((x) => t(x) <= prevSamePoint.getTime());

    const budget = Number(profile.monthly_budget) || 0;
    const target = Number(profile.investment_target) || 0;
    const spent = sum(thisMonth);
    const spentLast = sum(lastMonth);
    const spentLastSoFar = sum(lastMonthSoFar);

    const upcomingBills = bills
        .filter((b) => b.is_active !== false && Number(b.due_day) > day)
        .reduce((s, b) => s + (Number(b.amount) || 0), 0);

    const projected = day > 0 ? (spent / day) * daysInMonth : spent;
    const leftAfterCommitments = budget - spent - upcomingBills - target;

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

    const avg3 = priorThree.length ? sum(priorThree) / 3 : 0;
    const spikes = Object.entries(catNow)
        .map(([category, amount]) => {
            const avg = sum(priorThree.filter((x) => (x.category || 'Other') === category)) / 3;
            return { category, thisMonth: r(amount), threeMonthAverage: r(avg) };
        })
        .filter((c) => c.threeMonthAverage > 0 && c.thisMonth > c.threeMonthAverage * 1.5 && c.thisMonth - c.threeMonthAverage >= 500)
        .sort((a, b) => (b.thisMonth - b.threeMonthAverage) - (a.thisMonth - a.threeMonthAverage));

    const subs = detectSubscriptions(expenses, now);

    // Saving scenario: trim the two biggest discretionary categories by 20%.
    const cutCandidates = categories.filter((c) => DISCRETIONARY.includes(c.category) && c.thisMonth > 0).slice(0, 2);
    const cutPercent = 20;
    const cuts = cutCandidates.map((c) => ({ category: c.category, current: c.thisMonth, saving: r(c.thisMonth * cutPercent / 100) }));

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
        budgetUsedPercent: budget > 0 ? Math.round((spent / budget) * 100) : null,
        projectedOverBudgetBy: budget > 0 && projected > budget ? r(projected - budget) : 0,
        upcomingBills: r(upcomingBills),
        safeToSpendRemaining: r(Math.max(0, leftAfterCommitments)),
        safeToSpendPerDay: leftAfterCommitments > 0 ? r(leftAfterCommitments / daysLeft) : 0,
        shortfall: leftAfterCommitments < 0 ? r(-leftAfterCommitments) : 0,
        categories: categories.slice(0, 6),
        last7Days: r(last7),
        previous7Days: r(prev7),
        unusualExpenses: unusual,
        categorySpikes: spikes.slice(0, 3),
        threeMonthAverage: r(avg3),
        subscriptions: subs.subscriptions.filter((s) => s.isActive).slice(0, 6).map((s) => ({ merchant: s.merchant, monthly: s.monthlyAmount, annual: s.monthlyAmount * 12 })),
        subscriptionsMonthly: r(subs.activeMonthlyTotal),
        subscriptionsAnnual: r(subs.activeMonthlyTotal * 12),
        savingScenario: { percent: cutPercent, cuts, total: cuts.reduce((s, c) => s + c.saving, 0) },
        transactionsThisMonth: thisMonth.length,
        confidence: thisMonth.length >= 10 && lastMonth.length >= 10 ? 'good' : thisMonth.length >= 5 ? 'limited' : 'insufficient',
    };
}

// ─── Deterministic answers ──────────────────────────────────────────────────

function answer(parts) {
    return {
        direct: parts.direct,
        numbers: (parts.numbers || []).filter(Boolean),
        reasoning: parts.reasoning || '',
        action: parts.action || '',
        note: parts.note || '',
    };
}

function toText(a) {
    const out = [a.direct];
    if (a.numbers.length) out.push(`**Numbers**\n${a.numbers.map((n) => `• ${n}`).join('\n')}`);
    if (a.reasoning) out.push(`**Why**\n${a.reasoning}`);
    if (a.action) out.push(`**What to do**\n${a.action}`);
    if (a.note) out.push(`**Note**\n${a.note}`);
    return out.join('\n\n');
}

const EDUCATION_NOTE = 'General financial education, not investment advice. Vittova is not a SEBI-registered investment adviser.';

function composeAnswer(intent, f, question) {
    const insufficient = f.confidence === 'insufficient';
    const noBudget = !f.budget;
    const top = f.categories[0];
    const amount = extractAmount(question);

    if (insufficient && ['spending_analysis', 'unusual_spending', 'monthly_summary', 'savings_advice'].includes(intent)) {
        return answer({
            direct: `I don't have enough of your spending yet to analyse it properly: ${f.transactionsThisMonth} expense${f.transactionsThisMonth === 1 ? '' : 's'} logged this month.`,
            numbers: [`Spent so far this month: ${inr(f.spentThisMonth)}`],
            action: 'Log your expenses for about a week (or turn on automatic UPI detection), then ask again.',
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
                numbers: up.map((c) => `${c.category}: ${inr(c.thisMonth)} this month, up ${inr(c.change)}`),
                reasoning: up.length ? `Most of the increase comes from ${up.map((c) => c.category).join(' and ')}.` : 'No category rose meaningfully.',
                action: up.length ? `Trimming ${up.map((c) => c.category).join(' and ')} by 20% would save about ${inr(saving)} for the rest of this month's pace.` : 'Keep going at your current pace.',
                note: f.confidence === 'limited' ? 'Based on limited history, so treat it as a rough picture.' : '',
            });
        }
        case 'budget_advice': {
            if (noBudget) return answer({ direct: "You haven't set a monthly budget yet, so I can't tell whether you're on track.", action: 'Set a budget in Settings; many people start with what they spent last month' + (f.spentLastMonth ? ` (${inr(f.spentLastMonth)}).` : '.') });
            const onTrack = f.projectedMonthEnd <= f.budget;
            return answer({
                direct: onTrack
                    ? `You're on track: at this pace you'll finish around ${inr(f.projectedMonthEnd)} against a ${inr(f.budget)} budget.`
                    : `At this pace you'll overshoot your ${inr(f.budget)} budget by about ${inr(f.projectedOverBudgetBy)}.`,
                numbers: [`Spent: ${inr(f.spentThisMonth)} (${pct(f.budgetUsedPercent)} of budget) on day ${f.dayOfMonth} of ${f.daysInMonth}`, f.upcomingBills ? `Bills still due: ${inr(f.upcomingBills)}` : null, `Safe to spend: ${inr(f.safeToSpendPerDay)} a day for ${f.daysLeft} days`],
                reasoning: top ? `${top.category} is your biggest category at ${inr(top.thisMonth)}.` : '',
                action: onTrack ? `Keep daily spending near ${inr(f.safeToSpendPerDay)}.` : `To land on budget, keep to about ${inr(f.safeToSpendPerDay)} a day${top ? ` and ease off ${top.category}` : ''}.`,
            });
        }
        case 'savings_advice': {
            const s = f.savingScenario;
            return answer({
                direct: s.total > 0 ? `Cutting your two biggest flexible categories by ${s.percent}% would free up about ${inr(s.total)} a month.` : "There isn't enough flexible spending logged this month to suggest specific cuts.",
                numbers: [...s.cuts.map((c) => `${c.category}: ${inr(c.current)} now → save ${inr(c.saving)}`), f.subscriptionsMonthly ? `Recurring charges: ${inr(f.subscriptionsMonthly)}/month (${inr(f.subscriptionsAnnual)}/year)` : null],
                reasoning: 'Flexible categories (food, shopping, entertainment) are usually the easiest to change without affecting essentials.',
                action: s.cuts.length ? `Pick one concrete habit in ${s.cuts[0].category}, such as fewer delivery orders, and review your recurring charges.` : 'Log expenses for a week so I can see where savings could come from.',
            });
        }
        case 'goal_planning': {
            const monthlyCapacity = f.savingsTarget || Math.max(0, f.budget - f.projectedMonthEnd);
            if (!amount) {
                return answer({
                    direct: f.savingsTarget ? `Your monthly savings target is ${inr(f.savingsTarget)}.` : "You haven't set a monthly savings target yet.",
                    action: 'Tell me the goal amount, e.g. "How long to save ₹50,000?", and I will work out the timeline.',
                });
            }
            if (!monthlyCapacity) {
                return answer({
                    direct: `I can't estimate a timeline for ${inr(amount)} yet: there's no savings target set and no room left under your budget this month.`,
                    action: 'Set a monthly savings target in Settings, then ask again.',
                });
            }
            const months = Math.ceil(amount / monthlyCapacity);
            return answer({
                direct: `Putting aside ${inr(monthlyCapacity)} a month, reaching ${inr(amount)} would take about ${months} month${months === 1 ? '' : 's'}.`,
                numbers: [`Goal: ${inr(amount)}`, `Monthly amount used: ${inr(monthlyCapacity)} (${f.savingsTarget ? 'your savings target' : 'what your budget pace leaves over'})`],
                action: f.savingScenario.total ? `Adding the ${inr(f.savingScenario.total)} from trimming ${f.savingScenario.cuts.map((c) => c.category).join(' and ')} would bring it down to about ${Math.ceil(amount / (monthlyCapacity + f.savingScenario.total))} months.` : '',
                note: 'This ignores interest and assumes the same amount every month.',
            });
        }
        case 'safe_to_spend':
            if (noBudget) return answer({ direct: 'Set a monthly budget in Settings and I can work out what is safe to spend.' });
            return answer({
                direct: f.shortfall ? `Nothing is safe to spend right now: bills and your savings target already exceed what's left by ${inr(f.shortfall)}.` : `You can safely spend about ${inr(f.safeToSpendPerDay)} a day for the next ${f.daysLeft} days (${inr(f.safeToSpendRemaining)} in total).`,
                numbers: [`Budget: ${inr(f.budget)}`, `Spent: ${inr(f.spentThisMonth)}`, `Bills still due: ${inr(f.upcomingBills)}`, `Savings target: ${inr(f.savingsTarget)}`],
                reasoning: 'Safe to spend = budget − spent − bills still due − savings target, spread over the days left.',
            });
        case 'unusual_spending': {
            const u = f.unusualExpenses;
            const s = f.categorySpikes;
            if (!u.length && !s.length) return answer({ direct: 'Nothing unusual stands out this month compared with your recent history.' });
            return answer({
                direct: u.length ? `Your most unusual expense this month is ${u[0].description} at ${inr(u[0].amount)}.` : `${s[0].category} is well above your usual level this month.`,
                numbers: [...u.map((x) => `${x.description} (${x.category}, ${x.date}): ${inr(x.amount)}${x.typical ? `, typical ${inr(x.typical)}` : ''}`), ...s.map((c) => `${c.category}: ${inr(c.thisMonth)} vs 3-month average ${inr(c.threeMonthAverage)}`)],
                action: 'Check these are expected. If a charge looks wrong, contact your bank or the merchant.',
            });
        }
        case 'subscriptions':
            return answer({
                direct: f.subscriptions.length ? `You have ${f.subscriptions.length} recurring charge${f.subscriptions.length === 1 ? '' : 's'} still active, costing ${inr(f.subscriptionsMonthly)} a month (${inr(f.subscriptionsAnnual)} a year).` : 'I have not found any active recurring charges in your last four months of expenses.',
                numbers: f.subscriptions.map((s) => `${s.merchant}: ${inr(s.monthly)}/month (${inr(s.annual)}/year)`),
                action: f.subscriptions.length ? 'Open Recurring charges to see cancellation steps, and revoke unused UPI AutoPay mandates in your UPI app.' : '',
            });
        case 'monthly_summary':
            return answer({
                direct: `Day ${f.dayOfMonth} of ${f.daysInMonth}: you've spent ${inr(f.spentThisMonth)}${f.budget ? ` of your ${inr(f.budget)} budget` : ''}.`,
                numbers: [top ? `Top category: ${top.category} ${inr(top.thisMonth)}` : null, `Last 7 days: ${inr(f.last7Days)} (previous 7 days: ${inr(f.previous7Days)})`, f.budget ? `Projected month end: ${inr(f.projectedMonthEnd)}` : null, `Recurring charges: ${inr(f.subscriptionsMonthly)}/month`],
                action: f.budget && f.projectedMonthEnd > f.budget ? `Keep to about ${inr(f.safeToSpendPerDay)} a day to stay within budget.` : '',
            });
        case 'affordability': {
            if (!amount) return answer({ direct: 'Tell me the price, e.g. "Can I afford ₹3,000 headphones?", and I will check it against what is left this month.' });
            if (noBudget) return answer({ direct: `I can't judge ${inr(amount)} without a monthly budget. Set one in Settings first.` });
            const room = f.safeToSpendRemaining;
            const verdict = amount <= room * 0.5 ? 'Yes' : amount <= room ? 'Yes, but it is tight' : 'Not this month';
            return answer({
                direct: `${verdict}: ${inr(amount)} ${amount <= room ? 'fits within' : 'is more than'} the ${inr(room)} safe to spend for the rest of the month.`,
                numbers: [`Safe to spend remaining: ${inr(room)}`, amount <= room ? `Left afterwards: ${inr(room - amount)}, about ${inr((room - amount) / f.daysLeft)} a day for ${f.daysLeft} days` : `Shortfall: ${inr(amount - room)}`, f.upcomingBills ? `Bills still due: ${inr(f.upcomingBills)}` : null],
                reasoning: 'Safe to spend already accounts for bills still due and your savings target.',
                action: amount > room ? `Waiting until next month, or saving ${inr(Math.ceil((amount - room) / f.daysLeft))} a day, would cover it.` : '',
                note: 'Income is not tracked in Vittova, so this uses your budget rather than your bank balance.',
            });
        }
        case 'investing':
            return answer(composeInvestingAnswer(f, question, amount));
        case 'education':
            return answer(composeConceptAnswer(question));
        default:
            return answer({
                direct: `So far this month you've spent ${inr(f.spentThisMonth)}${f.budget ? ` of a ${inr(f.budget)} budget` : ''}.`,
                action: 'Ask me why your spending changed, what you can afford, how to save, or for a monthly summary.',
            });
    }
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

module.exports = { classifyIntent, extractAmount, buildFacts, composeAnswer, toText, numbersAreGrounded, EDUCATION_NOTE };
