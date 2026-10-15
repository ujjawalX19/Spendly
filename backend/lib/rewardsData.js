/**
 * rewardsData — reads a user's v1.14 rewards rows in one go: mission
 * preference, assigned daily missions, check-ins, savings goals and
 * contributions, and the Points ledger.
 *
 * Returns { ready: false } instead of failing when the rewards tables do not
 * exist yet (backend deployed before supabase/v1_14_rewards.sql) or the
 * feature is switched off (REWARDS_ENABLED=false). Callers then behave as
 * before v1.14: the fixed mission rotation and no Points.
 */

const { supabase } = require('../config/supabase');
const { flag } = require('./featureFlags');
const { isMissing } = require('./points');
const ms = require('./moneyStreak');

const day = (v) => String(v).slice(0, 10);

/**
 * @param {string} userId
 * @param {object} [opts]
 * @param {string} [opts.today]       'YYYY-MM-DD'; missions and check-ins are read from 35 days before it
 * @param {boolean} [opts.allMissions] read every assigned mission (history views)
 */
async function loadRewards(userId, { today, allMissions = false } = {}) {
    if (!flag('rewardsEnabled')) return { ready: false, reason: 'disabled' };
    const since = today ? ms.addDays(today, -35) : '1970-01-01';
    let missionsQuery = supabase.from('money_daily_missions')
        .select('day, mission, difficulty, params, reason, source, replacements, previous, assigned_at')
        .eq('user_id', userId);
    if (!allMissions) missionsQuery = missionsQuery.gte('day', since);

    const results = await Promise.all([
        supabase.from('profiles').select('mission_difficulty').eq('id', userId).maybeSingle(),
        missionsQuery,
        supabase.from('money_mission_checkins').select('day, mission, event_id, created_at').eq('user_id', userId).gte('day', since),
        supabase.from('savings_goals').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
        supabase.from('savings_contributions').select('id, goal_id, amount_inr, source, contributed_on, note, client_ref, created_at').eq('user_id', userId),
        supabase.from('money_points_ledger').select('reason, ref_key, points, note, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
    ]);
    if (results.some((r) => isMissing(r.error))) return { ready: false, reason: 'not_migrated' };
    for (const r of results) if (r.error) throw r.error;
    const [prefRes, missionsRes, checkinsRes, goalsRes, contribRes, pointsRes] = results;

    const assignments = new Map((missionsRes.data || []).map((r) => [day(r.day), {
        ...r,
        day: day(r.day),
        params: r.params && typeof r.params === 'object' ? r.params : {},
        replacements: Number(r.replacements) || 0,
        previous: Array.isArray(r.previous) ? r.previous : [],
    }]));

    return {
        ready: true,
        preference: prefRes.data?.mission_difficulty || 'auto',
        assignments,
        checkins: (checkinsRes.data || []).map((c) => ({ ...c, day: day(c.day) })),
        goals: goalsRes.data || [],
        contributions: contribRes.data || [],
        points: pointsRes.data || [],
    };
}

module.exports = { loadRewards };
