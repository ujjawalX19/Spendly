/**
 * subscriptions — find recurring monthly charges in a user's expenses.
 *
 * WHAT WAS WRONG
 * The old detector flagged a subscription as a "zombie" (money wasted) when its
 * last payment was more than 30 days ago — which is exactly a subscription the
 * user had *stopped* paying. It also grouped on the first two words of the
 * description, so every "UPI Payment" or "Paid to …" row merged into one fake
 * subscription.
 *
 * WHAT IT DOES NOW
 * Only payment data is available, so the app can say whether a recurring
 * charge is still happening — not whether the user still uses the service.
 *   active  — the next charge is not yet overdue (last payment within the
 *             usual interval plus a grace period)
 *   lapsed  — the expected charge has not appeared; most likely cancelled
 *             or expired
 * Active charges are what a user should review; lapsed ones cost nothing.
 *
 * Pure: rows and `now` in, result out.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_INTERVAL_DAYS = 25;
const MAX_INTERVAL_DAYS = 38;
const AMOUNT_TOLERANCE = 0.15;
const GRACE_DAYS = 10;

// Wording that describes *how* money moved, not *who* it went to.
const GENERIC_PREFIXES = [
    /^upi\s+payment\s*(to)?\s*/,
    /^payment\s+(to|for)\s+/,
    /^paid\s+to\s+/,
    /^sent\s+to\s+/,
    /^receipt\s+from\s+/,
    /^upi\s+/,
    /^pos\s+/,
];
const GENERIC_NAMES = new Set(['', 'unknown', 'upi', 'upi payment', 'bank transaction', 'payment', 'transfer', 'other']);

function normalizeMerchant(desc) {
    if (!desc) return null;
    let s = String(desc)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    for (const prefix of GENERIC_PREFIXES) s = s.replace(prefix, '');
    s = s.split(' ').slice(0, 2).join(' ').trim();
    return GENERIC_NAMES.has(s) ? null : s;
}

/**
 * @param {Array<{amount:number|string, description?:string, category?:string, occurred_at:string}>} expenses
 * @param {Date} [now]
 */
function detectSubscriptions(expenses, now = new Date()) {
    const groups = new Map();
    for (const exp of expenses || []) {
        const key = normalizeMerchant(exp.description);
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(exp);
    }

    const subscriptions = [];
    for (const [merchant, rows] of groups) {
        if (rows.length < 2) continue;
        rows.sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));

        const amounts = rows.map((r) => Number(r.amount));
        const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length;
        if (!(avgAmount > 0)) continue;

        let consistent = true;
        const intervals = [];
        for (let i = 1; i < rows.length; i++) {
            const gap = (new Date(rows[i].occurred_at) - new Date(rows[i - 1].occurred_at)) / DAY_MS;
            intervals.push(gap);
            // Each gap must be monthly, and each amount close to the average.
            if (gap < MIN_INTERVAL_DAYS || gap > MAX_INTERVAL_DAYS) consistent = false;
            if (Math.abs(amounts[i] - avgAmount) / avgAmount > AMOUNT_TOLERANCE) consistent = false;
        }
        if (Math.abs(amounts[0] - avgAmount) / avgAmount > AMOUNT_TOLERANCE) consistent = false;
        if (!consistent) continue;

        const avgInterval = intervals.reduce((s, g) => s + g, 0) / intervals.length;
        const last = new Date(rows[rows.length - 1].occurred_at);
        const daysSinceLastPayment = Math.floor((now - last) / DAY_MS);
        const isActive = daysSinceLastPayment <= avgInterval + GRACE_DAYS;

        subscriptions.push({
            merchant: rows[rows.length - 1].description,
            normalizedName: merchant,
            monthlyAmount: Math.round(avgAmount),
            totalSpent: Math.round(amounts.reduce((s, a) => s + a, 0)),
            paymentsDetected: rows.length,
            lastPayment: last.toISOString(),
            daysSinceLastPayment,
            avgInterval: Math.round(avgInterval),
            status: isActive ? 'active' : 'lapsed',
            isActive,
            nextExpected: isActive ? new Date(last.getTime() + Math.round(avgInterval) * DAY_MS).toISOString() : null,
            category: rows[0].category || 'Other',
        });
    }

    subscriptions.sort((a, b) => (a.isActive !== b.isActive ? (a.isActive ? -1 : 1) : b.monthlyAmount - a.monthlyAmount));

    const active = subscriptions.filter((s) => s.isActive);
    return {
        subscriptions,
        activeCount: active.length,
        lapsedCount: subscriptions.length - active.length,
        activeMonthlyTotal: active.reduce((s, x) => s + x.monthlyAmount, 0),
    };
}

module.exports = { detectSubscriptions, normalizeMerchant };
