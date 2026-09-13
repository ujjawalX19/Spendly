/**
 * statementImport — validate and de-duplicate transactions extracted from a
 * bank statement before they are written.
 *
 * Previously, importing the same statement twice inserted every transaction
 * twice (doubling the month's spending), and one unparseable date from the AI
 * threw a RangeError that failed the whole import. Pure functions, no I/O.
 */

const appTime = require('./appTime');

const VALID_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Recharge', 'Entertainment', 'Rent', 'Other'];
const MAX_AMOUNT = 10_000_000;
const MAX_AGE_DAYS = 2 * 365;

/** Lowercase alphanumerics only, so "SWIGGY*ORDER 12" and "Swiggy Order 12" match. */
function normalizeDescription(desc) {
    return String(desc || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
}

/** Identity of a transaction for duplicate detection: local day + paise + payee. */
function transactionKey({ occurredAt, amount, description }) {
    const day = appTime.localDateKey(new Date(occurredAt));
    const paise = Math.round(Number(amount) * 100);
    return `${day}|${paise}|${normalizeDescription(description)}`;
}

/**
 * Turn raw AI rows into insertable, validated transactions.
 * @returns {{valid: Array<{occurredAt:string, amount:number, description:string, category:string}>, rejected:number}}
 */
function validateTransactions(rawRows, now = new Date()) {
    const valid = [];
    let rejected = 0;
    const oldest = now.getTime() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    const newest = now.getTime() + 24 * 60 * 60 * 1000;

    for (const t of Array.isArray(rawRows) ? rawRows : []) {
        const amount = Number(t?.amount);
        const dateMatch = typeof t?.date === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(t.date.trim());
        if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT || !dateMatch) {
            rejected++;
            continue;
        }
        const [, y, m, d] = dateMatch.map(Number);
        const occurred = appTime.zonedTimeToUtc(y, m, d, 12, 0, 0);
        if (Number.isNaN(occurred.getTime()) || occurred.getTime() < oldest || occurred.getTime() > newest
            || appTime.localDateKey(occurred) !== t.date.trim()) {
            rejected++;
            continue;
        }
        valid.push({
            occurredAt: occurred.toISOString(),
            amount: Number(amount.toFixed(2)),
            description: String(t.description || 'Bank transaction').trim().slice(0, 200) || 'Bank transaction',
            category: VALID_CATEGORIES.includes(t.category) ? t.category : 'Other',
        });
    }
    return { valid, rejected };
}

/**
 * Drop transactions already in `existingRows` or repeated within the import.
 * Identical same-day, same-amount, same-payee rows inside one statement are
 * kept as separate transactions only as many times as they appear there.
 *
 * @param {Array} candidates  output of validateTransactions
 * @param {Array<{occurred_at:string, amount:number|string, description:string}>} existingRows
 */
function removeDuplicates(candidates, existingRows) {
    const existingCounts = new Map();
    for (const row of existingRows || []) {
        const key = transactionKey({ occurredAt: row.occurred_at, amount: row.amount, description: row.description });
        existingCounts.set(key, (existingCounts.get(key) || 0) + 1);
    }

    const fresh = [];
    let duplicates = 0;
    for (const c of candidates) {
        const key = transactionKey(c);
        const remaining = existingCounts.get(key) || 0;
        if (remaining > 0) {
            existingCounts.set(key, remaining - 1);
            duplicates++;
        } else {
            fresh.push(c);
        }
    }
    return { fresh, duplicates };
}

module.exports = { validateTransactions, removeDuplicates, transactionKey, normalizeDescription };
