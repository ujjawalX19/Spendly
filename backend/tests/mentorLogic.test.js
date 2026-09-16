/**
 * Vittova AI mentor — deterministic calculations, tested without any model.
 * Every figure the mentor can say comes from these functions.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildFacts, mentorContext, composeAnswer, classifyIntent, buildDailyInsight, suggestPrompts,
    extractMonths, extractPercent, numbersAreGrounded, toText,
} = require('../lib/financialInsights');
const { computeSafeToSpend, effectiveMonthlyBudget } = require('../lib/safeToSpend');

const ist = (s) => {
    const [d, tm = '12:00'] = s.split(' ');
    const [Y, M, D] = d.split('-').map(Number);
    const [h, m] = tm.split(':').map(Number);
    return new Date(Date.UTC(Y, M - 1, D, h, m) - 5.5 * 3600 * 1000);
};
const on = (date, amount, category, description = category) => ({ amount, category, description, occurred_at: ist(`${date} 13:00`).toISOString() });
const pad = (n) => String(n).padStart(2, '0');
const NOW = ist('2026-09-12 20:00'); // day 12 of 30; 19 days left including today

/** 12 days of ₹300 food this month; August as the only earlier month. */
function fixture(overrides = {}) {
    const expenses = [];
    for (let d = 1; d <= 12; d++) {
        expenses.push(on(`2026-08-${pad(d)}`, 200, 'Food'));
        expenses.push(on(`2026-09-${pad(d)}`, 300, 'Food', 'Swiggy'));
    }
    return { profile: { monthly_budget: 20000, investment_target: 2000, streak_current: 5, total_chillar: 42.5 }, expenses, bills: [{ name: 'Rent', amount: 1500, due_day: 25, is_active: true }], now: NOW, ...overrides };
}

// ─── Safe-to-Spend ──────────────────────────────────────────────────────────

test('Safe-to-Spend is one calculation: the AI facts equal the dashboard figure', () => {
    const f = fixture({ bills: [{ name: 'Rent', amount: 1500, due_day: 25, is_active: true }, { name: 'Phone', amount: 300, due_day: 12, is_active: true }, { name: 'Old', amount: 999, due_day: 28, is_active: false }] });
    const facts = buildFacts(f);
    const dashboard = computeSafeToSpend({ monthlyBudget: 20000, totalSpent: 3600, bills: f.bills, investmentTarget: 2000, now: NOW });

    // A bill due today is still to pay; inactive bills are ignored.
    assert.equal(dashboard.upcomingBills, 1800);
    assert.equal(dashboard.remaining, 20000 - 3600 - 1800 - 2000);
    assert.equal(dashboard.daysRemaining, 19);
    assert.equal(dashboard.daily, Math.round(12600 / 19));
    assert.deepEqual(dashboard.upcomingBillList.map((b) => b.name), ['Phone', 'Rent']);

    assert.equal(facts.safeToSpendRemaining, dashboard.remaining);
    assert.equal(facts.safeToSpendPerDay, dashboard.daily);
    assert.equal(facts.upcomingBills, dashboard.upcomingBills);
});

test('Safe-to-Spend never goes negative and reports the overshoot', () => {
    const s = computeSafeToSpend({ monthlyBudget: 5000, totalSpent: 6000, bills: [], investmentTarget: 500, now: NOW });
    assert.equal(s.daily, 0);
    assert.equal(s.remaining, 0);
    assert.equal(s.isNegative, true);
    assert.equal(s.overBy, 1500);
    assert.equal(effectiveMonthlyBudget({ monthly_budget: 0 }), 5000, 'same default the dashboard shows');
});

// ─── Empty and missing data ─────────────────────────────────────────────────

test('zero expenses: no invented trends, clear guidance and a neutral insight', () => {
    const facts = buildFacts({ profile: { monthly_budget: 10000 }, expenses: [], bills: [], now: NOW });
    assert.equal(facts.spentThisMonth, 0);
    assert.equal(facts.confidence, 'insufficient');
    assert.equal(facts.monthsOfHistory, 0);
    assert.deepEqual(facts.categorySpikes, []);
    assert.equal(facts.typicalMonthlySpend, 0);

    assert.match(composeAnswer('spending_analysis', facts, 'Why did I overspend?').direct, /don't have enough/);
    assert.match(composeAnswer('unusual_spending', facts, 'unusual?').direct, /don't have enough/);

    const insight = buildDailyInsight(facts);
    assert.equal(insight.tone, 'neutral');
    assert.match(insight.headline, /No expenses logged/);
    assert.ok(!suggestPrompts(facts).some((s) => /overspending/.test(s.label)));

    const ef = composeAnswer('emergency_fund', facts, 'Build my emergency fund');
    assert.match(ef.note, /enough spending history/);
});

test('income is never assumed: an income what-if says it is not tracked and uses the budget', () => {
    const facts = buildFacts(fixture());
    assert.ok(mentorContext(facts).notTracked.includes('income'));
    assert.equal(facts.incomeTracked, false);

    const a = composeAnswer(classifyIntent('What if my income drops 20%?'), facts, 'What if my income drops 20%?');
    assert.match(a.direct, /doesn't track your income/);
    assert.ok(a.numbers.some((n) => /₹20,000 → ₹16,000/.test(n)), a.numbers.join('\n'));
    assert.equal(extractPercent('What if my income drops 20%?'), 20);
});

// ─── Budget, trends, goals ──────────────────────────────────────────────────

test('budget analysis projects the month from the real pace', () => {
    const facts = buildFacts(fixture({ profile: { monthly_budget: 8000 } }));
    // ₹3,600 over 12 days → ₹300/day → ₹9,000 over 30 days.
    assert.equal(facts.dailyPace, 300);
    assert.equal(facts.projectedMonthEnd, 9000);
    assert.equal(facts.projectedOverBudgetBy, 1000);
    assert.match(composeAnswer('budget_advice', facts, 'Am I within budget?').direct, /overshoot your ₹8,000 budget by about ₹1,000/);
});

test('spending trends average over months that have data, not a fixed three', () => {
    const facts = buildFacts(fixture());
    // Only August has history: ₹2,400 is the monthly average, not ₹800.
    assert.equal(facts.monthsOfHistory, 1);
    assert.equal(facts.threeMonthAverage, 2400);
    // ₹3,600 food vs ₹2,400 average = 1.5×, +₹1,200: not above the 1.5× threshold.
    assert.deepEqual(facts.categorySpikes, []);

    const spiky = fixture();
    spiky.expenses.push(on('2026-09-10', 2500, 'Shopping', 'Shoes'), on('2026-08-10', 400, 'Shopping'));
    const f2 = buildFacts(spiky);
    assert.deepEqual(f2.categorySpikes[0], { category: 'Shopping', thisMonth: 2500, threeMonthAverage: 400, aboveBy: 2100 });
    assert.match(buildDailyInsight(f2).headline, /Shopping spending is higher than usual/);
    assert.equal(suggestPrompts(f2)[0].label, 'Why is my shopping spending high?');
});

test('goal projection uses the savings target, or the budget pace when none is set', () => {
    const facts = buildFacts(fixture());
    assert.match(composeAnswer('goal_planning', facts, 'How long to save ₹50,000?').direct, /₹2,000 a month.*about 25 months/);

    const noTarget = buildFacts(fixture({ profile: { monthly_budget: 20000 } }));
    // No target: what the budget leaves at this pace, ₹20,000 − ₹9,000.
    assert.equal(noTarget.monthlySavingCapacity, 11000);
    assert.match(composeAnswer('goal_planning', noTarget, 'How long to save ₹50,000?').direct, /about 5 months/);
});

// ─── Decisions ──────────────────────────────────────────────────────────────

test('affordability weighs the purchase against bills, target and the spending pace', () => {
    const facts = buildFacts(fixture());
    // Safe remaining: 20000 − 3600 − 1500 − 2000 = 12,900. Pace needs 300 × 19 = 5,700.
    assert.equal(facts.safeToSpendRemaining, 12900);
    assert.equal(facts.expectedRestOfMonth, 5700);

    assert.match(composeAnswer('affordability', facts, 'Can I afford ₹4,000 headphones?').direct, /^Yes: ₹4,000 fits/);
    const tight = composeAnswer('affordability', facts, 'Can I afford a ₹9,000 phone?');
    assert.match(tight.direct, /^Possible, but I'd wait: ₹9,000 fits.*leave ₹3,900.*needs about ₹5,700/);
    assert.match(tight.next, /savings goal/);

    const no = composeAnswer('affordability', facts, 'Can I afford a 20k laptop?');
    assert.match(no.direct, /^Not this month: ₹20,000 is more than the ₹12,900/);
    // Gap ₹7,100 at ₹2,000 a month.
    assert.match(no.action, /about 4 months/);
});

test('what-if: saving more each month is projected and its Safe-to-Spend impact shown', () => {
    const facts = buildFacts(fixture());
    const q = 'What if I save ₹3,000 more each month for 2 years?';
    assert.equal(classifyIntent(q), 'what_if');
    assert.equal(extractMonths(q), 24);
    const a = composeAnswer('what_if', facts, q);
    assert.match(a.direct, /Saving ₹5,000 a month for 24 months adds up to ₹1,20,000/);
    assert.ok(a.numbers.some((n) => /₹12,900 to ₹9,900/.test(n)), a.numbers.join('\n'));
    assert.match(a.note, /assumed constant rate/);
});

test('finishing the month flags when the pace outruns what is safe to spend', () => {
    const facts = buildFacts(fixture({ profile: { monthly_budget: 6000, investment_target: 0 } }));
    // Safe: 6000 − 3600 − 1500 = 900; pace needs 5,700.
    const a = composeAnswer(classifyIntent('How do I finish the month safely?'), facts, 'How do I finish the month safely?');
    assert.match(a.direct, /need about ₹5,700.*only ₹900 is safe/);
    assert.ok(facts.budgetRunsOut, 'budget runs out before month end');
    assert.ok(a.numbers.some((n) => /runs out around/.test(n)));
});

test('emergency fund is sized from the typical month', () => {
    const facts = buildFacts(fixture());
    const a = composeAnswer(classifyIntent('Build my emergency fund'), facts, 'Build my emergency fund');
    assert.match(a.direct, /₹10,000, then ₹2,400 \(one month\), then ₹7,200 to ₹14,400/);
    assert.ok(a.numbers.some((n) => /about 5 months/.test(n)), 'reach ₹10,000 at ₹2,000 a month');
    assert.match(a.note, /does not track savings balances/);
});

test('priorities put a shortfall first and credit what is going well', () => {
    const facts = buildFacts(fixture({ profile: { monthly_budget: 5000, investment_target: 1000 }, groupPool: { groups: 1, youOwe: 450, owedToYou: 0 } }));
    assert.ok(facts.shortfall > 0);
    const a = composeAnswer(classifyIntent('What should I improve first?'), facts, 'What should I improve first?');
    assert.match(a.direct, /close this month's ₹1,100 gap/);
    assert.ok(a.priorities.some((p) => /₹450 you owe in Group Pool/.test(p)), a.priorities.join(' | '));
    assert.equal(buildDailyInsight(facts).tone, 'alert');
});

test('debt questions admit debts are not tracked and give a general order', () => {
    const facts = buildFacts(fixture());
    const a = composeAnswer(classifyIntent('Should I pay off debt first?'), facts, 'Should I pay off debt first?');
    assert.match(a.direct, /doesn't track loans/);
    assert.match(a.action, /highest-interest debt first/);
});

test('new question types are recognised without breaking existing ones', () => {
    const cases = {
        'Explain my spending': 'spending_analysis',
        'Why is my food spending high?': 'spending_analysis',
        'What should I improve first?': 'priorities',
        'How do I finish the month safely?': 'finish_month',
        'Build my emergency fund': 'emergency_fund',
        'What is an emergency fund?': 'education',
        'What if I save ₹3,000 more each month?': 'what_if',
        'How much will I have after 2 years?': 'what_if',
        'Can I increase my SIP?': 'investing',
        'Should I pay off debt first?': 'debt',
        'How much can I safely spend?': 'safe_to_spend',
        'Review my subscriptions': 'subscriptions',
        "Plan this month's budget": 'budget_advice',
        'Can I afford a ₹20,000 laptop?': 'affordability',
    };
    for (const [q, intent] of Object.entries(cases)) assert.equal(classifyIntent(q), intent, q);
});

// ─── Contract and guardrails ────────────────────────────────────────────────

test('the AI context holds only financial figures: no ids, emails or names', () => {
    const facts = buildFacts(fixture({ profile: { monthly_budget: 20000, email: 'x@example.com', full_name: 'Asha', id: 'abc' } }));
    const json = JSON.stringify(mentorContext(facts));
    assert.doesNotMatch(json, /example\.com|Asha|"id"/);
    for (const key of ['budget', 'safeToSpend', 'spending', 'recurringBills', 'subscriptions', 'savings', 'notTracked']) {
        assert.ok(key in mentorContext(facts), key);
    }
});

test('every answer follows the mentor structure', () => {
    const facts = buildFacts(fixture());
    const text = toText(composeAnswer('affordability', facts, 'Can I afford ₹9,000?'));
    assert.match(text, /\*\*Your numbers\*\*/);
    assert.match(text, /\*\*Why it matters\*\*/);
    assert.match(text, /\*\*What I recommend\*\*/);
    assert.match(text, /\*\*Next step\*\*/);
});

test('replies may only use figures from the facts, context, draft or question', () => {
    const facts = buildFacts(fixture());
    const draft = toText(composeAnswer('safe_to_spend', facts, 'per day'));
    assert.equal(numbersAreGrounded(`You can spend ₹${facts.safeToSpendPerDay.toLocaleString('en-IN')} a day.`, facts, mentorContext(facts), draft), true);
    assert.equal(numbersAreGrounded('You can spend ₹4,321 a day.', facts, mentorContext(facts), draft), false);
});
