/**
 * "Where should I invest ₹2,000?" — the deterministic decision layer.
 *
 * The answer must change because the user's figures and statements change,
 * never at random, and must never invent income, balances, debts, an emergency
 * fund or existing investments.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { buildFacts, composeAnswer, toText, classifyIntent } = require('../lib/financialInsights');
const { buildInvestmentContext } = require('../lib/investmentDecision');

const ist = (s) => {
    const [d, tm = '12:00'] = s.split(' ');
    const [Y, M, D] = d.split('-').map(Number);
    const [h, m] = tm.split(':').map(Number);
    return new Date(Date.UTC(Y, M - 1, D, h, m) - 5.5 * 3600 * 1000);
};
const on = (date, amount, category = 'Food') => ({ amount, category, description: category, occurred_at: ist(`${date} 13:00`).toISOString() });
const pad = (n) => String(n).padStart(2, '0');
const NOW = ist('2026-09-12 20:00'); // day 12 of 30, 19 days left

/** @param {{bills?: Array, daily?: number, budget?: number, target?: number}} o */
function facts({ bills = [], daily = 300, budget = 20000, target = 2000 } = {}) {
    const expenses = [];
    for (let d = 1; d <= 12; d++) expenses.push(on(`2026-09-${pad(d)}`, daily));
    for (let d = 1; d <= 12; d++) expenses.push(on(`2026-08-${pad(d)}`, 200));
    return buildFacts({ profile: { monthly_budget: budget, investment_target: target }, expenses, bills, now: NOW });
}

const answerFor = (f, q) => composeAnswer(classifyIntent(q), f, q);
const textFor = (f, q) => toText(answerFor(f, q));

const BILL = [{ name: 'Rent', amount: 6000, due_day: 25, is_active: true }];

test('the investing engine is used for "where should I invest" questions', () => {
    assert.equal(classifyIntent('I have ₹2,000, where should I invest?'), 'investing');
    const a = answerFor(facts(), 'I have ₹2,000, where should I invest?');
    for (const section of ['direct', 'numbers', 'missing', 'approaches', 'tradeoffs', 'next', 'note']) {
        assert.ok(a[section] && a[section].length, `missing section: ${section}`);
    }
});

// ─── A vs B: the same amount, with and without an upcoming bill ─────────────

test('A/B: an upcoming bill changes the spare amount and the answer', () => {
    const withBill = facts({ bills: BILL });
    const withoutBill = facts({ bills: [] });
    const a = answerFor(withBill, 'I have ₹2,000, where should I invest?');
    const b = answerFor(withoutBill, 'I have ₹2,000, where should I invest?');

    const ctxA = buildInvestmentContext(withBill, 'I have ₹2,000, where should I invest?', 2000);
    const ctxB = buildInvestmentContext(withoutBill, 'I have ₹2,000, where should I invest?', 2000);
    assert.equal(ctxA.upcomingBills, 6000);
    assert.equal(ctxB.upcomingBills, 0);
    assert.equal(ctxB.spareThisMonth - ctxA.spareThisMonth, 6000, 'the bill reduces what is spare');
    assert.notDeepEqual(a.numbers, b.numbers);
    assert.ok(a.numbers.some((n) => /Bills still due: ₹6,000/.test(n)));
    assert.ok(!b.numbers.some((n) => /Bills still due/.test(n)));
});

test('A: when the bill leaves less than the amount, only the spare part is called spare', () => {
    // Budget 8,000: safe-to-spend 8,000 − 3,600 spent − 6,000 bill − 2,000 target < 0.
    const tight = facts({ bills: BILL, budget: 12000 });
    const ctx = buildInvestmentContext(tight, 'I have ₹2,000, where should I invest?', 2000);
    assert.ok(ctx.amountExceedsSpare, 'the month needs that money');
    const a = answerFor(tight, 'I have ₹2,000, where should I invest?');
    assert.match(a.direct, /only about ₹\d/, a.direct);
    assert.match(a.action, /only what the month does not need/);
});

// ─── C: a different amount ──────────────────────────────────────────────────

test('C: ₹10,000 in the same context gives different figures from ₹2,000', () => {
    const f = facts({ bills: BILL });
    const small = answerFor(f, 'I have ₹2,000, where should I invest?');
    const large = answerFor(f, 'I have ₹10,000, where should I invest?');
    assert.match(small.numbers[0], /₹2,000/);
    assert.match(large.numbers[0], /₹10,000/);
    assert.notEqual(small.direct, large.direct);
    // ₹10,000 is more than this month's spare, ₹2,000 is not.
    assert.equal(buildInvestmentContext(f, 'x', 2000).amountExceedsSpare, false);
    assert.equal(buildInvestmentContext(f, 'x', 10000).amountExceedsSpare, true);
});

// ─── D vs E: time horizon ───────────────────────────────────────────────────

test('D/E: 3 months and 5 years produce different approaches and trade-offs', () => {
    const f = facts();
    const short = answerFor(f, 'I have ₹2,000 for 3 months, where should I invest?');
    const long = answerFor(f, 'I have ₹2,000 for 5 years, where should I invest?');

    assert.ok(short.approaches.join(' ').match(/savings account|fixed or recurring deposit|liquid/i), short.approaches.join(' | '));
    assert.ok(!short.approaches.join(' ').match(/mostly equity/i), 'no equity for 3 months');
    assert.ok(long.approaches.join(' ').match(/equity/i), long.approaches.join(' | '));
    assert.notEqual(short.tradeoffs, long.tradeoffs);
    assert.ok(!short.missing.includes('how long this money can stay invested'), 'horizon is known');
});

test('E: a monthly amount over years is illustrated at a stated assumed rate', () => {
    const f = facts();
    const a = answerFor(f, 'I want to invest ₹2,000 every month for 5 years');
    assert.ok(a.numbers.some((n) => /₹1,20,000 put in/.test(n)), a.numbers.join('\n'));
    assert.ok(a.numbers.some((n) => /assumed 6% a year/.test(n)));
    assert.match(a.note, /not a recommendation of any product/);
});

// ─── F and G: what the user tells us ────────────────────────────────────────

test('F: with no emergency fund, that becomes the first step', () => {
    const f = facts();
    const a = answerFor(f, 'I have ₹2,000 but no emergency fund, where should I invest it for 5 years?');
    assert.match(a.tradeoffs, /no emergency fund/);
    assert.match(a.next, /emergency fund first/);
    assert.ok(!a.missing.includes('whether you already have an emergency fund'), 'the user told us');
});

test('F on a new account: no emergency fund still comes first, with no invented income', () => {
    // Seen on a device: a new user with a budget but no expenses logged yet.
    const f = buildFacts({ profile: { monthly_budget: 5000 }, expenses: [], bills: [], now: NOW });
    const q = "I have ₹2,000 that I won't need for 6 months, and I don't have an emergency fund yet. Where should I invest?";
    const a = answerFor(f, q);
    assert.match(a.direct, /no emergency fund yet/);
    assert.match(a.next, /emergency fund first/i);
    assert.doesNotMatch(textFor(f, q), /income arrives|salary|6 months horizon/);
    const short = answerFor(f, "I have ₹2,000 that I won't need for 6 months. Where should I invest?");
    assert.match(short.direct, /6-month horizon/);
});

test('G: someone who already invests gets a different framing', () => {
    const f = facts();
    const already = answerFor(f, 'I have ₹2,000 and already invest, where should I put it for 5 years?');
    const plain = answerFor(f, 'I have ₹2,000, where should I invest it for 5 years?');
    assert.match(already.tradeoffs, /already invest/);
    assert.ok(!plain.tradeoffs.includes('already invest'));
    assert.notEqual(already.tradeoffs, plain.tradeoffs);
});

test('a stated wish for safety changes the trade-offs, not the figures', () => {
    const f = facts();
    const safe = answerFor(f, 'Where should I invest ₹2,000 safely for 5 years?');
    assert.match(safe.tradeoffs, /deposit-style options fit better/);
});

// ─── Never invented, never promised ─────────────────────────────────────────

test('nothing is invented and nothing is promised', () => {
    const f = facts({ bills: BILL });
    for (const q of [
        'I have ₹2,000, where should I invest?',
        'I have ₹2,000 for 3 months, where should I invest?',
        'I have ₹2,000 for 5 years, where should I invest?',
        'I have ₹10,000 and already invest, where should I put it?',
    ]) {
        const text = textFor(f, q);
        // Promises, not warnings: "returns are never guaranteed" is fine.
        assert.doesNotMatch(text, /\b(guaranteed returns?|assured returns?|risk-?free|will (definitely )?grow|sure shot|no risk\b)/i, q);
        assert.match(text, /never guaranteed|not a recommendation/i, q);
        assert.doesNotMatch(text, /\b(zerodha|groww|kuvera|nifty ?bees|hdfc|sbi|icici|axis|paytm money|upstox|coin)\b/i, q);
        assert.match(text, /not investment advice/, q);
        // Income, balances and debts are reported as unknown, never used.
        assert.match(text, /Vittova does not track/, q);
    }
});

test('the whole month being short stops the investing answer', () => {
    const broke = facts({ bills: [{ name: 'Rent', amount: 15000, due_day: 25, is_active: true }] });
    assert.ok(broke.shortfall > 0);
    const a = answerFor(broke, 'I have ₹2,000, where should I invest?');
    assert.match(a.direct, /would not invest this month/);
});

test('goal-shaped questions still use the horizon guide', () => {
    const f = facts();
    const retirement = answerFor(f, 'How should I invest for retirement?');
    assert.match(retirement.direct, /horizon|gap/i);
    assert.equal(retirement.approaches.length, 0, 'the goal guide does not use the approaches section');
});
