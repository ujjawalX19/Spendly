/**
 * moneyXp — database side of Money XP (the rules are in lib/moneyStreak).
 *
 * XP lives in money_xp_ledger, one row per award, unique on
 * (user_id, reason, ref_key). Inserting an award that already exists fails
 * with 23505 and is treated as "already given", so every award is idempotent
 * under retries and parallel requests. Only the service-role backend writes
 * the ledger; clients can read their own rows and nothing else.
 */

const { supabase } = require('../config/supabase');
const appTime = require('./appTime');
const { XP, EXPENSE_XP_DAILY_CAP } = require('./moneyStreak');

/**
 * Insert one award. Returns the XP granted now: `xp`, or 0 if it was already
 * granted (or could not be recorded — XP is never worth failing a request).
 */
async function grant(userId, { reason, ref_key, xp }) {
    const { error } = await supabase.from('money_xp_ledger').insert({ user_id: userId, reason, ref_key, xp });
    if (!error) return xp;
    if (error.code !== '23505') console.error('Money XP: award not recorded:', error.code || 'error');
    return 0;
}

/**
 * +5 XP for logging an expense, at most 3 times per local day by the time it
 * was logged. Slots (`YYYY-MM-DD:1..3`) are never freed, so deleting and
 * re-adding expenses cannot earn more.
 */
async function awardExpenseXp(userId, now = new Date()) {
    try {
        const today = appTime.localDateKey(now);
        const { data, error } = await supabase
            .from('money_xp_ledger')
            .select('ref_key')
            .eq('user_id', userId)
            .eq('reason', 'expense_logged')
            .ilike('ref_key', `${today}:%`);
        if (error) return 0;
        const used = new Set((data || []).map((r) => r.ref_key));
        for (let slot = 1; slot <= EXPENSE_XP_DAILY_CAP; slot++) {
            const ref_key = `${today}:${slot}`;
            if (used.has(ref_key)) continue;
            // A parallel request may take the slot first (23505): try the next.
            const got = await grant(userId, { reason: 'expense_logged', ref_key, xp: XP.expense_logged });
            if (got) return got;
        }
        return 0;
    } catch (e) {
        console.error('Money XP: expense award failed:', e.message);
        return 0;
    }
}

module.exports = { grant, awardExpenseXp };
