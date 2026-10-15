const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const { userApiLimiter } = require('../middleware/rateLimits');
const { requireFlag } = require('../lib/featureFlags');
const { validationError } = require('../lib/validation');
const appTime = require('../lib/appTime');
const ms = require('../lib/moneyStreak');
const goals = require('../lib/goals');
const s2e = require('../lib/saveToEarn');
const { grant } = require('../lib/moneyXp');
const { grantPoints, isMissing } = require('../lib/points');
const { recordBadges } = require('../lib/achievements');

/**
 * Savings goals (v1.14). Behind REWARDS_ENABLED (default on).
 *
 *   GET    /api/goals                                   every goal with progress and milestones
 *   POST   /api/goals                                   create { name, kind, targetInr, targetDate, note?, planMonthlyInr? }
 *   PATCH  /api/goals/:id                               edit the same fields
 *   POST   /api/goals/:id/archive | /restore            put a goal away / bring it back
 *   POST   /api/goals/:id/contributions                 { amountInr, clientRef, contributedOn?, note? }
 *   DELETE /api/goals/:id/contributions/:contributionId correct a mistake
 *
 * Progress is only what the user says they put aside (self-reported; Vittova
 * cannot see bank balances). Milestone XP and Points are worked out here from
 * those rows, once per goal and milestone (lib/goals.js); the client never
 * sends a reward, a percentage or a status.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const gates = [protect, userApiLimiter, requireFlag('rewardsEnabled')];

const unavailable = (res) => res.status(503).json({ success: false, code: 'GOALS_UNAVAILABLE', message: "We couldn't load your goals just now. Nothing was lost. Try again in a moment." });
const notFound = (res) => res.status(404).json({ success: false, code: 'GOAL_NOT_FOUND', message: 'That goal was not found.' });

/** All of a user's goals and contributions, plus the reward ledger rows for goals. */
async function loadGoals(userId) {
    const [goalsRes, contribRes, xpRes, pointsRes, badgesRes] = await Promise.all([
        supabase.from('savings_goals').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
        supabase.from('savings_contributions').select('*').eq('user_id', userId),
        supabase.from('money_xp_ledger').select('ref_key').eq('user_id', userId).eq('reason', 'goal_milestone'),
        supabase.from('money_points_ledger').select('reason, ref_key').eq('user_id', userId).in('reason', ['goal_milestone', 'reversal']),
        supabase.from('user_badges').select('badge, earned_at').eq('user_id', userId),
    ]);
    const all = [goalsRes, contribRes, xpRes, pointsRes, badgesRes];
    if (all.some((r) => isMissing(r.error))) return { missing: true };
    for (const r of all) if (r.error) throw r.error;
    const points = pointsRes.data || [];
    return {
        goals: goalsRes.data || [],
        contributions: contribRes.data || [],
        xpRefs: new Set((xpRes.data || []).map((r) => r.ref_key)),
        pointRefs: new Set(points.filter((r) => r.reason === 'goal_milestone').map((r) => r.ref_key)),
        reversedRefs: new Set(points.filter((r) => r.reason === 'reversal').map((r) => r.ref_key)),
        badges: badgesRes.data || [],
    };
}

/**
 * Pay any milestone a goal has reached and not been paid for, complete a goal
 * that reached its target, and record goal badges. Idempotent.
 */
async function settle(userId, state, now) {
    const paid = [];
    for (const goal of state.goals) {
        const saved = goals.saved(goal.id, state.contributions);
        for (const m of goals.milestonesDue(goal, saved, state.goals, now)) {
            if (state.reversedRefs.has(`goal_milestone:${m.ref_key}`)) continue; // a corrected milestone is not paid again
            if (!state.xpRefs.has(m.ref_key)) {
                const xp = await grant(userId, { reason: 'goal_milestone', ref_key: m.ref_key, xp: m.xp });
                state.xpRefs.add(m.ref_key);
                if (xp) paid.push({ goalId: goal.id, pct: m.pct, xp });
            }
            if (!state.pointRefs.has(m.ref_key)) {
                const pts = await grantPoints(userId, { reason: 'goal_milestone', ref_key: m.ref_key, points: m.points });
                state.pointRefs.add(m.ref_key);
                if (pts) {
                    const p = paid.find((x) => x.goalId === goal.id && x.pct === m.pct);
                    if (p) p.points = pts; else paid.push({ goalId: goal.id, pct: m.pct, points: pts });
                }
            }
        }
        if (goal.status === 'active' && saved >= Number(goal.target_inr)) {
            const { data } = await supabase.from('savings_goals')
                .update({ status: 'completed', completed_at: now.toISOString(), updated_at: now.toISOString() })
                .eq('id', goal.id).eq('user_id', userId).eq('status', 'active').select('*');
            if (data && data[0]) Object.assign(goal, data[0]);
        }
    }
    const started = state.goals.filter((g) => state.contributions.some((c) => c.goal_id === g.id)).length;
    const reached = state.goals.filter((g) => g.status === 'completed' || g.completed_at).length;
    await recordBadges(userId, s2e.earnedBadges({ goalsStarted: started, goalsReached: reached }), state.badges, now);
    return paid;
}

function presentAll(state, now) {
    const opts = { allGoals: state.goals, xpRefs: state.xpRefs, reversedRefs: state.reversedRefs, now };
    const list = state.goals.map((g) => goals.present(g, state.contributions, opts));
    const order = { active: 0, completed: 1, archived: 2 };
    return list.sort((a, b) => order[a.status] - order[b.status] || String(b.createdAt).localeCompare(String(a.createdAt)));
}

function respond(res, state, now, extra = {}, status = 200) {
    const list = presentAll(state, now);
    res.status(status).json({
        success: true,
        ...extra,
        goals: list.filter((g) => g.status !== 'archived'),
        archived: list.filter((g) => g.status === 'archived'),
        kinds: goals.KIND_KEYS.map((k) => ({ key: k, label: goals.KINDS[k] })),
        limits: { maxActive: goals.MAX_ACTIVE_GOALS, minRewardTarget: goals.MIN_REWARD_TARGET, rewardedGoalsPerMonth: goals.REWARDED_GOALS_PER_MONTH },
        rewards: goals.MILESTONE_REWARD,
        note: 'Progress is what you record as put aside. Vittova can\'t see your bank balance, and spending less is not counted as saving.',
    });
}

router.get('/', ...gates, async (req, res) => {
    const now = new Date();
    try {
        const state = await loadGoals(req.user.id);
        if (state.missing) return unavailable(res);
        await settle(req.user.id, state, now);
        respond(res, state, now);
    } catch (e) {
        console.error('Goals: load failed:', e?.code || e?.name || 'Error');
        unavailable(res);
    }
});

// ─── Create and edit ────────────────────────────────────────────────────────

const name = z.string().trim().min(1, 'Give the goal a name').max(60);
const fields = {
    name,
    kind: z.enum(goals.KIND_KEYS).optional(),
    targetInr: z.number().int().min(100, 'A goal needs a target of at least ₹100').max(100_000_000),
    targetDate: z.string().regex(DAY_KEY, 'Use a date like 2027-03-31'),
    note: z.string().trim().max(200).nullable().optional(),
    planMonthlyInr: z.number().int().min(0).max(100_000_000).nullable().optional(),
};
const createSchema = z.object(fields).strict();
const editSchema = z.object({
    name: fields.name.optional(),
    kind: fields.kind,
    targetInr: fields.targetInr.optional(),
    targetDate: fields.targetDate.optional(),
    note: fields.note,
    planMonthlyInr: fields.planMonthlyInr,
}).strict();

function checkDate(targetDate, now) {
    const today = appTime.localDateKey(now);
    if (targetDate <= today) return 'Pick a date after today.';
    if (targetDate > ms.addDays(today, 365 * goals.MAX_YEARS_AHEAD)) return `Pick a date within ${goals.MAX_YEARS_AHEAD} years.`;
    return null;
}
const badDate = (res, message) => res.status(400).json({ success: false, code: 'BAD_TARGET_DATE', message });

router.post('/', ...gates, async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const now = new Date();
    const d = parsed.data;
    const dateProblem = checkDate(d.targetDate, now);
    if (dateProblem) return badDate(res, dateProblem);
    try {
        const state = await loadGoals(req.user.id);
        if (state.missing) return unavailable(res);
        if (state.goals.filter((g) => g.status === 'active').length >= goals.MAX_ACTIVE_GOALS) {
            return res.status(409).json({ success: false, code: 'GOAL_LIMIT', message: `You can have up to ${goals.MAX_ACTIVE_GOALS} active goals. Archive one to add another.` });
        }
        const { data, error } = await supabase.from('savings_goals').insert({
            user_id: req.user.id,
            name: d.name,
            kind: d.kind || 'custom',
            target_inr: d.targetInr,
            reward_target_inr: d.targetInr,
            target_date: d.targetDate,
            note: d.note || null,
            plan_monthly_inr: d.planMonthlyInr ?? null,
            status: 'active',
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
        }).select('*').single();
        if (error) throw error;
        state.goals.push(data);
        const paid = await settle(req.user.id, state, now);
        respond(res, state, now, { goalId: data.id, rewardsPaid: paid }, 201);
    } catch (e) {
        console.error('Goals: create failed:', e?.code || e?.name || 'Error');
        unavailable(res);
    }
});

/** One of the user's own goals, or null. */
function own(state, id) {
    return UUID.test(id) ? state.goals.find((g) => g.id === id) || null : null;
}

router.patch('/:id', ...gates, async (req, res) => {
    const parsed = editSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const now = new Date();
    const d = parsed.data;
    if (d.targetDate) {
        const dateProblem = checkDate(d.targetDate, now);
        if (dateProblem) return badDate(res, dateProblem);
    }
    try {
        const state = await loadGoals(req.user.id);
        if (state.missing) return unavailable(res);
        const goal = own(state, req.params.id);
        if (!goal) return notFound(res);
        if (goal.status === 'archived') return res.status(409).json({ success: false, code: 'GOAL_ARCHIVED', message: 'Restore this goal before editing it.' });

        const patch = { updated_at: now.toISOString() };
        if (d.name !== undefined) patch.name = d.name;
        if (d.kind !== undefined) patch.kind = d.kind;
        if (d.note !== undefined) patch.note = d.note || null;
        if (d.planMonthlyInr !== undefined) patch.plan_monthly_inr = d.planMonthlyInr;
        if (d.targetDate !== undefined) patch.target_date = d.targetDate;
        if (d.targetInr !== undefined) {
            patch.target_inr = d.targetInr;
            // Milestone rewards are measured against the highest target the goal has had.
            patch.reward_target_inr = Math.max(goals.rewardTarget(goal), d.targetInr);
            const saved = goals.saved(goal.id, state.contributions);
            if (goal.status === 'completed' && saved < d.targetInr) Object.assign(patch, { status: 'active', completed_at: null });
        }
        const { data, error } = await supabase.from('savings_goals').update(patch).eq('id', goal.id).eq('user_id', req.user.id).select('*');
        if (error) throw error;
        if (data && data[0]) Object.assign(goal, data[0]);
        const paid = await settle(req.user.id, state, now);
        respond(res, state, now, { goalId: goal.id, rewardsPaid: paid });
    } catch (e) {
        console.error('Goals: edit failed:', e?.code || e?.name || 'Error');
        unavailable(res);
    }
});

async function setArchived(req, res, archived) {
    const now = new Date();
    try {
        const state = await loadGoals(req.user.id);
        if (state.missing) return unavailable(res);
        const goal = own(state, req.params.id);
        if (!goal) return notFound(res);
        if (archived && goal.status === 'archived') return respond(res, state, now, { goalId: goal.id });
        if (!archived && goal.status !== 'archived') return respond(res, state, now, { goalId: goal.id });
        if (!archived && state.goals.filter((g) => g.status === 'active').length >= goals.MAX_ACTIVE_GOALS) {
            return res.status(409).json({ success: false, code: 'GOAL_LIMIT', message: `You can have up to ${goals.MAX_ACTIVE_GOALS} active goals. Archive one first.` });
        }
        const saved = goals.saved(goal.id, state.contributions);
        const patch = archived
            ? { status: 'archived', archived_at: now.toISOString(), updated_at: now.toISOString() }
            : { status: goal.completed_at && saved >= Number(goal.target_inr) ? 'completed' : 'active', archived_at: null, updated_at: now.toISOString() };
        const { data, error } = await supabase.from('savings_goals').update(patch).eq('id', goal.id).eq('user_id', req.user.id).select('*');
        if (error) throw error;
        if (data && data[0]) Object.assign(goal, data[0]);
        if (!archived) await settle(req.user.id, state, now);
        respond(res, state, now, { goalId: goal.id });
    } catch (e) {
        console.error('Goals: archive failed:', e?.code || e?.name || 'Error');
        unavailable(res);
    }
}
router.post('/:id/archive', ...gates, (req, res) => setArchived(req, res, true));
router.post('/:id/restore', ...gates, (req, res) => setArchived(req, res, false));

// ─── Contributions ──────────────────────────────────────────────────────────

const contributionSchema = z.object({
    amountInr: z.number().int().min(1, 'Enter an amount').max(10_000_000),
    clientRef: z.string().uuid(),
    contributedOn: z.string().regex(DAY_KEY).optional(),
    note: z.string().trim().max(120).nullable().optional(),
}).strict();

router.post('/:id/contributions', ...gates, async (req, res) => {
    const parsed = contributionSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const now = new Date();
    const today = appTime.localDateKey(now);
    const d = parsed.data;
    const on = d.contributedOn || today;
    if (on > today || on < ms.addDays(today, -90)) {
        return res.status(400).json({ success: false, code: 'BAD_DATE', message: 'Use a date from the last 90 days.' });
    }
    try {
        const state = await loadGoals(req.user.id);
        if (state.missing) return unavailable(res);
        const goal = own(state, req.params.id);
        if (!goal) return notFound(res);

        // The same tap sent twice (a retry, or the offline queue) is stored once.
        const already = state.contributions.find((c) => c.client_ref === d.clientRef);
        if (already) {
            if (already.goal_id !== goal.id) return res.status(409).json({ success: false, code: 'DUPLICATE_REFERENCE', message: 'That entry was already saved to another goal.' });
            return respond(res, state, now, { goalId: goal.id, contributionId: already.id, duplicate: true, rewardsPaid: [] });
        }
        if (goal.status === 'archived') return res.status(409).json({ success: false, code: 'GOAL_ARCHIVED', message: 'Restore this goal before adding to it.' });

        const { data, error } = await supabase.from('savings_contributions').insert({
            goal_id: goal.id,
            user_id: req.user.id,
            amount_inr: d.amountInr,
            source: 'self_reported',
            contributed_on: on,
            note: d.note || null,
            client_ref: d.clientRef,
            created_at: now.toISOString(),
        }).select('*').single();
        if (error && error.code === '23505') {
            const fresh = await loadGoals(req.user.id);
            const row = fresh.contributions?.find((c) => c.client_ref === d.clientRef);
            return respond(res, fresh, now, { goalId: goal.id, contributionId: row?.id || null, duplicate: true, rewardsPaid: [] });
        }
        if (error) throw error;
        state.contributions.push(data);
        const paid = await settle(req.user.id, state, now);
        respond(res, state, now, { goalId: goal.id, contributionId: data.id, duplicate: false, rewardsPaid: paid }, 201);
    } catch (e) {
        console.error('Goals: contribution failed:', e?.code || e?.name || 'Error');
        unavailable(res);
    }
});

router.delete('/:id/contributions/:contributionId', ...gates, async (req, res) => {
    const now = new Date();
    try {
        const state = await loadGoals(req.user.id);
        if (state.missing) return unavailable(res);
        const goal = own(state, req.params.id);
        if (!goal) return notFound(res);
        const row = UUID.test(req.params.contributionId)
            ? state.contributions.find((c) => c.id === req.params.contributionId && c.goal_id === goal.id)
            : null;
        if (!row) return res.status(404).json({ success: false, code: 'CONTRIBUTION_NOT_FOUND', message: 'That entry was not found.' });

        const { error } = await supabase.from('savings_contributions').delete().eq('id', row.id).eq('user_id', req.user.id);
        if (error) throw error;
        state.contributions = state.contributions.filter((c) => c.id !== row.id);

        // Points for a milestone the goal no longer reaches are reversed (once).
        // The milestone is not paid again if it is reached later.
        const saved = goals.saved(goal.id, state.contributions);
        const paidPcts = goals.MILESTONES.filter((pct) => state.pointRefs.has(goals.refKey(goal.id, pct)));
        const reversed = [];
        for (const pct of goals.milestonesToReverse(goal, saved, paidPcts)) {
            const ref = `goal_milestone:${goals.refKey(goal.id, pct)}`;
            if (state.reversedRefs.has(ref)) continue;
            const got = await grantPoints(req.user.id, { reason: 'reversal', ref_key: ref, points: -goals.MILESTONE_REWARD[pct].points, note: 'A goal contribution was removed' });
            if (got) reversed.push({ pct, points: got });
            state.reversedRefs.add(ref);
        }
        if (goal.status === 'completed' && saved < Number(goal.target_inr)) {
            const { data } = await supabase.from('savings_goals').update({ status: 'active', completed_at: null, updated_at: now.toISOString() })
                .eq('id', goal.id).eq('user_id', req.user.id).select('*');
            if (data && data[0]) Object.assign(goal, data[0]);
        }
        respond(res, state, now, { goalId: goal.id, reversed });
    } catch (e) {
        console.error('Goals: contribution delete failed:', e?.code || e?.name || 'Error');
        unavailable(res);
    }
});

module.exports = router;
