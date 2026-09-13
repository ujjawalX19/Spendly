const test = require('node:test');
const assert = require('node:assert/strict');

const { buildContext, describeContext } = require('../lib/financialContext');

const NOW = new Date('2026-04-15T06:00:00Z'); // 15 April, 11:30 IST

const expense = (amount, category, day = 5) => ({
    amount,
    category,
    occurred_at: `2026-04-${String(day).padStart(2, '0')}T06:00:00Z`,
});

const many = (n, amount, category) =>
    Array.from({ length: n }, (_, i) => expense(amount, category, (i % 14) + 1));

test('reports spend, budget and pace', () => {
    const ctx = buildContext({
        thisMonth: many(12, 100, 'Food'),
        lastMonth: many(12, 100, 'Food'),
        profile: { monthly_budget: 10000 },
        now: NOW,
    });
    assert.equal(ctx.spentThisMonth, 1200);
    assert.equal(ctx.budget, 10000);
    assert.equal(ctx.dayOfMonth, 15);
    assert.equal(ctx.daysInMonth, 30);
    assert.equal(ctx.daysLeft, 16);
    assert.equal(ctx.projectedMonthEnd, 2400); // 1200/15 * 30
    assert.equal(ctx.onPaceToOverspend, false);
});

test('flags being on pace to overspend', () => {
    const ctx = buildContext({
        thisMonth: many(20, 500, 'Food'),   // 10,000 by day 15
        lastMonth: many(10, 100, 'Food'),
        profile: { monthly_budget: 12000 },
        now: NOW,
    });
    assert.equal(ctx.spentThisMonth, 10000);
    assert.equal(ctx.projectedMonthEnd, 20000);
    assert.equal(ctx.onPaceToOverspend, true);
});

test('identifies what actually drove a month-over-month change', () => {
    // Food up 1,850; Transport roughly flat. The mover is what makes advice
    // actionable: "you spent more" versus "food delivery is up 1,850".
    const ctx = buildContext({
        thisMonth: [...many(10, 300, 'Food'), ...many(5, 100, 'Transport')],
        lastMonth: [...many(10, 115, 'Food'), ...many(5, 100, 'Transport')],
        profile: { monthly_budget: 10000 },
        now: NOW,
    });
    const top = ctx.biggestMovers[0];
    assert.equal(top.category, 'Food');
    assert.equal(top.change, 3000 - 1150);
    assert.equal(top.amount, 3000);
    assert.equal(top.previous, 1150);
});

test('ignores movers below the noise floor', () => {
    const ctx = buildContext({
        thisMonth: many(10, 105, 'Food'),
        lastMonth: many(10, 100, 'Food'),
        profile: { monthly_budget: 10000 },
        now: NOW,
    });
    assert.equal(ctx.biggestMovers.length, 0, 'a ₹50 shift is not worth mentioning');
});

test('safe-to-spend subtracts upcoming bills and the investment target', () => {
    const ctx = buildContext({
        thisMonth: many(10, 200, 'Food'),               // 2,000 spent
        lastMonth: [],
        profile: { monthly_budget: 20000, investment_target: 3000 },
        bills: [
            { amount: 5000, due_day: 20, is_active: true },   // still upcoming
            { amount: 1000, due_day: 2, is_active: true },    // already past
            { amount: 9999, due_day: 25, is_active: false },  // inactive
        ],
        now: NOW,
    });
    assert.equal(ctx.upcomingBills, 5000);
    assert.equal(ctx.safeToSpendRemaining, 20000 - 2000 - 5000 - 3000);
    assert.equal(ctx.safeToSpendPerDay, Math.round(10000 / 16));
});

test('safe-to-spend never goes negative', () => {
    const ctx = buildContext({
        thisMonth: many(20, 2000, 'Rent'),
        lastMonth: [],
        profile: { monthly_budget: 5000 },
        now: NOW,
    });
    assert.equal(ctx.safeToSpendRemaining, 0);
    assert.equal(ctx.safeToSpendPerDay, 0);
    assert.ok(ctx.overBudgetBy > 0);
});

test('confidence reflects how much history exists', () => {
    const base = { profile: { monthly_budget: 10000 }, now: NOW };
    assert.equal(buildContext({ ...base, thisMonth: [], lastMonth: [] }).confidence, 'insufficient');
    assert.equal(buildContext({ ...base, thisMonth: many(3, 100, 'Food'), lastMonth: [] }).confidence, 'insufficient');
    assert.equal(buildContext({ ...base, thisMonth: many(6, 100, 'Food'), lastMonth: [] }).confidence, 'limited');
    assert.equal(
        buildContext({ ...base, thisMonth: many(12, 100, 'Food'), lastMonth: many(12, 100, 'Food') }).confidence,
        'good'
    );
});

test('a brand new user is told there is not enough data, not given analysis', () => {
    const ctx = buildContext({
        thisMonth: [expense(250, 'Food')],
        lastMonth: [],
        profile: { monthly_budget: 10000 },
        now: NOW,
    });
    const text = describeContext(ctx);
    assert.match(text, /not enough/i);
    assert.doesNotMatch(text, /biggest category/i, 'must not characterise habits from one expense');
});

test('the description only states figures present in the context', () => {
    const ctx = buildContext({
        thisMonth: [...many(10, 300, 'Food'), ...many(5, 200, 'Transport')],
        lastMonth: many(12, 100, 'Food'),
        profile: { monthly_budget: 10000 },
        now: NOW,
    });
    const text = describeContext(ctx);
    assert.match(text, /day 15 of 30/);
    assert.match(text, /₹4,000/);            // 3000 food + 1000 transport
    assert.match(text, /Food/);
    assert.ok(!/undefined|NaN|Infinity/.test(text), text);
});

test('handles an empty profile and junk rows without throwing', () => {
    const ctx = buildContext({
        thisMonth: [{ amount: null }, { amount: 'abc', category: undefined }, {}],
        lastMonth: null || [],
        profile: {},
        now: NOW,
    });
    assert.equal(ctx.budget, 0);
    assert.ok(Number.isFinite(ctx.spentThisMonth));
    assert.ok(!/undefined|NaN/.test(describeContext(ctx)));
});

test('top categories are ordered by size and capped at five', () => {
    const ctx = buildContext({
        thisMonth: [
            ...many(2, 100, 'Food'), ...many(2, 900, 'Rent'), ...many(2, 300, 'Transport'),
            ...many(2, 50, 'Recharge'), ...many(2, 400, 'Shopping'), ...many(2, 20, 'Other'),
        ],
        lastMonth: [],
        profile: { monthly_budget: 10000 },
        now: NOW,
    });
    assert.equal(ctx.topCategories.length, 5);
    assert.equal(ctx.topCategories[0].category, 'Rent');
    const amounts = ctx.topCategories.map((c) => c.amount);
    assert.deepEqual(amounts, [...amounts].sort((a, b) => b - a));
});
