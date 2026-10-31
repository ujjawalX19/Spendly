/**
 * achievements — stores badges a user has earned (user_badges, once each).
 * Which badges are earned is decided from server-side facts in
 * lib/saveToEarn.earnedBadges; this only records new ones.
 */

const { supabase } = require('../config/supabase');
const { recordServerEvent } = require('./appEvents');
const s2e = require('./saveToEarn');

/**
 * @param {string} userId
 * @param {string[]} earned    badge keys the facts say are earned
 * @param {Array} existing     the user's user_badges rows ({ badge, earned_at })
 * @returns {Map<string, string>} badge -> earned_at, including new ones
 */
async function recordBadges(userId, earned, existing, now = new Date()) {
    const have = new Map((existing || []).map((b) => [b.badge, b.earned_at]));
    for (const badge of earned) {
        if (have.has(badge) || !s2e.BADGES[badge]) continue;
        const { error } = await supabase.from('user_badges').insert({ user_id: userId, badge });
        if (!error || error.code === '23505') {
            have.set(badge, now.toISOString());
            if (!error) recordServerEvent('badge_unlocked', { userId, props: { code: badge } }).catch(() => {});
        }
    }
    return have;
}

/** Every badge, locked or earned, with what it takes. */
function badgeList(have) {
    return s2e.BADGE_KEYS.map((k) => ({
        key: k,
        ...s2e.BADGES[k],
        earned: have.has(k),
        earnedAt: have.get(k) || null,
    }));
}

module.exports = { recordBadges, badgeList };
