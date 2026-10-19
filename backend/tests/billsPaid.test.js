/**
 * Safe-to-Spend must not count a bill twice: once as spent (the user logged
 * the payment) and again as still due. lib/safeToSpend.billsPaidThisMonth,
 * and the same answer on every screen that uses it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeSafeToSpend, billsPaidThisMonth } = require('../lib/safeToSpend');
const { buildFacts } = require('../lib/financialInsights');
const { affordCheck } = require('../lib/moneyDecisions');

const NOW = new Date('2026-10-03T14:00:00+05:30'); // 3 Oct, 29 days left including today
const at = (day, hh = 10) => new Date(`2026-10-${String(day).padStart(2, '0')}T${String(hh).padStart(2, '0')}:00:00+05:30`).toISOString();
const rent = { name: 'Rent', amount: 8000, due_day: 5, is_active: true };
const wifi = { name: 'Airtel Wi-Fi', amount: 799, due_day: 20, is_active: true };

test('a bill paid and logged before its due day is not counted again', () => {
    const expenses = [{ amount: 8000, description: 'Rent October', category: 'Rent', occurred_at: at(2) }];
    const paid = billsPaidThisMonth([rent, wifi], expenses, NOW);
    assert.ok(paid.has(rent));
    assert.ok(!paid.has(wifi));
    const sts = computeSafeToSpend({ monthlyBudget: 20000, totalSpent: 8000, bills: [rent, wifi], now: NOW, expenses });
    assert.equal(sts.upcomingBills, 799);
    assert.equal(sts.remaining, 20000 - 8000 - 799);
    assert.deepEqual(sts.upcomingBillList.map((b) => b.name), ['Airtel Wi-Fi']);
    // Without the expenses (old behaviour) rent was subtracted twice.
    assert.equal(computeSafeToSpend({ monthlyBudget: 20000, totalSpent: 8000, bills: [rent, wifi], now: NOW }).remaining, 20000 - 8000 - 8000 - 799);
});

test('only a clear match counts as paid: name, amount within 10%, not long before the due day', () => {
    const cases = [
        [{ amount: 8000, description: 'Swiggy', category: 'Food', occurred_at: at(2) }, false, 'no shared word'],
        [{ amount: 5000, description: 'Rent part', category: 'Rent', occurred_at: at(2) }, false, 'amount far off'],
        [{ amount: 8600, description: 'Rent', category: 'Other', occurred_at: at(2) }, true, 'within 10%'],
        [{ amount: 8000, description: 'Rent', category: 'Rent', occurred_at: '2026-09-30T10:00:00+05:30' }, false, 'last month'],
        [{ amount: 8000, description: 'Payment', category: 'Rent', occurred_at: at(2) }, true, 'category says rent'],
        [{ amount: 8000, description: 'Rent', category: 'Rent', occurred_at: at(4) }, false, 'dated after now'],
    ];
    for (const [expense, expected, why] of cases) {
        assert.equal(billsPaidThisMonth([rent], [expense], NOW).has(rent), expected, why);
    }
    const early = { name: 'Netflix', amount: 649, due_day: 28, is_active: true };
    assert.ok(!billsPaidThisMonth([early], [{ amount: 649, description: 'NETFLIX.COM', occurred_at: at(2) }], NOW).has(early), 'more than 5 days before the due day: likely last cycle or something else');
});

test('one payment pays one bill, and inactive bills are ignored', () => {
    const a = { name: 'Jio recharge', amount: 299, due_day: 4, is_active: true };
    const b = { name: 'Jio recharge', amount: 299, due_day: 6, is_active: true };
    const paid = billsPaidThisMonth([a, b], [{ amount: 299, description: 'Jio', category: 'Recharge', occurred_at: at(2) }], NOW);
    assert.equal(paid.size, 1);
    const off = { ...rent, is_active: false };
    assert.equal(billsPaidThisMonth([off], [{ amount: 8000, description: 'Rent', occurred_at: at(2) }], NOW).size, 0);
});

test('Home, the AI facts and Afford-It give the same Safe-to-Spend when a bill is already paid', () => {
    const expenses = [
        { amount: 8000, description: 'Rent October', category: 'Rent', occurred_at: at(2) },
        { amount: 450, description: 'Groceries', category: 'Food', occurred_at: at(3, 9) },
    ];
    const profile = { monthly_budget: 20000, investment_target: 1000 };
    const home = computeSafeToSpend({ monthlyBudget: 20000, totalSpent: 8450, bills: [rent, wifi], investmentTarget: 1000, now: NOW, expenses });
    const facts = buildFacts({ profile, expenses, bills: [rent, wifi], now: NOW });
    assert.equal(facts.safeToSpendRemaining, home.remaining);
    assert.equal(facts.safeToSpendPerDay, home.daily);
    assert.equal(facts.upcomingBills, 799);
    assert.equal(affordCheck(facts, { amount: 1000 }).safeToSpendRemaining, home.remaining);
});
