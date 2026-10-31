/**
 * points — database side of Vittova Points (v1.14).
 *
 * Points live in money_points_ledger: append-only, one row per award or
 * debit, unique on (user_id, reason, ref_key). The balance is the sum of the
 * rows, so there is no stored balance to drift or race. Inserting an award
 * that already exists fails with 23505 and counts as "already given", which
 * makes every award idempotent under retries and parallel requests. The
 * database refuses edits, deletes and any debit that would take the balance
 * below zero (supabase/v1_14_rewards.sql).
 *
 * Points are an in-app reward balance. They have no cash value and nothing
 * can be bought with them yet; the app says so wherever they are shown.
 *
 * Every function here tolerates the table not existing yet (a backend
 * deployed before the migration): awards are skipped, balances read as
 * unavailable, and nothing else fails.
 */

const { supabase } = require('../config/supabase');

/** PostgreSQL / PostgREST codes for "table or column does not exist". */
const MISSING = new Set(['42P01', 'PGRST205', '42703', 'PGRST204']);
const isMissing = (error) => !!error && MISSING.has(error.code);

/**
 * Insert one row. Returns the points recorded now, 0 if it was already
 * recorded, or null if the ledger is unavailable.
 */
async function grantPoints(userId, { reason, ref_key, points, note = null }) {
    if (!points) return 0;
    const { error } = await supabase.from('money_points_ledger').insert({ user_id: userId, reason, ref_key: String(ref_key).slice(0, 80), points, note });
    if (!error) return points;
    if (error.code === '23505') return 0;
    if (isMissing(error)) return null;
    console.error('Vittova Points: not recorded:', error.code || 'error');
    return null;
}

/** Every ledger row for a user, newest first, or null if the ledger is unavailable. */
async function loadPoints(userId) {
    const { data, error } = await supabase.from('money_points_ledger')
        .select('reason, ref_key, points, note, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
    if (isMissing(error)) return null;
    if (error) throw error;
    return data || [];
}

/** Balance and totals from ledger rows. */
function summarise(rows) {
    let earned = 0;
    let reversed = 0;
    let redeemed = 0;
    let adjusted = 0;
    for (const r of rows || []) {
        const p = Number(r.points) || 0;
        if (r.reason === 'reversal') reversed += -p;
        else if (r.reason === 'redemption') redeemed += -p;
        else if (r.reason === 'adjustment') adjusted += p;
        else earned += p;
    }
    return { balance: earned - reversed - redeemed + adjusted, earned, reversed, redeemed, adjusted };
}

module.exports = { grantPoints, loadPoints, summarise, isMissing };
