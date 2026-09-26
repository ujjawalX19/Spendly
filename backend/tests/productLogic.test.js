const test = require('node:test');
const assert = require('node:assert/strict');

const { splitEqually, computeNetBalances, suggestSettlements } = require('../lib/groupBalances');
const { buildFacts, composeAnswer, toText, classifyIntent, extractAmount, numbersAreGrounded } = require('../lib/financialInsights');
const { computeWealth } = require('../lib/wealth');
const { detectSubscriptions, applyCancellations } = require('../lib/subscriptions');

const ist = (s) => {
    const [d, tm = '12:00'] = s.split(' ');
    const [Y, M, D] = d.split('-').map(Number);
    const [h, m] = tm.split(':').map(Number);
    return new Date(Date.UTC(Y, M - 1, D, h, m) - 5.5 * 3600 * 1000);
};
const on = (date, amount, category, description = category) => ({ amount, category, description, occurred_at: ist(`${date} 13:00`).toISOString() });
const pad = (n) => String(n).padStart(2, '0');

// ─── Group balances ─────────────────────────────────────────────────────────

test('equal splits are exact in paise and deterministic', () => {
    const shares = splitEqually(10000, ['c', 'a', 'b']);
    assert.equal([...shares.values()].reduce((x, y) => x + y, 0), 10000);
    assert.equal(shares.get('a'), 3334);
    assert.equal(shares.get('b'), 3333);
    assert.throws(() => splitEqually(100, []));
});

test('balances net to zero and the settle-up plan clears every debt', () => {
    const members = ['asha', 'bala', 'chitra'];
    const expenses = [
        { amount: 900, paid_by: 'asha', splits: members.map((user_id) => ({ user_id })) },
        { amount: 300, paid_by: 'bala', splits: [{ user_id: 'bala' }, { user_id: 'chitra' }] },
    ];
    const net = computeNetBalances(members, expenses, []);
    assert.equal([...net.values()].reduce((a, b) => a + b, 0), 0);
    assert.equal(net.get('asha'), 60000);
    assert.equal(net.get('bala'), -15000);
    assert.equal(net.get('chitra'), -45000);
    assert.deepEqual(suggestSettlements(net), [
        { from: 'chitra', to: 'asha', amount: 450 },
        { from: 'bala', to: 'asha', amount: 150 },
    ]);

    const after = computeNetBalances(members, expenses, [
        { from_user_id: 'chitra', to_user_id: 'asha', amount: 450 },
        { from_user_id: 'bala', to_user_id: 'asha', amount: 150 },
    ]);
    assert.ok([...after.values()].every((v) => v === 0));
    assert.deepEqual(suggestSettlements(after), []);
});

test('stored shares are used when they add up, otherwise an equal split', () => {
    const good = computeNetBalances(['a', 'b'], [{ amount: 100, paid_by: 'a', splits: [{ user_id: 'a', share_amount: 70 }, { user_id: 'b', share_amount: 30 }] }], []);
    assert.equal(good.get('b'), -3000);
    const bad = computeNetBalances(['a', 'b'], [{ amount: 100, paid_by: 'a', splits: [{ user_id: 'a', share_amount: 70 }, { user_id: 'b', share_amount: 70 }] }], []);
    assert.equal(bad.get('b'), -5000);
});

// ─── Coach insights ─────────────────────────────────────────────────────────

function coachFixture() {
    const expenses = [];
    for (let d = 1; d <= 12; d++) {
        expenses.push(on(`2026-08-${pad(d)}`, 200, 'Food'));
        expenses.push(on(`2026-09-${pad(d)}`, 300, 'Food', 'Swiggy'));
    }
    expenses.push(on('2026-08-05', 400, 'Entertainment'), on('2026-09-06', 1120, 'Entertainment', 'Concert'));
    return {
        profile: { monthly_budget: 20000, investment_target: 2000 },
        expenses,
        bills: [{ amount: 1500, due_day: 25, is_active: true }],
        now: ist('2026-09-12 20:00'),
    };
}

test('intents cover every question type the coach supports', () => {
    const cases = {
        'Why did I overspend this month?': 'spending_analysis',
        'Am I within budget?': 'budget_advice',
        'How can I save more?': 'savings_advice',
        'How long to save ₹50,000?': 'goal_planning',
        'How much can I spend per day?': 'safe_to_spend',
        'Any unusual spending?': 'unusual_spending',
        'Show my subscriptions': 'subscriptions',
        'Give me a monthly summary': 'monthly_summary',
        'Can I afford ₹3,000 headphones?': 'affordability',
        'What is an emergency fund?': 'education',
        'Where should I invest my savings?': 'investing',
        'What is a SIP?': 'education',
        'How should I invest ₹5,000 a month for 10 years?': 'investing',
    };
    for (const [q, intent] of Object.entries(cases)) assert.equal(classifyIntent(q), intent, q);
});

test('spending analysis explains the increase with real category numbers', () => {
    const facts = buildFacts(coachFixture());
    assert.equal(facts.spentThisMonth, 4720);
    assert.equal(facts.spentLastMonthSamePoint, 2800);
    assert.equal(facts.changeVsLastMonthSamePoint, 1920);
    assert.equal(facts.incomeTracked, false);

    const q = 'Why did I overspend this month?';
    const a = composeAnswer(classifyIntent(q), facts, q);
    assert.match(a.direct, /₹1,920 more/);
    assert.ok(a.numbers.some((n) => /Food: ₹3,600 this month, up ₹1,200/.test(n)), a.numbers.join('\n'));
    assert.ok(a.numbers.some((n) => /Entertainment: ₹1,120 this month, up ₹720/.test(n)));
    assert.match(a.action, /about ₹944/);
    assert.ok(a.reasoning.includes('Food'));
});

test('affordability, safe-to-spend and goal answers are computed, never guessed', () => {
    const facts = buildFacts(coachFixture());
    assert.equal(facts.safeToSpendRemaining, 11780); // 20000 − 4720 − 1500 − 2000
    assert.equal(extractAmount('Can I afford ₹3,000 headphones?'), 3000);
    assert.equal(extractAmount('a phone for 1.5 lakh'), 150000);
    assert.equal(extractAmount('a 20k phone'), 20000);

    assert.match(composeAnswer('affordability', facts, 'Can I afford ₹3,000 headphones?').direct, /^You can afford this purchase\. ₹3,000 fits within the ₹11,780/);
    assert.match(composeAnswer('affordability', facts, 'Can I afford a 20k phone?').direct, /^This purchase would put your current month under pressure/);
    assert.match(composeAnswer('goal_planning', facts, 'How long to save ₹50,000?').direct, /about 25 months/);
    assert.match(composeAnswer('safe_to_spend', facts, 'per day').direct, /₹11,780 in total/);
});

test('with too little data the coach says so instead of analysing', () => {
    const facts = buildFacts({ profile: { monthly_budget: 10000 }, expenses: [on('2026-09-01', 100, 'Food')], bills: [], now: ist('2026-09-12') });
    assert.match(composeAnswer('spending_analysis', facts, 'why').direct, /don't have enough/);
});

test('AI replies with invented figures fail the grounding check', () => {
    const facts = buildFacts(coachFixture());
    const draft = toText(composeAnswer('spending_analysis', facts, 'why'));
    assert.equal(numbersAreGrounded('You spent ₹1,920 more, mostly ₹1,200 extra on food.', facts, draft, 'why'), true);
    assert.equal(numbersAreGrounded('You spent ₹7,777 more than usual.', facts, draft, 'why'), false);
    assert.equal(numbersAreGrounded('Cut food by 35%.', facts, draft, 'why'), false);
});

// ─── Wealth ─────────────────────────────────────────────────────────────────

test('wealth reports six months of real history and never invents investments', () => {
    const f = coachFixture();
    const w = computeWealth({ profile: { ...f.profile, total_chillar: 123.45 }, expenses: f.expenses, bills: f.bills, now: f.now });
    assert.deepEqual(w.history.map((h) => h.month), ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    assert.equal(w.history[5].spent, 4720);
    assert.equal(w.history[5].inProgress, true);
    assert.equal(w.history[4].spent, 2800); // 12 × ₹200 + ₹400
    assert.equal(w.month.leftAfterCommitments, 11780);
    assert.equal(w.roundUps.total, 123.45);
    assert.deepEqual(w.tracked, { income: false, bankBalance: false, investments: false });
    assert.equal(w.illustration.hypothetical, true);
    assert.equal(w.illustration.basis, 'savings_target');
    assert.equal(w.illustration.monthlyAmount, 2000);
});

// ─── Subscription cancellations ─────────────────────────────────────────────

test('cancelled subscriptions change status and totals, and a renewed charge is flagged', () => {
    const now = ist('2026-09-13');
    const rows = ['2026-07-05', '2026-08-05', '2026-09-05'].map((d) => on(d, 649, 'Entertainment', 'Netflix'));
    const detected = detectSubscriptions(rows, now);
    assert.equal(detected.activeMonthlyTotal, 649);

    const chargedAgain = applyCancellations(detected, [{ normalized_name: 'netflix', merchant: 'Netflix', monthly_amount: 649, cancelled_at: ist('2026-08-20').toISOString() }]);
    assert.equal(chargedAgain.subscriptions[0].status, 'charged_after_cancel');
    assert.equal(chargedAgain.activeMonthlyTotal, 649);

    const cancelled = applyCancellations(detected, [{ normalized_name: 'netflix', merchant: 'Netflix', monthly_amount: 649, cancelled_at: ist('2026-09-10').toISOString() }]);
    assert.equal(cancelled.subscriptions[0].status, 'cancelled');
    assert.equal(cancelled.activeMonthlyTotal, 0);
    assert.equal(cancelled.cancelledMonthlySavings, 649);
    assert.equal(cancelled.subscriptions[0].annualAmount, 7788);
});
