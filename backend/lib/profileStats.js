/**
 * profileStats — server-owned updates to a user's round-up savings ("chillar")
 * and streak.
 *
 * These columns are never writable by the client (see
 * supabase/v1_2_security_p0.sql). The backend changes them only as a side
 * effect of a validated action — logging an expense, importing a statement —
 * and does so with compare-and-set so two simultaneous expenses cannot lose one
 * another's round-up.
 */

const { supabase } = require('../config/supabase');
const { advanceStreak } = require('./streak');
const { roundupFor } = require('./roundup');

const MAX_ATTEMPTS = 4;

const toMoney = (n) => Number((Number(n) || 0).toFixed(2));

function matchValue(query, column, value) {
    return value === null || value === undefined ? query.is(column, null) : query.eq(column, value);
}

/**
 * Add round-up savings and, optionally, advance the streak — atomically.
 *
 * @param {string} userId
 * @param {{chillar?: number, advance?: boolean, now?: Date}} change
 * @returns {Promise<{total_chillar:number, streak_current:number, streak_longest:number}|null>}
 */
async function applyProfileStats(userId, { chillar = 0, advance = true, now = new Date() } = {}) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('total_chillar, streak_current, streak_longest, streak_last_log')
            .eq('id', userId)
            .maybeSingle();

        if (error || !profile) {
            console.error('profileStats: could not read profile');
            return null;
        }

        const updates = {
            total_chillar: toMoney(Number(profile.total_chillar || 0) + Number(chillar || 0)),
        };
        if (advance) {
            const streak = advanceStreak(profile, now);
            updates.streak_current = streak.streak_current;
            updates.streak_longest = streak.streak_longest;
            updates.streak_last_log = streak.streak_last_log;
        }

        let query = supabase.from('profiles').update(updates).eq('id', userId);
        query = matchValue(query, 'total_chillar', profile.total_chillar);
        query = matchValue(query, 'streak_last_log', profile.streak_last_log);

        const { data: rows, error: updateError } = await query.select('total_chillar, streak_current, streak_longest');
        if (updateError) {
            console.error('profileStats: update failed');
            return null;
        }
        if (rows && rows.length === 1) return rows[0];
    }
    console.error('profileStats: gave up after repeated contention');
    return null;
}

module.exports = { applyProfileStats, roundupFor };
