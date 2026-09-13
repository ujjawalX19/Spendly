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

/**
 * Combine detection with what the user said they cancelled.
 *
 *   cancelled              — the user marked it cancelled and no charge has appeared since
 *   charged_after_cancel   — marked cancelled, but a payment came through afterwards
 *                            (usually a UPI AutoPay mandate that was never revoked)
 *
 * Costs: monthly is the detected average; annual is monthly × 12. Only
 * charges that are still happening count toward the totals.
 *
 * @param {ReturnType<typeof detectSubscriptions>} detected
 * @param {Array<{normalized_name:string, merchant:string, monthly_amount:number|string, cancelled_at:string}>} cancelledRows
 */
function applyCancellations(detected, cancelledRows) {
  const byName = new Map((cancelledRows || []).map((c) => [c.normalized_name, c]));
  const seen = new Set();

  const subscriptions = detected.subscriptions.map((s) => {
    const record = byName.get(s.normalizedName);
    seen.add(s.normalizedName);
    let status = s.status;
    if (record) {
      const chargedAfter = new Date(s.lastPayment) > new Date(record.cancelled_at);
      status = chargedAfter && s.isActive ? 'charged_after_cancel' : 'cancelled';
    }
    return {
      ...s,
      status,
      isActive: status === 'active' || status === 'charged_after_cancel',
      annualAmount: s.monthlyAmount * 12,
      cancelledAt: record?.cancelled_at || null,
    };
  });

  // Cancelled items that no longer appear in the detection window.
  for (const c of cancelledRows || []) {
    if (seen.has(c.normalized_name)) continue;
    subscriptions.push({
      merchant: c.merchant,
      normalizedName: c.normalized_name,
      monthlyAmount: Math.round(Number(c.monthly_amount) || 0),
      annualAmount: Math.round(Number(c.monthly_amount) || 0) * 12,
      totalSpent: null,
      paymentsDetected: 0,
      lastPayment: null,
      daysSinceLastPayment: null,
      avgInterval: null,
      status: 'cancelled',
      isActive: false,
      nextExpected: null,
      category: null,
      cancelledAt: c.cancelled_at,
    });
  }

  const order = { charged_after_cancel: 0, active: 1, lapsed: 2, cancelled: 3 };
  subscriptions.sort((a, b) => order[a.status] - order[b.status] || b.monthlyAmount - a.monthlyAmount);

  const active = subscriptions.filter((s) => s.isActive);
  const cancelled = subscriptions.filter((s) => s.status === 'cancelled');
  const activeMonthlyTotal = active.reduce((sum, s) => sum + s.monthlyAmount, 0);
  return {
    subscriptions,
    activeCount: active.length,
    lapsedCount: subscriptions.filter((s) => s.status === 'lapsed').length,
    cancelledCount: cancelled.length,
    activeMonthlyTotal,
    activeAnnualTotal: activeMonthlyTotal * 12,
    // What stopping the cancelled ones is worth per month, at their last price.
    cancelledMonthlySavings: cancelled.reduce((sum, s) => sum + s.monthlyAmount, 0),
  };
}

module.exports = { detectSubscriptions, applyCancellations, normalizeMerchant };
