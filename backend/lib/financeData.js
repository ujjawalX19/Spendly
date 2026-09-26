/**
 * financeData — load one user's financial rows for the calculations in
 * lib/financialInsights and lib/moneyDecisions.
 *
 * Vittova AI and the decision routes (Afford-It, Month Shape, Safe-to-Invest,
 * SIP Stress Test) read the same rows the same way, so they cannot disagree
 * about what the user has spent. The user id always comes from the verified
 * token, never from a request body.
 */

const { supabase } = require('../config/supabase');
const appTime = require('./appTime');

class ProfileMissingError extends Error {}

/**
 * @returns {Promise<{profile:object, expenses:Array, bills:Array}>}
 *          expenses cover the last four local months (history for usual pace)
 */
async function loadFinanceData(userId, now = new Date()) {
    const [{ data: profile, error: pErr }, { data: expenses, error: eErr }, { data: bills, error: bErr }] = await Promise.all([
        supabase.from('profiles').select('monthly_budget, investment_target, streak_current, total_chillar').eq('id', userId).maybeSingle(),
        supabase.from('expenses')
            .select('amount, category, description, occurred_at')
            .eq('user_id', userId)
            .gte('occurred_at', appTime.startOfMonthsAgo(4, now).toISOString())
            .order('occurred_at', { ascending: true }),
        supabase.from('recurring_bills').select('name, amount, due_day, is_active').eq('user_id', userId),
    ]);
    if (pErr || eErr || bErr) throw pErr || eErr || bErr;
    if (!profile) throw new ProfileMissingError('Profile unavailable');
    return { profile, expenses: expenses || [], bills: bills || [] };
}

module.exports = { loadFinanceData, ProfileMissingError };
