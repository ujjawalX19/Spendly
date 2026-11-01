/**
 * proEntitlement — one calculation of profiles.is_pro / pro_expires_at over
 * every paid source, so no source can switch off Pro another one paid for.
 *
 *   play      play_purchases rows still entitled (lib/playBilling.js)
 *   razorpay  razorpay_payments rows paid and not refunded (lib/razorpayBilling.js)
 *   manual    an operator grant: never changed here
 *
 * Pro lasts until the latest end among the active sources; pro_source names
 * the source that reaches furthest. When nothing is active, Pro is switched
 * off only if billing set it (pro_source play or razorpay).
 */

const { supabase } = require('../config/supabase');

const BILLED_SOURCES = new Set(['play', 'razorpay']);

class EntitlementError extends Error {
    constructor() {
        super('Could not update your Pro status.');
        this.code = 'DB_UNAVAILABLE';
        this.status = 503;
    }
}

/** Pure: what the profile should become. Null = leave it alone. */
function decide(profile, { play = [], razorpay = [] }, now = new Date()) {
    if (!profile || profile.pro_source === 'manual') return null;
    const live = (t) => Number.isFinite(t) && t > now.getTime();
    const ends = [
        ...play.map((r) => ({ source: 'play', t: Date.parse(r.expires_at) })),
        ...razorpay.map((r) => ({ source: 'razorpay', t: Date.parse(r.period_end) })),
    ].filter((e) => live(e.t));
    if (ends.length) {
        const best = ends.reduce((a, b) => (b.t > a.t ? b : a));
        return { is_pro: true, pro_expires_at: new Date(best.t).toISOString(), pro_source: best.source };
    }
    if (!BILLED_SOURCES.has(profile.pro_source)) return null; // never touched by billing
    return { is_pro: false, pro_source: profile.pro_source };
}

async function recomputePro(userId, now = new Date()) {
    const [p, play, rzp] = await Promise.all([
        supabase.from('profiles').select('is_pro, pro_expires_at, pro_source').eq('id', userId).maybeSingle(),
        supabase.from('play_purchases').select('expires_at').eq('user_id', userId).eq('entitled', true),
        supabase.from('razorpay_payments').select('period_end').eq('user_id', userId).eq('status', 'paid'),
    ]);
    if (p.error || play.error) throw new EntitlementError();
    // Before migration v1_15 the razorpay table does not exist; Play keeps working.
    const update = decide(p.data, { play: play.data || [], razorpay: rzp.error ? [] : (rzp.data || []) }, now);
    if (!update) return;
    const { error } = await supabase.from('profiles').update(update).eq('id', userId);
    if (error) throw new EntitlementError();
}

module.exports = { decide, recomputePro, EntitlementError };
