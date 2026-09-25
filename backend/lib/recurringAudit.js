/**
 * recurringAudit — Subscription & Recurring Expense Audit (Vittova Pro).
 *
 * Builds on lib/subscriptions (same merchant grouping) but goes further:
 *   - weekly, monthly, quarterly and yearly cadences, not only monthly;
 *   - a price change no longer hides a subscription: the series is kept and
 *     the change is reported ("₹299 → ₹499, ₹2,400 more a year if this continues");
 *   - confidence: HIGH / MEDIUM / POSSIBLE — a regular merchant is not assumed
 *     to be a subscription, and the user confirms or dismisses each one;
 *   - the next expected debit in local (IST) calendar days, clamped to month
 *     ends (31 Jan → 28/29 Feb);
 *   - after-debit verification: an expected debit is MATCHED when a payment of
 *     about that amount appears within a few days, and NOT_CONFIRMED once the
 *     window has passed — each expectation is checked a bounded number of times.
 *
 * Only amounts, dates and a normalised merchant key are used. Expense
 * descriptions stay on Vittova's servers; nothing here is shared with anyone.
 *
 * Pure: rows and `now` in, results out.
 */

const appTime = require('./appTime');
const { normalizeMerchant } = require('./subscriptions');
const { guideFor } = require('./cancellationGuides');

const DAY_MS = 86400000;

const CADENCES = [
    { id: 'weekly', min: 6, max: 8, perYear: 52, grace: 3, label: 'Weekly' },
    { id: 'monthly', min: 25, max: 38, perYear: 12, grace: 10, label: 'Monthly' },
    { id: 'quarterly', min: 84, max: 98, perYear: 4, grace: 20, label: 'Every 3 months' },
    { id: 'yearly', min: 350, max: 380, perYear: 1, grace: 30, label: 'Yearly' },
];

/** Services people commonly subscribe to; raises confidence, never required. */
const KNOWN_SUBSCRIPTIONS = /\b(netflix|spotify|prime|amazon prime|hotstar|jiohotstar|disney|youtube|google one|google storage|icloud|apple|sonyliv|zee5|jiosaavn|gaana|wynk|audible|kindle|linkedin|canva|notion|chatgpt|openai|microsoft|office|adobe|dropbox|swiggy one|zomato gold|cult|gym|jio|airtel|vi |bsnl|act fibernet|broadband)\b/;

/** A price change counts when it is at least 5% and ₹10. */
const PRICE_CHANGE_MIN_SHARE = 0.05;
const PRICE_CHANGE_MIN_RUPEES = 10;
/** After-debit matching window and amount tolerance. */
const MATCH_DAYS_BEFORE = 3;
const MATCH_DAYS_AFTER = 5;
const MATCH_AMOUNT_TOLERANCE = 0.2;

const r = (n) => Math.round(Number(n) || 0);
const median = (xs) => {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ─── Calendar helpers (IST calendar days) ───────────────────────────────────

const keyOf = (date) => appTime.localDateKey(date);
function parts(key) {
    const [year, month, day] = key.split('-').map(Number);
    return { year, month, day };
}
function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
/** key + n months, keeping the day where possible (31 Jan + 1 → 28/29 Feb). */
function addMonths(key, n) {
    const { year, month, day } = parts(key);
    const total = (month - 1) + n;
    const y = year + Math.floor(total / 12);
    const m = ((total % 12) + 12) % 12 + 1;
    const d = Math.min(day, daysInMonth(y, m));
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function addDays(key, n) {
    const { year, month, day } = parts(key);
    return new Date(Date.UTC(year, month - 1, day + n, 12)).toISOString().slice(0, 10);
}
function daysBetween(a, b) {
    const pa = parts(a);
    const pb = parts(b);
    return Math.round((Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day)) / DAY_MS);
}
function nextAfter(key, cadence) {
    switch (cadence.id) {
        case 'weekly': return addDays(key, 7);
        case 'monthly': return addMonths(key, 1);
        case 'quarterly': return addMonths(key, 3);
        default: return addMonths(key, 12);
    }
}

// ─── Detection ──────────────────────────────────────────────────────────────

function cadenceFor(gaps) {
    const mid = median(gaps);
    return CADENCES.find((c) => mid >= c.min && mid <= c.max) || null;
}

/**
 * Split a series into price levels: consecutive payments within 5% of each
 * other belong to the same level.
 */
function priceLevels(amounts) {
    const levels = [];
    for (const a of amounts) {
        const last = levels[levels.length - 1];
        if (last && Math.abs(a - last.amount) <= Math.max(last.amount * PRICE_CHANGE_MIN_SHARE, 2)) {
            last.count += 1;
        } else {
            levels.push({ amount: a, count: 1 });
        }
    }
    return levels;
}

function confidenceFor({ count, regularShare, levels, known, amountSpread }) {
    const steadyWithOneChange = levels.length <= 2 && levels.every((l, i) => i === levels.length - 1 || l.count >= 1);
    if (count >= 3 && regularShare === 1 && steadyWithOneChange && (known || count >= 4)) return 'high';
    if (count >= 2 && regularShare >= 0.75 && (steadyWithOneChange || amountSpread <= 0.15)) return 'medium';
    if (count >= 2 && regularShare >= 0.5 && amountSpread <= 0.3) return 'possible';
    return null;
}

/**
 * @param {Array<{id?:string, amount:number|string, description?:string, category?:string, occurred_at:string}>} expenses
 * @param {Date} now
 */
function detectRecurring(expenses, now = new Date()) {
    const today = keyOf(now);
    const groups = new Map();
    for (const e of expenses || []) {
        const key = normalizeMerchant(e.description);
        if (!key || !(Number(e.amount) > 0)) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(e);
    }

    const items = [];
    for (const [merchantKey, rows] of groups) {
        if (rows.length < 2) continue;
        rows.sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
        // Several payments on one day (a split bill, a refund-and-repay) count once.
        const byDay = [];
        for (const row of rows) {
            const k = keyOf(new Date(row.occurred_at));
            const last = byDay[byDay.length - 1];
            if (last && last.dateKey === k) continue;
            byDay.push({ dateKey: k, amount: Number(row.amount), id: row.id || null, category: row.category || 'Other', description: row.description });
        }
        if (byDay.length < 2) continue;

        const gaps = byDay.slice(1).map((p, i) => daysBetween(byDay[i].dateKey, p.dateKey));
        const cadence = cadenceFor(gaps);
        if (!cadence) continue;
        const regularShare = gaps.filter((g) => g >= cadence.min && g <= cadence.max).length / gaps.length;

        const amounts = byDay.map((p) => p.amount);
        const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
        const amountSpread = avg > 0 ? (Math.max(...amounts) - Math.min(...amounts)) / avg : 1;
        const levels = priceLevels(amounts);
        const known = KNOWN_SUBSCRIPTIONS.test(` ${merchantKey} `);
        const confidence = confidenceFor({ count: byDay.length, regularShare, levels, known, amountSpread });
        if (!confidence) continue;

        const last = byDay[byDay.length - 1];
        const previous = byDay[byDay.length - 2];
        const latestAmount = last.amount;
        const change = latestAmount - previous.amount;
        const priceChange = Math.abs(change) >= PRICE_CHANGE_MIN_RUPEES && Math.abs(change) / previous.amount >= PRICE_CHANGE_MIN_SHARE
            ? {
                from: r(previous.amount),
                to: r(latestAmount),
                direction: change > 0 ? 'increase' : 'decrease',
                perYear: r(Math.abs(change) * cadence.perYear),
                message: change > 0
                    ? `Increased from ₹${r(previous.amount).toLocaleString('en-IN')} to ₹${r(latestAmount).toLocaleString('en-IN')}. That's ₹${r(change * cadence.perYear).toLocaleString('en-IN')} more per year if this continues.`
                    : `Decreased from ₹${r(previous.amount).toLocaleString('en-IN')} to ₹${r(latestAmount).toLocaleString('en-IN')}.`,
            }
            : null;

        const nextExpected = nextAfter(last.dateKey, cadence);
        const overdueBy = daysBetween(nextExpected, today);
        const status = overdueBy > cadence.grace ? 'lapsed' : 'active';

        items.push({
            merchantKey,
            merchant: last.description,
            category: last.category,
            frequency: cadence.id,
            frequencyLabel: cadence.label,
            amount: r(latestAmount),
            monthlyEquivalent: r((latestAmount * cadence.perYear) / 12),
            yearlyEquivalent: r(latestAmount * cadence.perYear),
            lastDebit: { dateKey: last.dateKey, amount: r(last.amount) },
            nextExpected: status === 'active' ? { dateKey: nextExpected, amount: r(latestAmount), inDays: daysBetween(today, nextExpected) } : null,
            priceChange,
            confidence,
            status,
            paymentsDetected: byDay.length,
            history: byDay.map((p) => ({ dateKey: p.dateKey, amount: r(p.amount) })).reverse(),
            guide: guideFor(merchantKey) || null,
        });
    }
    const rank = { high: 0, medium: 1, possible: 2 };
    items.sort((a, b) => (a.status !== b.status ? (a.status === 'active' ? -1 : 1) : rank[a.confidence] - rank[b.confidence] || b.monthlyEquivalent - a.monthlyEquivalent));
    return items;
}

// ─── Audit (detection + the user's decisions) ──────────────────────────────

const DECISIONS = ['confirmed', 'dismissed', 'intentional', 'unwanted'];

/**
 * @param {object} args
 * @param {Array} args.expenses
 * @param {Array<{merchant_key:string, decision:string}>} args.decisions
 * @param {Array<{normalized_name:string, cancelled_at:string}>} [args.cancelled]  existing "marked cancelled" rows
 * @param {Date} args.now
 */
function buildAudit({ expenses, decisions = [], cancelled = [], now = new Date() }) {
    const byKey = new Map(decisions.map((d) => [d.merchant_key, d.decision]));
    const cancelledKeys = new Map(cancelled.map((c) => [c.normalized_name, c.cancelled_at]));

    const items = detectRecurring(expenses, now).map((item) => {
        const decision = byKey.get(item.merchantKey) || null;
        const cancelledAt = cancelledKeys.get(item.merchantKey) || null;
        const chargedAfterCancel = cancelledAt && item.lastDebit.dateKey > keyOf(new Date(cancelledAt));
        const counted = item.status === 'active' && decision !== 'dismissed' && (!cancelledAt || chargedAfterCancel);
        return {
            ...item,
            decision,
            cancelledAt,
            chargedAfterCancel: Boolean(chargedAfterCancel),
            counted,
            // Reminders only for payments the user confirmed, or that we are sure about.
            reminderEligible: counted && item.nextExpected !== null && (decision === 'confirmed' || decision === 'intentional' || decision === 'unwanted' || item.confidence === 'high'),
        };
    });

    const counted = items.filter((i) => i.counted);
    const monthlyTotal = counted.reduce((s, i) => s + i.monthlyEquivalent, 0);
    return {
        items,
        totals: {
            monthly: r(monthlyTotal),
            yearly: r(monthlyTotal * 12),
            count: counted.length,
            unwantedMonthly: r(counted.filter((i) => i.decision === 'unwanted').reduce((s, i) => s + i.monthlyEquivalent, 0)),
            priceIncreasesPerYear: r(counted.filter((i) => i.priceChange?.direction === 'increase').reduce((s, i) => s + i.priceChange.perYear, 0)),
        },
        note: 'Detected from your own payment records. Not every regular payment is a subscription: confirm or dismiss each one. Vittova never cancels anything for you.',
    };
}

// ─── Reminders ──────────────────────────────────────────────────────────────

/** Default reminder time when only the date is known: 10:00 IST the day before. */
const REMINDER_HOUR = 10;
const REMINDER_HORIZON_DAYS = 35;

/**
 * Reminders the device should schedule: about 24 hours before each expected
 * debit within the horizon. Wording never promises the debit will happen.
 */
function remindersFor(audit, now = new Date()) {
    const today = keyOf(now);
    const out = [];
    for (const item of audit.items) {
        if (!item.reminderEligible) continue;
        const due = item.nextExpected.dateKey;
        const dueIn = daysBetween(today, due);
        if (dueIn < 1 || dueIn > REMINDER_HORIZON_DAYS) continue;
        const day = parts(addDays(due, -1));
        const notifyAt = appTime.zonedTimeToUtc(day.year, day.month, day.day, REMINDER_HOUR, 0, 0);
        if (notifyAt <= now) continue;
        const certain = item.confidence === 'high' || item.decision === 'confirmed';
        out.push({
            id: `${item.merchantKey}|${due}`,
            merchantKey: item.merchantKey,
            expectedDate: due,
            expectedAmount: item.amount,
            notifyAt: notifyAt.toISOString(),
            // Scannable in the notification shade: what, how much, what to do.
            title: certain ? '🔔 Expected tomorrow' : '🔔 Possibly due tomorrow',
            body: certain
                ? `${item.merchant} — about ₹${item.amount.toLocaleString('en-IN')} · Review recurring payments`
                : `${item.merchant} — about ₹${item.amount.toLocaleString('en-IN')}, likely due around tomorrow · Review recurring payments`,
        });
    }
    return out.sort((a, b) => a.notifyAt.localeCompare(b.notifyAt));
}

// ─── After-debit verification ──────────────────────────────────────────────

/**
 * Update stored expectations from the latest payments. Bounded: an
 * expectation is resolved once — MATCHED when a payment of about the expected
 * amount appears within [date − 3, date + 5] days, NOT_CONFIRMED when that
 * window has passed without one. Nothing is re-checked after it resolves.
 *
 * @param {Array<{merchant_key, expected_date, expected_amount, status}>} expectations
 * @param {Array} expenses
 * @returns {Array<{merchant_key, expected_date, status, matched_amount?, matched_on?}>} changes to store
 */
function reconcileExpectations(expectations, expenses, now = new Date()) {
    const today = keyOf(now);
    const byKey = new Map();
    for (const e of expenses || []) {
        const key = normalizeMerchant(e.description);
        if (!key) continue;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push({ dateKey: keyOf(new Date(e.occurred_at)), amount: Number(e.amount), id: e.id || null });
    }
    const changes = [];
    for (const x of expectations || []) {
        if (x.status !== 'pending') continue;
        const expected = String(x.expected_date).slice(0, 10);
        const expectedAmount = Number(x.expected_amount);
        const from = addDays(expected, -MATCH_DAYS_BEFORE);
        const to = addDays(expected, MATCH_DAYS_AFTER);
        const match = (byKey.get(x.merchant_key) || []).find((p) => p.dateKey >= from && p.dateKey <= to
            && Math.abs(p.amount - expectedAmount) <= expectedAmount * MATCH_AMOUNT_TOLERANCE);
        if (match) {
            changes.push({ merchant_key: x.merchant_key, expected_date: expected, status: 'matched', matched_amount: r(match.amount), matched_on: match.dateKey, matched_expense_id: match.id });
        } else if (today > to) {
            changes.push({ merchant_key: x.merchant_key, expected_date: expected, status: 'not_confirmed' });
        }
    }
    return changes;
}

module.exports = {
    detectRecurring,
    buildAudit,
    remindersFor,
    reconcileExpectations,
    addMonths,
    addDays,
    DECISIONS,
    CADENCES,
    MATCH_DAYS_AFTER,
};
