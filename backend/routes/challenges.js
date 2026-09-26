const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { protect } = require('../middleware/authMiddleware');
const { proGate } = require('../middleware/proGate');
const { userApiLimiter } = require('../middleware/rateLimits');
const { requireFlag } = require('../lib/featureFlags');
const { validationError } = require('../lib/validation');
const campaigns = require('../lib/campaigns');

/**
 * Sponsored Save-to-Earn Challenges (Vittova Pro, behind a feature flag).
 *
 *   GET  /api/challenges                       open challenges + my progress
 *   POST /api/challenges/:id/join              join (no fee; the reward is fixed)
 *   POST /api/challenges/:id/leave             withdraw from an active challenge
 *   POST /api/challenges/:id/seen              anonymous impression/view count
 *   POST /api/challenges/rewards/:enrollmentId/reveal   my voucher code
 *
 * Nothing here accepts a completion, reward or amount from the client: the
 * server judges completion from the user's own records (lib/challengeRules)
 * and never shares them with the sponsor (lib/campaigns).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const gates = [protect, userApiLimiter, requireFlag('sponsoredChallengesEnabled'), proGate('sponsored_challenges')];

function send(res, e) {
    if (e instanceof campaigns.CampaignError) return res.status(e.status).json({ success: false, code: e.code, message: e.message });
    console.error('Challenges error:', e?.code || e?.message || 'Error');
    return res.status(503).json({ success: false, code: 'DB_UNAVAILABLE', message: 'Challenges are unavailable right now.' });
}

function idParam(name) {
    return (req, res, next) => (UUID.test(String(req.params[name] || '')) ? next() : res.status(400).json({ success: false, code: 'VALIDATION_FAILED', message: 'Invalid id' }));
}

router.get('/', ...gates, async (req, res) => {
    try {
        res.json({ success: true, challenges: await campaigns.listForUser(req.user.id) });
    } catch (e) {
        send(res, e);
    }
});

const noBody = z.object({}).strict();

router.post('/:id/join', ...gates, idParam('id'), async (req, res) => {
    if (!noBody.safeParse(req.body || {}).success) return validationError(res, noBody.safeParse(req.body).error);
    try {
        const window = await campaigns.join(req.user.id, req.params.id);
        res.status(201).json({ success: true, ...window });
    } catch (e) {
        send(res, e);
    }
});

router.post('/:id/leave', ...gates, idParam('id'), async (req, res) => {
    try {
        await campaigns.leave(req.user.id, req.params.id);
        res.json({ success: true });
    } catch (e) {
        send(res, e);
    }
});

const seenSchema = z.object({ kind: z.enum(['impression', 'view']) }).strict();
router.post('/:id/seen', ...gates, idParam('id'), async (req, res) => {
    const parsed = seenSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    try {
        await campaigns.recordSeen(req.params.id, parsed.data.kind);
    } catch {
        // Metrics are best effort.
    }
    res.status(204).end();
});

router.post('/rewards/:enrollmentId/reveal', ...gates, idParam('enrollmentId'), async (req, res) => {
    try {
        res.json({ success: true, reward: await campaigns.revealReward(req.user.id, req.params.enrollmentId) });
    } catch (e) {
        send(res, e);
    }
});

module.exports = router;
