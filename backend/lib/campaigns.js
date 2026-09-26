/**
 * campaigns — Sponsored Save-to-Earn Challenges: campaign state, enrolment,
 * judging, fixed voucher rewards and campaign-level metrics.
 *
 * BRAND DATA FIREWALL
 *   Vittova financial data → challengeRules (inside Vittova) → completed yes/no
 *   → a voucher from the sponsor's own code list + a random redemption id.
 * A sponsor never receives transactions, balances, UPI history, categories,
 * notification text, scores or Safe-to-Spend. Metrics are counts only, and
 * sponsor-facing reports hide counts under 5 (sponsorReport).
 *
 * SECURITY
 *   Every write here runs with the service role behind an authenticated route.
 *   Users can only join, see their own progress and reveal their own voucher;
 *   completion and rewards are decided by the server, once:
 *     - enrolment unique per (user, campaign);
 *     - an enrolment moves out of 'active' with compare-and-set, so parallel
 *       requests cannot complete it twice;
 *     - challenge_completions and reward_issuances are keyed by enrolment and
 *       protected against updates by database triggers (v1_10);
 *     - a voucher is claimed with compare-and-set on issued_at IS NULL.
 * Rewards are fixed and disclosed up front: no chance, no entry fee.
 */

const crypto = require('node:crypto');
const { supabase } = require('../config/supabase');
const appTime = require('./appTime');
const rules = require('./challengeRules');

const LIVE = new Set(['scheduled', 'active']);
const SMALL_COUNT = 5;

class CampaignError extends Error {
    constructor(code, status, message) {
        super(message);
        this.code = code;
        this.status = status;
    }
}

/** DRAFT, SCHEDULED, ACTIVE, PAUSED, ENDED or ARCHIVED right now. */
function effectiveStatus(c, now = new Date()) {
    if (!LIVE.has(c.status)) return c.status;
    if (now < new Date(c.starts_at)) return 'scheduled';
    if (now >= new Date(c.ends_at)) return 'ended';
    return 'active';
}

async function must(query, code = 'DB_UNAVAILABLE') {
    const { data, error, count } = await query;
    if (error) throw new CampaignError(code, 503, 'Challenges are unavailable right now.');
    return count !== undefined && count !== null && data === null ? count : data;
}

async function countOf(table, filters) {
    let q = supabase.from(table).select('*', { count: 'exact', head: true });
    for (const [col, val] of Object.entries(filters)) q = val === null ? q.is(col, null) : val === 'not-null' ? q.not(col, 'is', null) : q.eq(col, val);
    const { count, error } = await q;
    // PostgREST answers a HEAD count on a missing table with 204, no error and
    // count null: that is "unknown", never zero.
    if (error || typeof count !== 'number') throw new CampaignError('DB_UNAVAILABLE', 503, 'Challenges are unavailable right now.');
    return count;
}

const vouchersLeft = (campaignId) => countOf('campaign_vouchers', { campaign_id: campaignId, issued_at: null });

/** What a user sees for one campaign: always labelled as sponsored. */
function presentCampaign(c, sponsor, left, now) {
    const { title, rule } = rules.describe(c.challenge_type, c.params || {}, c.duration_days);
    return {
        id: c.id,
        sponsored: true,
        sponsor: sponsor?.name || 'Sponsor',
        disclosure: `Sponsored by ${sponsor?.name || 'a sponsor'}`,
        title: c.name || title,
        challengeType: c.challenge_type,
        rule,
        days: c.duration_days,
        reward: { label: c.reward_label, valueInr: c.reward_value_inr, voucherExpiry: c.voucher_expiry, fixed: true },
        availability: { remaining: left, limited: true, soldOut: left <= 0 },
        startsAt: c.starts_at,
        endsAt: c.ends_at,
        eligibility: c.eligibility,
        terms: c.terms,
        status: effectiveStatus(c, now),
        notice: 'Sponsored challenge. Vittova does not recommend the sponsor\'s products. The sponsor never sees your spending; it only learns that a reward was issued.',
    };
}

async function loadSponsors(ids) {
    if (!ids.length) return new Map();
    const rows = await must(supabase.from('sponsors').select('id, name').in('id', ids));
    return new Map((rows || []).map((s) => [s.id, s]));
}

// ─── Judging ────────────────────────────────────────────────────────────────

async function issueVoucher(enrollment, now) {
    for (let attempt = 0; attempt < 5; attempt++) {
        const free = await must(supabase.from('campaign_vouchers').select('id').eq('campaign_id', enrollment.campaign_id).is('issued_at', null).limit(1));
        if (!free || !free.length) return null; // sold out
        const { data: claimed, error } = await supabase.from('campaign_vouchers')
            .update({ issued_at: now.toISOString(), issued_to: enrollment.id })
            .eq('id', free[0].id).is('issued_at', null).select('id');
        if (error) throw new CampaignError('DB_UNAVAILABLE', 503, 'Challenges are unavailable right now.');
        if (claimed && claimed.length === 1) {
            const { error: insErr } = await supabase.from('reward_issuances').insert({ enrollment_id: enrollment.id, campaign_id: enrollment.campaign_id, voucher_id: claimed[0].id, redemption_id: crypto.randomUUID(), issued_at: now.toISOString() });
            if (insErr && insErr.code !== '23505') throw new CampaignError('DB_UNAVAILABLE', 503, 'Challenges are unavailable right now.');
            return claimed[0].id;
        }
    }
    return null;
}

/** Judge one active enrolment and persist the outcome once. */
async function judge(enrollment, campaign, { expenses, noSpendDays, now }) {
    const result = rules.evaluate({
        type: campaign.challenge_type, params: campaign.params || {}, days: campaign.duration_days,
        enrolledAt: enrollment.enrolled_at, expenses, noSpendDays, now,
    });
    if (enrollment.status !== 'active' || (result.status !== 'failed' && result.status !== 'completed')) return result;

    const { data: moved, error } = await supabase.from('challenge_enrollments')
        .update({ status: result.status, failure_reason: result.reason || null, judged_at: now.toISOString() })
        .eq('id', enrollment.id).eq('status', 'active').select('id');
    if (error) throw new CampaignError('DB_UNAVAILABLE', 503, 'Challenges are unavailable right now.');
    if (!moved || moved.length !== 1) return result; // another request judged it first
    enrollment.status = result.status;
    if (result.status === 'completed') {
        const { error: cErr } = await supabase.from('challenge_completions').insert({ enrollment_id: enrollment.id, campaign_id: enrollment.campaign_id, completed_at: now.toISOString() });
        if (cErr && cErr.code !== '23505') throw new CampaignError('DB_UNAVAILABLE', 503, 'Challenges are unavailable right now.');
        await issueVoucher(enrollment, now);
    }
    return result;
}

// ─── User API ───────────────────────────────────────────────────────────────

async function userData(userId, now) {
    const [expenses, noSpend] = await Promise.all([
        must(supabase.from('expenses').select('amount, category, description, occurred_at').eq('user_id', userId)
            .gte('occurred_at', appTime.startOfMonthsAgo(3, now).toISOString())),
        must(supabase.from('streak_activities').select('activity_date').eq('user_id', userId).eq('activity', 'no_spend_day')),
    ]);
    return { expenses: expenses || [], noSpendDays: new Set((noSpend || []).map((r) => String(r.activity_date).slice(0, 10))) };
}

/** Live campaigns plus the user's own enrolments and rewards. */
async function listForUser(userId, now = new Date()) {
    const [campaigns, enrollments] = await Promise.all([
        must(supabase.from('campaigns').select('*').in('status', ['scheduled', 'active'])),
        must(supabase.from('challenge_enrollments').select('*').eq('user_id', userId)),
    ]);
    const mine = enrollments || [];
    const visible = (campaigns || []).filter((c) => effectiveStatus(c, now) === 'active' || mine.some((e) => e.campaign_id === c.id));
    const sponsors = await loadSponsors([...new Set(visible.map((c) => c.sponsor_id))]);
    const data = mine.some((e) => e.status === 'active') ? await userData(userId, now) : { expenses: [], noSpendDays: new Set() };

    const out = [];
    for (const c of visible) {
        const enrollment = mine.find((e) => e.campaign_id === c.id) || null;
        const item = presentCampaign(c, sponsors.get(c.sponsor_id), await vouchersLeft(c.id), now);
        if (enrollment) {
            const progress = await judge(enrollment, c, { ...data, now });
            const issuance = enrollment.status === 'completed'
                ? (await must(supabase.from('reward_issuances').select('enrollment_id, revealed_at, issued_at').eq('enrollment_id', enrollment.id)))?.[0] || null
                : null;
            item.enrollment = {
                id: enrollment.id,
                status: enrollment.status,
                reason: enrollment.failure_reason || progress.reason || null,
                startsOn: progress.startsOn,
                endsOn: progress.endsOn,
                judgeOn: progress.judgeOn,
                day: progress.day,
                activeDays: progress.activeDays,
                activeNeeded: progress.activeNeeded,
                reward: enrollment.status === 'completed' ? (issuance ? { issued: true, revealed: Boolean(issuance.revealed_at) } : { issued: false, soldOut: true }) : null,
            };
        }
        out.push(item);
    }
    return out;
}

async function join(userId, campaignId, now = new Date()) {
    const rows = await must(supabase.from('campaigns').select('*').eq('id', campaignId));
    const c = rows?.[0];
    if (!c || effectiveStatus(c, now) !== 'active') throw new CampaignError('NOT_AVAILABLE', 404, 'This challenge is not open right now.');
    const { endsOn } = rules.windowFor(now.toISOString(), c.duration_days);
    if (endsOn > appTime.localDateKey(new Date(c.ends_at))) throw new CampaignError('TOO_LATE', 409, 'There is not enough time left in this campaign to finish the challenge.');
    if ((await vouchersLeft(c.id)) <= 0) throw new CampaignError('SOLD_OUT', 409, 'All rewards for this challenge have been given out.');
    if (c.challenge_type === 'spend_less') {
        const { expenses } = await userData(userId, now);
        const ok = rules.eligibility(c.challenge_type, c.params || {}, { expenses, now, days: c.duration_days });
        if (!ok.eligible) throw new CampaignError('NOT_ELIGIBLE', 409, ok.reason);
    }
    const w = rules.windowFor(now.toISOString(), c.duration_days);
    const { error } = await supabase.from('challenge_enrollments').insert({
        campaign_id: c.id, user_id: userId, enrolled_at: now.toISOString(), starts_on: w.startsOn, ends_on: w.endsOn, status: 'active',
    });
    if (error?.code === '23505') throw new CampaignError('ALREADY_JOINED', 409, 'You have already joined this challenge.');
    if (error) throw new CampaignError('DB_UNAVAILABLE', 503, 'Challenges are unavailable right now.');
    return w;
}

async function leave(userId, campaignId) {
    const { data } = await supabase.from('challenge_enrollments').update({ status: 'withdrawn' })
        .eq('user_id', userId).eq('campaign_id', campaignId).eq('status', 'active').select('id');
    if (!data || !data.length) throw new CampaignError('NOT_JOINED', 404, 'You are not in this challenge.');
}

/** The user's own voucher, revealed on request. */
async function revealReward(userId, enrollmentId, now = new Date()) {
    const enr = (await must(supabase.from('challenge_enrollments').select('id, user_id, campaign_id, status').eq('id', enrollmentId)))?.[0];
    if (!enr || enr.user_id !== userId) throw new CampaignError('NOT_FOUND', 404, 'Reward not found.');
    const issuance = (await must(supabase.from('reward_issuances').select('*').eq('enrollment_id', enrollmentId)))?.[0];
    if (!issuance) throw new CampaignError('NOT_FOUND', 404, 'Reward not found.');
    const [voucher] = await must(supabase.from('campaign_vouchers').select('code').eq('id', issuance.voucher_id));
    const [campaign] = await must(supabase.from('campaigns').select('reward_label, voucher_expiry, terms, sponsor_id').eq('id', enr.campaign_id));
    if (!issuance.revealed_at) {
        await supabase.from('reward_issuances').update({ revealed_at: now.toISOString() }).eq('enrollment_id', enrollmentId).is('revealed_at', null);
    }
    const sponsor = (await loadSponsors([campaign.sponsor_id])).get(campaign.sponsor_id);
    const expired = campaign.voucher_expiry && campaign.voucher_expiry < appTime.localDateKey(now);
    return {
        code: voucher.code,
        redemptionId: issuance.redemption_id,
        reward: campaign.reward_label,
        sponsor: sponsor?.name || null,
        voucherExpiry: campaign.voucher_expiry,
        expired: Boolean(expired),
        terms: campaign.terms,
    };
}

async function recordSeen(campaignId, kind) {
    await supabase.from('campaign_impressions').insert({ campaign_id: campaignId, kind });
}

// ─── Admin / sponsor metrics ────────────────────────────────────────────────

async function metrics(campaignId) {
    const [impressions, views, enrollments, active, completed, failed, issued, redeemed, vouchers, remaining] = await Promise.all([
        countOf('campaign_impressions', { campaign_id: campaignId, kind: 'impression' }),
        countOf('campaign_impressions', { campaign_id: campaignId, kind: 'view' }),
        countOf('challenge_enrollments', { campaign_id: campaignId }),
        countOf('challenge_enrollments', { campaign_id: campaignId, status: 'active' }),
        countOf('challenge_completions', { campaign_id: campaignId }),
        countOf('challenge_enrollments', { campaign_id: campaignId, status: 'failed' }),
        countOf('reward_issuances', { campaign_id: campaignId }),
        countOf('reward_issuances', { campaign_id: campaignId, revealed_at: 'not-null' }),
        countOf('campaign_vouchers', { campaign_id: campaignId }),
        vouchersLeft(campaignId),
    ]);
    const judged = completed + failed;
    return {
        impressions, views, enrollments, activeParticipants: active, completed, failed,
        completionRate: judged ? Math.round((completed / judged) * 100) : null,
        rewardsIssued: issued, rewardsRedeemed: redeemed, voucherInventory: vouchers, remainingInventory: remaining,
    };
}

/** What may be shared with a sponsor: counts only, small counts suppressed. */
function sponsorReport(m) {
    const soft = (n) => (n > 0 && n < SMALL_COUNT ? `<${SMALL_COUNT}` : n);
    return {
        impressions: soft(m.impressions), views: soft(m.views), enrollments: soft(m.enrollments),
        completed: soft(m.completed), completionRate: m.completed < SMALL_COUNT ? null : m.completionRate,
        rewardsIssued: soft(m.rewardsIssued), rewardsRedeemed: soft(m.rewardsRedeemed), remainingInventory: m.remainingInventory,
        note: 'Aggregate campaign figures only. No user identities, transactions, balances, categories or scores are shared.',
    };
}

module.exports = { effectiveStatus, listForUser, join, leave, revealReward, recordSeen, metrics, sponsorReport, presentCampaign, CampaignError, judge };
