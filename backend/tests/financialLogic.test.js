const test = require('node:test');
const assert = require('node:assert/strict');

const { detectSubscriptions, normalizeMerchant } = require('../lib/subscriptions');
const { computeBurnRate } = require('../lib/burnRate');
const { computePaisaScore, weekStartKey } = require('../lib/paisaScore');
const { validateTransactions, removeDuplicates } = require('../lib/statementImport');
const { classifyIntent, educationalInvestingNote, sanitizeReply } = require('../lib/coachContent');
const { roundupFor } = require('../lib/roundup');

// IST wall-clock -> UTC instant
const ist = (s) => {
    const [d, tm = '12:00'] = s.split(' ');
    const [Y, M, D] = d.split('-').map(Number);
    const [h, m] = tm.split(':').map(Number);
    return new Date(Date.UTC(Y, M - 1, D, h, m) - 5.5 * 3600 * 1000);
};
const row = (date, amount, description = 'Netflix', category = 'Entertainment') =>
    ({ occurred_at: ist(date).toISOString(), amount, description, category });

// ─── Subscriptions ──────────────────────────────────────────────────────────

test('an ongoing monthly charge is ACTIVE, not a zombie', () => {
    const r = detectSubscriptions([row('2026-06-05', 649), row('2026-07-05', 649), row('2026-08-05', 649), row('2026-09-05', 649)], ist('2026-09-13'));
    assert.equal(r.subscriptions.length, 1);
    assert.equal(r.subscriptions[0].status, 'active');
    assert.equal(r.activeCount, 1);
    assert.equal(r.activeMonthlyTotal, 649);
});

test('a charge that stopped (cancelled/expired) is LAPSED and costs nothing', () => {
    const r = detectSubscriptions([row('2026-05-02', 199, 'Spotify'), row('2026-06-02', 199, 'Spotify'), row('2026-07-02', 199, 'Spotify')], ist('2026-09-13'));
    assert.equal(r.subscriptions[0].status, 'lapsed');
    assert.equal(r.activeCount, 0);
    assert.equal(r.activeMonthlyTotal, 0);
});

test('a charge just past its due date is still active within the grace period', () => {
    const r = detectSubscriptions([row('2026-07-01', 299, 'Hotstar'), row('2026-08-01', 299, 'Hotstar')], ist('2026-09-08'));
    assert.equal(r.subscriptions[0].status, 'active');
});

test('irregular amounts, irregular gaps and single payments are not subscriptions', () => {
    const now = ist('2026-09-13');
    assert.equal(detectSubscriptions([row('2026-07-05', 100, 'Swiggy'), row('2026-08-05', 900, 'Swiggy')], now).subscriptions.length, 0);
    assert.equal(detectSubscriptions([row('2026-08-01', 649), row('2026-08-09', 649)], now).subscriptions.length, 0);
    assert.equal(detectSubscriptions([row('2026-08-05', 649)], now).subscriptions.length, 0);
});

test('generic UPI descriptions are not merged into a fake subscription', () => {
    assert.equal(normalizeMerchant('UPI Payment'), null);
    assert.equal(normalizeMerchant('Paid to Netflix India'), 'netflix india');
    const r = detectSubscriptions([
        row('2026-07-05', 500, 'UPI Payment'), row('2026-08-05', 500, 'UPI Payment'), row('2026-09-05', 500, 'UPI Payment'),
    ], ist('2026-09-13'));
    assert.equal(r.subscriptions.length, 0);
});

// ─── Burn rate ──────────────────────────────────────────────────────────────

test('the broke date is an IST calendar date, even late in the evening', () => {
    // 23:00 IST on 10 Sept is still 10 Sept in India but 17:30 UTC. Spend
    // ₹1,000/day of a ₹12,000 budget: ₹10,000 spent, ₹2,000 left = 2 more days.
    const now = ist('2026-09-10 23:00');
    const f = computeBurnRate({ expenses: [{ amount: 10000, category: 'Food' }], monthlyBudget: 12000, now });
    assert.equal(f.willGoBroke, true);
    assert.equal(f.brokeDateKey, '2026-09-12');
    assert.match(f.brokeDate, /12/);
});

test('burn rate: under budget pace is not flagged; over budget is', () => {
    const now = ist('2026-09-15');
    assert.equal(computeBurnRate({ expenses: [{ amount: 1000 }], monthlyBudget: 30000, now }).willGoBroke, false);
    const over = computeBurnRate({ expenses: [{ amount: 31000, category: 'Shopping' }], monthlyBudget: 30000, now });
    assert.equal(over.willGoBroke, true);
    assert.equal(over.brokeDate, 'Already over budget');
    assert.equal(over.cutSuggestion.category, 'Shopping');
});

// ─── Paisa score ────────────────────────────────────────────────────────────

test('paisa score has no constant or fabricated components', () => {
    const now = ist('2026-09-15');
    const empty = computePaisaScore({ expenses: [], monthlyBudget: 0, investmentTarget: 0, streakCurrent: 0, now });
    assert.equal(empty.total, 0, 'a user with no budget and no activity scores 0');
    assert.equal(empty.percentile, undefined);
    assert.equal(empty.confidence, 'low');

    const good = computePaisaScore({ expenses: [{ amount: 100, occurred_at: now.toISOString() }], monthlyBudget: 30000, investmentTarget: 1000, streakCurrent: 30, now });
    assert.equal(good.total, 850);
    const sum = Object.values(good.breakdown).reduce((a, b) => a + b, 0);
    assert.equal(sum, good.total);
});

test('paisa score pace falls as spending outpaces the budget', () => {
    const now = ist('2026-09-15');
    const base = { monthlyBudget: 30000, investmentTarget: 0, streakCurrent: 0, now };
    const onPace = computePaisaScore({ ...base, expenses: [{ amount: 15000, occurred_at: ist('2026-09-01').toISOString() }] });
    const double = computePaisaScore({ ...base, expenses: [{ amount: 30000, occurred_at: ist('2026-09-01').toISOString() }] });
    assert.equal(onPace.breakdown.pace, 350);
    assert.equal(double.breakdown.pace, 0);
});

test('weekly snapshots key on the IST Monday', () => {
    assert.equal(weekStartKey(ist('2026-09-13 10:00')), '2026-09-07'); // Sunday
    assert.equal(weekStartKey(ist('2026-09-14 00:30')), '2026-09-14'); // Monday just after midnight IST
});

// ─── Statement import ───────────────────────────────────────────────────────

test('statement rows with bad dates or amounts are skipped, not fatal', () => {
    const now = ist('2026-09-13');
    const { valid, rejected } = validateTransactions([
        { date: '2026-09-01', description: 'Swiggy', amount: 345, category: 'Food' },
        { date: 'yesterday', description: 'Bad date', amount: 10 },
        { date: '2026-02-30', description: 'Impossible date', amount: 10 },
        { date: '2026-09-02', description: 'Negative', amount: -4 },
        { date: '2030-01-01', description: 'Future', amount: 4 },
        { date: '2026-09-03', description: 'Unknown cat', amount: 99, category: 'Crypto' },
    ], now);
    assert.equal(valid.length, 2);
    assert.equal(rejected, 4);
    assert.equal(valid[1].category, 'Other');
});

test('re-importing the same statement inserts nothing', () => {
    const now = ist('2026-09-13');
    const { valid } = validateTransactions([
        { date: '2026-09-01', description: 'SWIGGY*ORDER', amount: 345 },
        { date: '2026-09-02', description: 'Uber', amount: 120 },
    ], now);
    const existing = valid.map((v) => ({ occurred_at: v.occurredAt, amount: String(v.amount), description: v.description.toLowerCase() }));
    const second = removeDuplicates(valid, existing);
    assert.equal(second.fresh.length, 0);
    assert.equal(second.duplicates, 2);
});

test('two genuine identical transactions on the same day are both kept on first import', () => {
    const now = ist('2026-09-13');
    const { valid } = validateTransactions([
        { date: '2026-09-01', description: 'Metro', amount: 40 },
        { date: '2026-09-01', description: 'Metro', amount: 40 },
    ], now);
    assert.equal(removeDuplicates(valid, []).fresh.length, 2);
});

// ─── Coach content ──────────────────────────────────────────────────────────

test('educational investing text names no products, platforms or links', () => {
    const note = educationalInvestingNote({ budget: 30000, spentThisMonth: 10000, upcomingBills: 2000 });
    for (const banned of ['UTI', 'Parag', 'Nifty 50', 'TCS', 'HDFC', 'Zerodha', 'Groww', 'Kuvera', 'INDmoney', 'http', 'ref=']) {
        assert.ok(!note.includes(banned), `must not mention ${banned}`);
    }
    assert.equal(classifyIntent('where should I invest'), 'investing');
    assert.equal(classifyIntent('why did I overspend on food'), 'spending');
});

test('sanitizeReply removes URLs and caps length', () => {
    const out = sanitizeReply(`Visit www.example.com and https://x.y/z ${'a'.repeat(5000)}`, { intent: 'general', maxChars: 100 });
    assert.ok(!/www\.|https?:/.test(out));
    assert.ok(out.length <= 101);
});

test('round-up is computed in paise without float drift', () => {
    assert.equal(roundupFor(123), 2);
    assert.equal(roundupFor(125), 0);
    assert.equal(roundupFor(0.1 + 0.2), 4.7);
    assert.equal(roundupFor(99.99), 0.01);
});
