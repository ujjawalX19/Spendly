/**
 * Subscription & Recurring Expense Audit — detection, confidence, next debit,
 * price changes, reminders and after-debit verification. Dates are IST days.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { detectRecurring, buildAudit, remindersFor, reconcileExpectations, addMonths } = require('../lib/recurringAudit');

const ist = (s) => {
    const [d, tm = '12:00'] = s.split(' ');
    const [Y, M, D] = d.split('-').map(Number);
    const [h, m] = tm.split(':').map(Number);
    return new Date(Date.UTC(Y, M - 1, D, h, m) - 5.5 * 3600 * 1000);
};
const pay = (date, amount, description, category = 'Entertainment') => ({ id: `${description}-${date}`, amount, description, category, occurred_at: ist(date.includes(' ') ? date : `${date} 09:00`).toISOString() });
const series = (description, amount, dates, category) => dates.map((d, i) => pay(d, Array.isArray(amount) ? amount[i] : amount, description, category));
const find = (items, key) => items.find((i) => i.merchantKey === key);

test('a regular monthly subscription is detected with high confidence', () => {
    const items = detectRecurring(series('Netflix', 649, ['2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05']), ist('2026-09-20'));
    const n = find(items, 'netflix');
    assert.equal(n.frequency, 'monthly');
    assert.equal(n.confidence, 'high');
    assert.equal(n.amount, 649);
    assert.equal(n.monthlyEquivalent, 649);
    assert.equal(n.yearlyEquivalent, 7788);
    assert.deepEqual(n.lastDebit, { dateKey: '2026-09-05', amount: 649 });
    assert.deepEqual(n.nextExpected, { dateKey: '2026-10-05', amount: 649, inDays: 15 });
    assert.equal(n.status, 'active');
    assert.equal(n.history.length, 4);
    assert.match(n.guide.url, /netflix\.com/);
});

test('two payments are only "possible" or "medium"; nothing is assumed to be a subscription', () => {
    const items = detectRecurring(series('Gym Pass', 999, ['2026-08-10', '2026-09-10']), ist('2026-09-20'));
    assert.ok(['medium', 'possible'].includes(find(items, 'gym pass').confidence));
});

test('false positives: irregular shopping and wildly varying amounts are not recurring', () => {
    const groceries = series('BigBasket', [842, 2310, 450, 1760], ['2026-06-02', '2026-06-29', '2026-08-15', '2026-09-01'], 'Shopping');
    const random = series('Zomato', [320, 540, 280], ['2026-09-01', '2026-09-03', '2026-09-17'], 'Food');
    const items = detectRecurring([...groceries, ...random], ist('2026-09-20'));
    assert.equal(find(items, 'bigbasket'), undefined);
    assert.equal(find(items, 'zomato'), undefined);
});

test('generic descriptions ("UPI payment") never merge into a fake subscription', () => {
    const items = detectRecurring(series('UPI Payment', 500, ['2026-07-01', '2026-08-01', '2026-09-01']), ist('2026-09-20'));
    assert.equal(items.length, 0);
});

test('weekly, quarterly and yearly cadences are recognised', () => {
    const items = detectRecurring([
        ...series('Milk Delivery', 280, ['2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14'], 'Food'),
        ...series('Jio Recharge', 859, ['2026-03-10', '2026-06-10', '2026-09-09'], 'Recharge'),
        ...series('Amazon Prime', 1499, ['2024-10-01', '2025-10-01'], 'Entertainment'),
    ], ist('2026-09-20'));
    assert.equal(find(items, 'milk delivery').frequency, 'weekly');
    assert.equal(find(items, 'milk delivery').nextExpected.dateKey, '2026-09-21');
    assert.equal(find(items, 'jio recharge').frequency, 'quarterly');
    assert.equal(find(items, 'jio recharge').monthlyEquivalent, 286);
    const prime = find(items, 'amazon prime');
    assert.equal(prime.frequency, 'yearly');
    assert.equal(prime.nextExpected.dateKey, '2026-10-01');
    assert.equal(prime.monthlyEquivalent, 125);
});

test('next debit is a calendar month later, clamped to month ends, including leap years', () => {
    assert.equal(addMonths('2027-01-31', 1), '2027-02-28');
    assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
    assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
    assert.equal(addMonths('2026-11-30', 3), '2027-02-28');
    const items = detectRecurring(series('Spotify', 119, ['2027-11-30', '2027-12-31', '2028-01-31']), ist('2028-02-10'));
    assert.equal(find(items, 'spotify').nextExpected.dateKey, '2028-02-29');
});

test('a price increase keeps the subscription and is reported "if this continues"', () => {
    const items = detectRecurring(series('Netflix', [299, 299, 299, 499], ['2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05']), ist('2026-09-20'));
    const n = find(items, 'netflix');
    assert.ok(n, 'series with a price change must still be detected');
    assert.deepEqual({ from: n.priceChange.from, to: n.priceChange.to, perYear: n.priceChange.perYear, direction: n.priceChange.direction }, { from: 299, to: 499, perYear: 2400, direction: 'increase' });
    assert.match(n.priceChange.message, /₹2,400 more per year if this continues/);
    assert.doesNotMatch(n.priceChange.message, /scam|overcharg|fraud|rip/i);
    assert.equal(n.amount, 499);
});

test('small wobbles are not a price change', () => {
    const items = detectRecurring(series('Electricity Autopay', [1200, 1205, 1198], ['2026-07-03', '2026-08-03', '2026-09-03'], 'Other'), ist('2026-09-10'));
    assert.equal(find(items, 'electricity autopay').priceChange, null);
});

test('a payment that stops coming is "lapsed" (probably cancelled) and leaves the totals', () => {
    const a = buildAudit({ expenses: series('Hotstar', 299, ['2026-04-02', '2026-05-02', '2026-06-02']), now: ist('2026-09-20') });
    const h = find(a.items, 'hotstar');
    assert.equal(h.status, 'lapsed');
    assert.equal(h.nextExpected, null);
    assert.equal(h.counted, false);
    assert.equal(a.totals.monthly, 0);
});

test('several payments on one day count once (duplicate detection)', () => {
    const rows = [...series('Netflix', 649, ['2026-07-05', '2026-08-05', '2026-09-05']), pay('2026-09-05 21:00', 649, 'Netflix')];
    assert.equal(find(detectRecurring(rows, ist('2026-09-20')), 'netflix').paymentsDetected, 3);
});

test('timezone: 23:50 IST and 00:10 IST fall on the right calendar days', () => {
    const rows = [pay('2026-07-31 23:50', 199, 'YouTube Premium'), pay('2026-08-31 23:50', 199, 'YouTube Premium'), pay('2026-10-01 00:10', 199, 'YouTube Premium')];
    const y = find(detectRecurring(rows, ist('2026-10-05')), 'youtube premium');
    assert.equal(y.lastDebit.dateKey, '2026-10-01');
    assert.deepEqual(y.history.map((h) => h.dateKey), ['2026-10-01', '2026-08-31', '2026-07-31']);
});

test('user decisions: dismissed leaves the totals; confirmed makes a medium item remindable', () => {
    const expenses = [
        ...series('Netflix', 649, ['2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05']),
        ...series('Gym Pass', 999, ['2026-08-10', '2026-09-10'], 'Other'),
    ];
    const plain = buildAudit({ expenses, now: ist('2026-09-20') });
    assert.equal(plain.totals.monthly, 649 + 999);
    assert.equal(find(plain.items, 'gym pass').reminderEligible, false);

    const decided = buildAudit({ expenses, decisions: [{ merchant_key: 'netflix', decision: 'dismissed' }, { merchant_key: 'gym pass', decision: 'confirmed' }], now: ist('2026-09-20') });
    assert.equal(decided.totals.monthly, 999);
    assert.equal(find(decided.items, 'netflix').reminderEligible, false);
    assert.equal(find(decided.items, 'gym pass').reminderEligible, true);
});

test('"marked cancelled" leaves the totals unless a payment comes after it', () => {
    const expenses = series('Spotify', 119, ['2026-07-12', '2026-08-12', '2026-09-12']);
    const cancelled = buildAudit({ expenses, cancelled: [{ normalized_name: 'spotify', cancelled_at: ist('2026-09-13').toISOString() }], now: ist('2026-09-20') });
    assert.equal(cancelled.totals.monthly, 0);
    const chargedAgain = buildAudit({ expenses, cancelled: [{ normalized_name: 'spotify', cancelled_at: ist('2026-08-20').toISOString() }], now: ist('2026-09-20') });
    assert.equal(find(chargedAgain.items, 'spotify').chargedAfterCancel, true);
    assert.equal(chargedAgain.totals.monthly, 119);
});

test('reminders: about 24 hours before, at 10:00 IST, never promising the debit', () => {
    const a = buildAudit({ expenses: series('Netflix', 649, ['2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05']), now: ist('2026-09-20') });
    const [rem] = remindersFor(a, ist('2026-09-20'));
    assert.equal(rem.expectedDate, '2026-10-05');
    assert.equal(rem.notifyAt, ist('2026-10-04 10:00').toISOString());
    assert.equal(rem.title, '🔔 Expected tomorrow');
    assert.match(rem.body, /^Netflix — about ₹649 · Review recurring payments$/);
    assert.doesNotMatch(rem.body, /\bwill\b|definitely/i);
});

test('reminders are not scheduled for past times, far-off debits, possible items or dismissed ones', () => {
    const exp = series('Netflix', 649, ['2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05']);
    // Evening before the debit: the 10:00 reminder time has passed.
    assert.equal(remindersFor(buildAudit({ expenses: exp, now: ist('2026-10-04 18:00') }), ist('2026-10-04 18:00')).length, 0);
    const yearly = series('Amazon Prime', 1499, ['2025-03-01', '2026-03-01']);
    assert.equal(remindersFor(buildAudit({ expenses: yearly, now: ist('2026-09-20') }), ist('2026-09-20')).length, 0); // > 35 days away
    const dismissed = buildAudit({ expenses: exp, decisions: [{ merchant_key: 'netflix', decision: 'dismissed' }], now: ist('2026-09-20') });
    assert.equal(remindersFor(dismissed, ist('2026-09-20')).length, 0);
});

test('a confirmed but uncertain payment says "likely due around tomorrow"', () => {
    const a = buildAudit({ expenses: series('Gym Pass', 999, ['2026-08-10', '2026-09-10'], 'Other'), decisions: [{ merchant_key: 'gym pass', decision: 'intentional' }], now: ist('2026-09-20') });
    const [rem] = remindersFor(a, ist('2026-09-20'));
    assert.match(rem.body, /likely due around tomorrow/);
});

test('after-debit verification: matched within the window, not confirmed after it, resolved once', () => {
    const pending = [
        { merchant_key: 'netflix', expected_date: '2026-10-05', expected_amount: 649, status: 'pending' },
        { merchant_key: 'spotify', expected_date: '2026-10-12', expected_amount: 119, status: 'pending' },
        { merchant_key: 'hotstar', expected_date: '2026-09-02', expected_amount: 299, status: 'not_confirmed' },
    ];
    const expenses = [pay('2026-10-06', 649, 'Netflix'), pay('2026-10-12', 59, 'Spotify')];

    // Too early for Spotify's window to close; Netflix is matched a day late.
    const early = reconcileExpectations(pending, expenses, ist('2026-10-08'));
    assert.deepEqual(early, [{ merchant_key: 'netflix', expected_date: '2026-10-05', status: 'matched', matched_amount: 649, matched_on: '2026-10-06', matched_expense_id: 'Netflix-2026-10-06' }]);

    // Spotify's ₹59 is too far from ₹119: once the window closes it is not confirmed.
    const later = reconcileExpectations(pending, expenses, ist('2026-10-18'));
    assert.ok(later.some((c) => c.merchant_key === 'spotify' && c.status === 'not_confirmed'));
    // The already-resolved Hotstar row is never re-checked.
    assert.ok(!later.some((c) => c.merchant_key === 'hotstar'));
});

test('totals convert every cadence to a monthly and yearly figure', () => {
    const a = buildAudit({
        expenses: [
            ...series('Netflix', 649, ['2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05']),
            ...series('Milk Delivery', 280, ['2026-08-31', '2026-09-07', '2026-09-14'], 'Food'),
        ],
        now: ist('2026-09-16'),
    });
    assert.equal(a.totals.monthly, 649 + Math.round((280 * 52) / 12));
    assert.equal(a.totals.yearly, a.totals.monthly * 12);
    assert.match(a.note, /never cancels anything/);
});
