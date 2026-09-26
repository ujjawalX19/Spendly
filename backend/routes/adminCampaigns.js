const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { supabase } = require('../config/supabase');
const { audit } = require('../lib/adminAudit');
const { validationError } = require('../lib/validation');
const { requireFlag } = require('../lib/featureFlags');
const campaigns = require('../lib/campaigns');
const { CHALLENGE_TYPES } = require('../lib/challengeRules');

/**
 * Campaign dashboard API — mounted inside routes/admin.js, so every request has
 * already passed protect + requireOwner (verified session, owner email, admin
 * role) and the admin write limiter. Mutations are refused if the audit entry
 * cannot be written.
 *
 * Sponsors never get user-level data: /report returns counts only, with small
 * counts suppressed (lib/campaigns.sponsorReport). Voucher codes are write-only
 * here: the dashboard shows how many exist, never the codes.
 */

router.use(requireFlag('campaignDashboardEnabled'));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['draft', 'scheduled', 'paused', 'ended', 'archived'];
/** Allowed status changes. "active" is derived from the dates of a scheduled campaign. */
const TRANSITIONS = {
    draft: ['scheduled', 'archived'],
    scheduled: ['paused', 'ended'],
    active: ['paused', 'ended'],
    paused: ['scheduled', 'ended'],
    ended: ['archived'],
    archived: [],
};

const paramsSchema = z.object({
    dailyTarget: z.number().int().min(50).max(100000).optional(),
    weekendBudget: z.number().int().min(100).max(1000000).optional(),
    amount: z.number().int().min(100).max(1000000).optional(),
}).strict();

const campaignSchema = z.object({
    sponsorId: z.string().regex(UUID),
    name: z.string().trim().min(3).max(120),
    challengeType: z.enum(CHALLENGE_TYPES),
    durationDays: z.number().int().min(3).max(30),
    params: paramsSchema.default({}),
    rewardLabel: z.string().trim().min(3).max(80),
    rewardValueInr: z.number().int().min(1).max(100000),
    voucherExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    eligibility: z.string().trim().min(3).max(1000),
    terms: z.string().trim().min(20).max(4000),
    targetAudience: z.enum(['all_pro']).default('all_pro'),
}).strict().superRefine((c, ctx) => {
    if (Date.parse(c.endsAt) <= Date.parse(c.startsAt)) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'End must be after start' });
    const need = { daily_target: 'dailyTarget', weekend_budget: 'weekendBudget', spend_less: 'amount' }[c.challengeType];
    if (need && c.params[need] === undefined) ctx.addIssue({ code: 'custom', path: ['params', need], message: `${need} is required for ${c.challengeType}` });
});

function toRow(c) {
    return {
        sponsor_id: c.sponsorId, name: c.name, challenge_type: c.challengeType, duration_days: c.durationDays, params: c.params,
        reward_label: c.rewardLabel, reward_value_inr: c.rewardValueInr, voucher_expiry: c.voucherExpiry || null,
        starts_at: c.startsAt, ends_at: c.endsAt, eligibility: c.eligibility, terms: c.terms, target_audience: c.targetAudience,
    };
}

const fail = (res) => res.status(503).json({ success: false, code: 'DB_UNAVAILABLE', message: 'Campaign data is unavailable.' });
const idOk = (req, res, next) => (UUID.test(req.params.id) ? next() : res.status(400).json({ success: false, message: 'Invalid id' }));

async function loadCampaign(id) {
    const { data, error } = await supabase.from('campaigns').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
}

// ─── Sponsors ───────────────────────────────────────────────────────────────

router.get('/sponsors', async (req, res) => {
    const { data, error } = await supabase.from('sponsors').select('id, name, website, created_at').order('name');
    if (error) return fail(res);
    res.json({ success: true, sponsors: data || [] });
});

const sponsorSchema = z.object({ name: z.string().trim().min(2).max(80), website: z.string().url().startsWith('https://').max(200).nullable().optional() }).strict();
router.post('/sponsors', async (req, res) => {
    const parsed = sponsorSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    if (!(await audit(req, 'sponsor_created', { details: { name: parsed.data.name }, required: true }))) return fail(res);
    const { data, error } = await supabase.from('sponsors').insert({ name: parsed.data.name, website: parsed.data.website || null }).select('id, name, website').single();
    if (error?.code === '23505') return res.status(409).json({ success: false, message: 'A sponsor with that name exists.' });
    if (error) return fail(res);
    res.status(201).json({ success: true, sponsor: data });
});

// ─── Campaigns ──────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
        if (error) return fail(res);
        const now = new Date();
        const list = [];
        for (const c of data || []) list.push({ ...c, effective_status: campaigns.effectiveStatus(c, now), metrics: await campaigns.metrics(c.id) });
        res.json({ success: true, campaigns: list });
    } catch {
        fail(res);
    }
});

router.post('/', async (req, res) => {
    const parsed = campaignSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    if (!(await audit(req, 'campaign_created', { details: { name: parsed.data.name, type: parsed.data.challengeType, reward: parsed.data.rewardValueInr }, required: true }))) return fail(res);
    const { data, error } = await supabase.from('campaigns').insert({ ...toRow(parsed.data), status: 'draft', created_by: req.user.id }).select('*').single();
    if (error) return fail(res);
    res.status(201).json({ success: true, campaign: data });
});

router.get('/:id', idOk, async (req, res) => {
    try {
        const c = await loadCampaign(req.params.id);
        if (!c) return res.status(404).json({ success: false, message: 'Campaign not found' });
        const m = await campaigns.metrics(c.id);
        res.json({ success: true, campaign: { ...c, effective_status: campaigns.effectiveStatus(c) }, metrics: m, sponsorReport: campaigns.sponsorReport(m) });
    } catch {
        fail(res);
    }
});

// Rules and rewards can change only before launch; users who join must get what they saw.
router.patch('/:id', idOk, async (req, res) => {
    const parsed = campaignSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    try {
        const c = await loadCampaign(req.params.id);
        if (!c) return res.status(404).json({ success: false, message: 'Campaign not found' });
        if (c.status !== 'draft') return res.status(409).json({ success: false, code: 'LOCKED', message: 'Only a draft campaign can be edited.' });
        if (!(await audit(req, 'campaign_updated', { details: { id: c.id }, required: true }))) return fail(res);
        const { data, error } = await supabase.from('campaigns').update({ ...toRow(parsed.data), updated_at: new Date().toISOString() }).eq('id', c.id).eq('status', 'draft').select('*').single();
        if (error) return fail(res);
        res.json({ success: true, campaign: data });
    } catch {
        fail(res);
    }
});

const statusSchema = z.object({ status: z.enum(STATUSES) }).strict();
router.post('/:id/status', idOk, async (req, res) => {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    try {
        const c = await loadCampaign(req.params.id);
        if (!c) return res.status(404).json({ success: false, message: 'Campaign not found' });
        const from = campaigns.effectiveStatus(c);
        const to = parsed.data.status;
        if (!TRANSITIONS[from].includes(to)) return res.status(409).json({ success: false, code: 'BAD_TRANSITION', message: `A ${from} campaign cannot become ${to}.` });
        if (to === 'scheduled' && from === 'draft') {
            const { count, error } = await supabase.from('campaign_vouchers').select('*', { count: 'exact', head: true }).eq('campaign_id', c.id);
            if (error || typeof count !== 'number') return fail(res);
            if (count === 0) return res.status(409).json({ success: false, code: 'NO_VOUCHERS', message: 'Upload voucher codes before publishing.' });
        }
        if (!(await audit(req, 'campaign_status_changed', { details: { id: c.id, from, to }, required: true }))) return fail(res);
        const { data, error } = await supabase.from('campaigns').update({ status: to, updated_at: new Date().toISOString() }).eq('id', c.id).eq('status', c.status).select('*');
        if (error) return fail(res);
        if (!data?.length) return res.status(409).json({ success: false, message: 'The campaign changed just now. Refresh and try again.' });
        res.json({ success: true, campaign: { ...data[0], effective_status: campaigns.effectiveStatus(data[0]) } });
    } catch {
        fail(res);
    }
});

// Voucher codes are added in bulk and never read back through the API.
const vouchersSchema = z.object({ codes: z.array(z.string().trim().min(3).max(120).regex(/^[\w-]+$/)).min(1).max(5000) }).strict();
router.post('/:id/vouchers', idOk, async (req, res) => {
    const parsed = vouchersSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    try {
        const c = await loadCampaign(req.params.id);
        if (!c) return res.status(404).json({ success: false, message: 'Campaign not found' });
        if (['ended', 'archived'].includes(campaigns.effectiveStatus(c))) return res.status(409).json({ success: false, message: 'This campaign has ended.' });
        const codes = [...new Set(parsed.data.codes)];
        if (!(await audit(req, 'campaign_vouchers_added', { details: { id: c.id, count: codes.length }, required: true }))) return fail(res);
        let added = 0;
        for (const code of codes) {
            const { error } = await supabase.from('campaign_vouchers').insert({ campaign_id: c.id, code });
            if (!error) added += 1;
            else if (error.code !== '23505') return fail(res);
        }
        res.status(201).json({ success: true, added, duplicates: codes.length - added });
    } catch {
        fail(res);
    }
});

// What may be sent to the sponsor.
router.get('/:id/report', idOk, async (req, res) => {
    try {
        const c = await loadCampaign(req.params.id);
        if (!c) return res.status(404).json({ success: false, message: 'Campaign not found' });
        res.json({ success: true, campaign: { id: c.id, name: c.name }, report: campaigns.sponsorReport(await campaigns.metrics(c.id)) });
    } catch {
        fail(res);
    }
});

module.exports = router;
