/**
 * v1.1 money decisions — Afford-It Check, Month Shape, Safe-to-Invest and the
 * SIP Stress Test — tested from raw rows through buildFacts, exactly as the
 * routes and Vittova AI use them.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { buildFacts, composeAnswer } = require('../lib/financialInsights');
const { computeSafeToSpend } = require('../lib/safeToSpend');
const { affordCheck, monthShape, safeToInvest, sipStressTest } = require('../lib/moneyDecisions');

const ist = (s) => {
    const [d, tm = '12:00'] = s.split(' ');
    const [Y, M, D] = d.split('-').map(Number);
    const [h, m] = tm.split(':').map(Number);
    return new Date(Date.UTC(Y, M - 1, D, h, m) - 5.5 * 3600 * 1000);
};
const on = (date, amount, category = 'Food', description = category) => ({ amount, category, description, occurred_at: ist(`${date} 13:00`).toISOString() });
const pad = (n) => String(n).padStart(2, '0');
const NOW = ist('2026-09-12 20:00'); // day 12 of 30; 19 days left including today

/** ₹300 of food a day this month (₹3,600 so far), ₹200 a day in August. */
function data(overrides = {}) {
    const expenses = [];
    for (let d = 1; d <= 12; d++) {
        expenses.push(on(`2026-08-${pad(d)}`, 200));
        expenses.push(on(`2026-09-${pad(d)}`, 300, 'Food', 'Swiggy'));
    }
    return {
        profile: { monthly_budget: 20000, investment_target: 2000 },
        expenses,
        bills: [{ name: 'Rent', amount: 1500, due_day: 25, is_active: true }],
        now: NOW,
        ...overrides,
    };
}
const facts = (overrides) => buildFacts(data(overrides));

// ─── Afford-It Check ────────────────────────────────────────────────────────

test('Afford-It: a normal purchase that leaves room for usual spending can be afforded', () => {
    const f = facts();
    // Safe to spend: 20,000 − 3,600 − 1,500 − 2,000 = 12,900. Usual pace ₹300 × 19 days = 5,700.
    const c = affordCheck(f, { amount: 4000, label: 'headphones' });
    assert.equal(c.verdict, 'can_afford');
    assert.equal(c.headline, 'You can afford this purchase.');
    assert.equal(c.safeToSpendRemaining, 12900);
    assert.equal(c.leftAfter, 8900);
    assert.equal(c.expectedRestOfMonth, 5700);
    assert.equal(c.budgetImpactPercent, 20);
    assert.equal(c.budgetUsedAfterPercent, 38); // (3,600 + 4,000) / 20,000
    assert.deepEqual(c.nextBill, { name: 'Rent', amount: 1500, dueDay: 25 });
    assert.match(c.detail, /₹4,000 for headphones fits within the ₹12,900/);
    assert.equal(c.confidence, 'good'); // 12 expenses this month and 12 last month
});

test('Afford-It: the same figure the dashboard shows is the one the check uses', () => {
    const d = data();
    const dashboard = computeSafeToSpend({ monthlyBudget: 20000, totalSpent: 3600, bills: d.bills, investmentTarget: 2000, now: NOW });
    assert.equal(affordCheck(buildFacts(d), { amount: 1 }).safeToSpendRemaining, dashboard.remaining);
});

test('Afford-It: a purchase that fits but squeezes the rest of the month says wait', () => {
    const c = affordCheck(facts(), { amount: 9000 });
    assert.equal(c.verdict, 'wait');
    assert.equal(c.headline, 'You can afford it, but waiting would give you more breathing room.');
    assert.equal(c.leftAfter, 3900);
    assert.match(c.detail, /₹3,900 would be left for 19 days.*about ₹5,700/);
    // A typical month at this pace (₹9,000 spend + ₹3,500 commitments) leaves ₹7,500:
    // not enough for ₹9,000 with a buffer, so no date is promised.
    assert.equal(c.saferDate, null);
});

test('Afford-It: a safer date is offered only when next month would take the purchase comfortably', () => {
    // A one-off ₹6,000 purchase this month; the usual pace comes from August (₹2,400 a month).
    const d = data();
    const f = facts({ expenses: [...d.expenses.filter((e) => e.occurred_at < ist('2026-09-01 00:00').toISOString()), on('2026-09-02', 6000, 'Shopping'), on('2026-09-03', 100)] });
    // Room: 20,000 − 6,100 − 1,500 − 2,000 = 10,400. Usual pace ₹80 × 19 = 1,520.
    const c = affordCheck(f, { amount: 9500 });
    assert.equal(c.verdict, 'wait');
    assert.equal(c.expectedRestOfMonth, 1520);
    // A typical month leaves 20,000 − 3,500 − 2,400 = 14,100, minus a ₹2,000 buffer = 12,100 ≥ 9,500.
    assert.deepEqual(c.saferDate, { dateKey: '2026-10-01', label: '1 Oct' });
    assert.match(c.detail, /From 1 Oct, a new month's budget should cover it comfortably/);
});

test('Afford-It: more than is safe to spend is not comfortable, with the gap and a plan', () => {
    const c = affordCheck(facts(), { amount: 20000 });
    assert.equal(c.verdict, 'not_comfortable');
    assert.equal(c.headline, 'This purchase would put your current month under pressure.');
    assert.equal(c.shortfall, 7100);
    assert.equal(c.leftAfter, 0);
    assert.equal(c.monthsToSave, 4); // ₹7,100 at the ₹2,000 savings target
    assert.doesNotMatch(`${c.headline} ${c.detail}`, /\b(irresponsible|bad|shouldn'?t have|wasteful|stupid)\b/i);
});

test('Afford-It: a very large purchase is handled without overflow or false promises', () => {
    const c = affordCheck(facts(), { amount: 10_000_000 });
    assert.equal(c.verdict, 'not_comfortable');
    assert.equal(c.shortfall, 10_000_000 - 12900);
    assert.equal(c.saferDate, null);
    assert.ok(Number.isFinite(c.monthsToSave) && c.monthsToSave > 100);
});

test('Afford-It: income is never assumed and is always listed as missing', () => {
    const c = affordCheck(facts(), { amount: 1000 });
    assert.match(c.missing[0], /income and bank balance/);
    assert.ok(!/income of|your income is|salary of/i.test(JSON.stringify(c)));
});

test('Afford-It: a missing budget is disclosed, not hidden', () => {
    const c = affordCheck(facts({ profile: { monthly_budget: null, investment_target: 0 } }), { amount: 500 });
    assert.ok(c.missing.some((m) => /monthly budget.*default of ₹5,000/.test(m)), c.missing.join(' | '));
});

test('Afford-It: a bill due today is still to pay and becomes the next bill', () => {
    const c = affordCheck(facts({ bills: [{ name: 'Phone', amount: 700, due_day: 12, is_active: true }, { name: 'Rent', amount: 1500, due_day: 25, is_active: true }] }), { amount: 1000 });
    assert.equal(c.safeToSpendRemaining, 12900 - 700);
    assert.equal(c.upcomingBills, 2200);
    assert.deepEqual(c.nextBill, { name: 'Phone', amount: 700, dueDay: 12 });
});

test('Afford-It: a planned expense later this month counts; one dated next month does not', () => {
    const base = data();
    const later = facts({ expenses: [...base.expenses, on('2026-09-28', 1000, 'Shopping')] });
    const nextMonth = facts({ expenses: [...base.expenses, on('2026-10-02', 5000, 'Shopping')] });
    assert.equal(affordCheck(later, { amount: 100 }).safeToSpendRemaining, 11900);
    assert.equal(affordCheck(nextMonth, { amount: 100 }).safeToSpendRemaining, 12900);
});

test('Afford-It: month boundary — the last evening of the month and the first minutes of the next', () => {
    const lastEvening = facts({ now: ist('2026-09-30 23:30') });
    assert.equal(lastEvening.daysLeft, 1);
    const c = affordCheck(lastEvening, { amount: 100 });
    assert.equal(c.daysLeft, 1);

    // 00:10 IST on 1 October is still 30 September in UTC: September's spending must not count.
    const firstMinutes = facts({ now: ist('2026-10-01 00:10') });
    assert.equal(firstMinutes.spentThisMonth, 0);
    assert.equal(affordCheck(firstMinutes, { amount: 100 }).safeToSpendRemaining, 20000 - 1500 - 2000);
});

test('Afford-It: a leap-year February has 29 days', () => {
    const f = facts({ now: ist('2028-02-29 10:00'), expenses: [on('2028-02-10', 1000)] });
    assert.equal(f.daysInMonth, 29);
    assert.equal(f.daysLeft, 1);
    assert.equal(affordCheck(f, { amount: 100 }).daysLeft, 1);
});

test('Afford-It: over budget already — negative balance is explained, never shown as negative room', () => {
    const f = facts({ expenses: [on('2026-09-02', 19500, 'Shopping')] });
    const c = affordCheck(f, { amount: 200 });
    assert.equal(c.verdict, 'not_comfortable');
    assert.equal(c.safeToSpendRemaining, 0);
    assert.match(c.detail, /already exceed this month's budget by ₹3,000/); // 19,500 + 1,500 + 2,000 − 20,000
});

test('Afford-It: a new user with no spending gets an honest, low-confidence answer', () => {
    const c = affordCheck(facts({ expenses: [] }), { amount: 1000 });
    assert.equal(c.verdict, 'can_afford');
    assert.equal(c.headline, 'This looks affordable on the data so far.');
    assert.equal(c.confidence, 'low');
    assert.equal(c.expectedRestOfMonth, null);
    assert.ok(c.missing.some((m) => /spending history/.test(m)));
});

test('Vittova AI answers "can I afford" with the Afford-It result, not its own formula', () => {
    const f = facts();
    for (const amount of [4000, 9000, 20000]) {
        const check = affordCheck(f, { amount });
        const ai = composeAnswer('affordability', f, `Can I afford ₹${amount} headphones?`);
        assert.ok(ai.direct.startsWith(check.headline), ai.direct);
        assert.ok(ai.numbers.includes(`Safe to spend remaining: ₹${check.safeToSpendRemaining.toLocaleString('en-IN')}`));
    }
});

// ─── Month Shape ────────────────────────────────────────────────────────────

test('Month Shape: a normal month is comfortable and shows every part of the projection', () => {
    const m = monthShape(facts());
    assert.equal(m.state, 'comfortable');
    assert.equal(m.spent, 3600);
    assert.equal(m.upcomingBills, 1500);
    assert.equal(m.remainingDiscretionary, 12900);
    assert.equal(m.dailyPace, 300);
    assert.equal(m.projectedSpend, 3600 + 5700);
    assert.equal(m.projectedMonthEnd, 20000 - 9300 - 1500 - 2000); // 7,200
    assert.match(m.assumptions.join(' '), /not a guarantee/);
});

test('Month Shape: high spending makes the month tight', () => {
    const expenses = [];
    for (let d = 1; d <= 12; d++) expenses.push(on(`2026-09-${pad(d)}`, 900));
    const m = monthShape(facts({ expenses }));
    // 10,800 spent; 900 × 19 = 17,100 expected → projected end well below zero.
    assert.equal(m.state, 'tight');
    assert.ok(m.projectedMonthEnd < 0);
});

test('Month Shape: little room left is "watch", not "tight"', () => {
    const expenses = [];
    for (let d = 1; d <= 12; d++) expenses.push(on(`2026-09-${pad(d)}`, 450));
    // 5,400 spent + 450 × 19 = 8,550 → projected end 20,000 − 13,950 − 3,500 = 2,550… comfortable at ₹20k.
    // Raise the target so the buffer (₹2,000) is not met.
    const m = monthShape(facts({ expenses, profile: { monthly_budget: 20000, investment_target: 4000 } }));
    assert.equal(m.projectedMonthEnd, 550);
    assert.equal(m.state, 'watch');
});

test('Month Shape: a new user and a month with no transactions are handled honestly', () => {
    const m = monthShape(facts({ expenses: [] }));
    assert.equal(m.state, 'comfortable');
    assert.equal(m.confidence, 'low');
    assert.equal(m.dailyPace, null);
    assert.match(m.headline, /Log a few more expenses/);
    assert.equal(m.spent, 0);
});

test('Month Shape: future bills are part of the shape; paid-off (earlier) bills are not', () => {
    const m = monthShape(facts({ bills: [{ name: 'Gym', amount: 800, due_day: 5, is_active: true }, { name: 'Rent', amount: 1500, due_day: 25, is_active: true }] }));
    assert.equal(m.upcomingBills, 1500);
    assert.deepEqual(m.upcomingBillList.map((b) => b.name), ['Rent']);
});

test('Month Shape: at the month transition the new month starts clean', () => {
    const m = monthShape(facts({ now: ist('2026-10-01 09:00') }));
    assert.equal(m.spent, 0);
    assert.equal(m.dayOfMonth, 1);
    assert.equal(m.daysInMonth, 31);
    // No expenses in October yet, but September's history gives a usual pace.
    assert.ok(m.dailyPace > 0);
});

test('Month Shape: commitments above the budget are tight whatever the pace', () => {
    const m = monthShape(facts({ expenses: [], bills: [{ name: 'Rent', amount: 25000, due_day: 28, is_active: true }] }));
    assert.equal(m.state, 'tight');
    assert.equal(m.shortfall, 25000 + 2000 - 20000);
    assert.match(m.headline, /commitments already exceed the budget/);
});

// ─── Safe-to-Invest ─────────────────────────────────────────────────────────

test('Safe-to-Invest: normal amount is what the month does not need, stated with assumptions', () => {
    const s = safeToInvest(facts());
    assert.equal(s.amount, 12900 - 5700);
    assert.equal(s.statement, 'Based on your current cash flow, approximately ₹7,200 appears available for investing this month.');
    assert.match(s.assumptions.join(' '), /₹2,000 monthly savings target is already set aside/);
    assert.match(s.note, /not investment advice.*not a SEBI-registered/);
});

test('Safe-to-Invest: zero when the month needs everything that is left', () => {
    const expenses = [];
    for (let d = 1; d <= 12; d++) expenses.push(on(`2026-09-${pad(d)}`, 700));
    const s = safeToInvest(facts({ expenses }));
    // 20,000 − 8,400 − 1,500 − 2,000 = 8,100 left; 700 × 19 = 13,300 needed.
    assert.equal(s.amount, 0);
    assert.match(s.statement, /Nothing appears spare/);
});

test('Safe-to-Invest: never negative when commitments exceed the budget', () => {
    const s = safeToInvest(facts({ bills: [{ name: 'Rent', amount: 30000, due_day: 28, is_active: true }] }));
    assert.equal(s.amount, 0);
    assert.ok(s.shortfall > 0);
    assert.match(s.statement, /commitments already exceed the budget by/);
});

test('Safe-to-Invest: missing data is disclosed and nothing is invented', () => {
    const s = safeToInvest(facts({ expenses: [] }));
    assert.equal(s.confidence, 'low');
    assert.ok(s.missing.some((m) => /emergency fund/.test(m)));
    assert.ok(s.missing.some((m) => /spending history/.test(m)));
});

test('Safe-to-Invest and the AI investing answer use the same figure', () => {
    const f = facts();
    const ai = composeAnswer('investing', f, 'Where should I invest ₹20,000 for 5 years?');
    assert.ok(ai.numbers.some((n) => n.includes(`₹${safeToInvest(f).amount.toLocaleString('en-IN')}`)), ai.numbers.join('\n'));
});

// ─── SIP Stress Test ────────────────────────────────────────────────────────

test('SIP Stress Test: a normal SIP fits a typical month', () => {
    const s = sipStressTest(facts(), { monthlyAmount: 1000 });
    // Typical month: 20,000 − (1,500 + 2,000) − 9,000 (this month's pace) = 7,500 → 6,500 after.
    assert.equal(s.leftBefore, 7500);
    assert.equal(s.leftAfter, 6500);
    assert.equal(s.state, 'comfortable');
    assert.equal(s.shareOfBudgetPercent, 5);
    assert.equal(s.thisMonth.afterSip, 11900);
    assert.match(s.headline, /₹1,000 monthly SIP fits/);
});

test('SIP Stress Test: an amount that leaves little room is "watch"; too much is "tight"', () => {
    assert.equal(sipStressTest(facts(), { monthlyAmount: 6000 }).state, 'watch');
    const t = sipStressTest(facts(), { monthlyAmount: 12000 });
    assert.equal(t.state, 'tight');
    assert.equal(t.leftAfter, -4500);
    assert.match(t.headline, /would make a typical month tight/);
});

test('SIP Stress Test: never names a product and never promises returns', () => {
    const s = sipStressTest(facts(), { monthlyAmount: 3000 });
    const text = JSON.stringify(s);
    assert.doesNotMatch(text, /\b(nifty|sensex|hdfc|sbi|icici|axis|zerodha|groww|guaranteed return|will grow to)\b/i);
    assert.match(s.assumptions.join(' '), /returns are never guaranteed/);
});

test('SIP Stress Test: missing budget and missing spending history are disclosed', () => {
    const s = sipStressTest(facts({ expenses: [], profile: { monthly_budget: null, investment_target: 0 } }), { monthlyAmount: 500 });
    assert.equal(s.typicalSpending, null);
    assert.equal(s.confidence, 'low');
    assert.ok(s.missing.some((m) => /monthly budget/.test(m)));
    assert.ok(s.missing.some((m) => /typical month of spending/.test(m)));
    assert.match(s.missing[0], /income/);
});
