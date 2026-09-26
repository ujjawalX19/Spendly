const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const { userApiLimiter } = require('../middleware/rateLimits');
const { requireFlag } = require('../lib/featureFlags');
const { validationError } = require('../lib/validation');
const { audit } = require('../lib/adminAudit');
const campaigns = require('../lib/campaigns');

/**
 * Sponsor partner access (behind SPONSOR_DASHBOARD_ENABLED, default off).
 *
 *   GET  /api/partner/campaigns              campaigns of the sponsors I belong to,
 *                                            with AGGREGATED, small-count-suppressed figures
 *   POST /api/partner/campaigns/:id/status   campaign_manager only: pause or resume
 *
 * Roles live in campaign_members (added by the owner, see /api/admin/campaigns/
 * sponsors/:id/members). A member sees only their own sponsor's campaigns, and
 * only lib/campaigns.sponsorReport: counts, never a user, transaction, balance,
 * category, score or voucher code. Everything else (rules, rewards, vouchers)
 * stays with the Vittova owner.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (res) => res.status(503).json({ success: false, code: 'DB_UNAVAILABLE', message: 'Campaign data is unavailable.' });

router.use(protect, userApiLimiter, requireFlag('sponsorDashboardEnabled'));

async function memberships(userId) {
    const { data, error } = await supabase.from('campaign_members').select('sponsor_id, role').eq('user_id', userId);
    if (error) throw error;
    return data || [];
}

router.get('/campaigns', async (req, res) => {
    try {
        const mine = await memberships(req.user.id);
        if (!mine.length) return res.status(403).json({ success: false, code: 'NOT_A_PARTNER', message: 'This account has no sponsor access.' });
        const sponsorIds = mine.map((m) => m.sponsor_id);
        const [{ data: rows, error }, { data: sponsors, error: sErr }] = await Promise.all([
            supabase.from('campaigns').select('id, sponsor_id, name, status, starts_at, ends_at, reward_label, duration_days').in('sponsor_id', sponsorIds),
            supabase.from('sponsors').select('id, name').in('id', sponsorIds),
        ]);
        if (error || sErr) return fail(res);
        const names = new Map((sponsors || []).map((s) => [s.id, s.name]));
        const roles = new Map(mine.map((m) => [m.sponsor_id, m.role]));
        const out = [];
        for (const c of rows || []) {
            out.push({
                id: c.id, sponsor: names.get(c.sponsor_id) || 'Sponsor', name: c.name, reward: c.reward_label, days: c.duration_days,
                startsAt: c.starts_at, endsAt: c.ends_at, status: campaigns.effectiveStatus(c), yourRole: roles.get(c.sponsor_id),
                report: campaigns.sponsorReport(await campaigns.metrics(c.id)),
            });
        }
        res.json({ success: true, campaigns: out });
    } catch {
        fail(res);
    }
});

const statusSchema = z.object({ action: z.enum(['pause', 'resume']) }).strict();

router.post('/campaigns/:id/status', async (req, res) => {
    if (!UUID.test(String(req.params.id))) return res.status(400).json({ success: false, code: 'VALIDATION_FAILED', message: 'Invalid id' });
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    try {
        const { data: c, error } = await supabase.from('campaigns').select('id, sponsor_id, status, starts_at, ends_at').eq('id', req.params.id).maybeSingle();
        if (error) return fail(res);
        const mine = await memberships(req.user.id);
        const role = c && mine.find((m) => m.sponsor_id === c.sponsor_id)?.role;
        // Unknown campaign and another sponsor's campaign look the same.
        if (!c || !role) return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Campaign not found' });
        if (role !== 'campaign_manager') return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Only a campaign manager can pause or resume.' });
        const from = campaigns.effectiveStatus(c);
        const allowed = parsed.data.action === 'pause' ? ['scheduled', 'active'].includes(from) : from === 'paused';
        if (!allowed) return res.status(409).json({ success: false, code: 'BAD_TRANSITION', message: `A ${from} campaign cannot be ${parsed.data.action}d.` });
        const to = parsed.data.action === 'pause' ? 'paused' : 'scheduled';
        if (!(await audit(req, 'campaign_status_changed', { details: { id: c.id, from, to, by: 'partner' }, required: true }))) return fail(res);
        const { data, error: uErr } = await supabase.from('campaigns').update({ status: to, updated_at: new Date().toISOString() })
            .eq('id', c.id).eq('status', c.status).select('id, status, starts_at, ends_at');
        if (uErr) return fail(res);
        if (!data?.length) return res.status(409).json({ success: false, message: 'The campaign changed just now. Refresh and try again.' });
        res.json({ success: true, status: campaigns.effectiveStatus(data[0]) });
    } catch {
        fail(res);
    }
});

module.exports = router;
