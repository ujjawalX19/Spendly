const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const appTime = require('../lib/appTime');
const { detectSubscriptions, applyCancellations } = require('../lib/subscriptions');
const { guideFor } = require('../lib/cancellationGuides');
const { validationError } = require('../lib/validation');

/**
 * Recurring charges ("subscription intelligence").
 *
 * Detection is pattern matching over the user's own expenses (lib/subscriptions).
 * Cancellation guidance links only to a service's own account/cancellation
 * page (lib/cancellationGuides) — never signup, referral or affiliate pages.
 */

async function loadResult(userId) {
    const [{ data: expenses, error }, { data: cancelled, error: cErr }] = await Promise.all([
        supabase
            .from('expenses')
            .select('amount, description, category, occurred_at')
            .eq('user_id', userId)
            .gte('occurred_at', appTime.startOfMonthsAgo(4).toISOString())
            .order('occurred_at', { ascending: true }),
        supabase
            .from('cancelled_subscriptions')
            .select('normalized_name, merchant, monthly_amount, cancelled_at')
            .eq('user_id', userId),
    ]);
    if (error) throw error;
    // A missing cancelled_subscriptions table (migration not yet run) must not
    // take down detection.
    if (cErr) console.error('cancelled_subscriptions unavailable:', cErr.message);

    const result = applyCancellations(detectSubscriptions(expenses || [], new Date()), cErr ? [] : cancelled || []);
    result.subscriptions = result.subscriptions.map((s) => {
        const guide = guideFor(s.merchant);
        return { ...s, cancellation: { matched: guide.matched, service: guide.name, url: guide.url || null, steps: guide.steps, note: guide.note || null } };
    });
    return result;
}

// @route GET /api/subscriptions/detect
router.get('/detect', protect, async (req, res) => {
    try {
        res.json({ success: true, ...(await loadResult(req.user.id)) });
    } catch (e) {
        console.error('Subscription detection failed:', e.message);
        res.status(500).json({ success: false, message: 'Failed to check recurring charges' });
    }
});

const cancelSchema = z.object({
    normalizedName: z.string().trim().min(1).max(100),
}).strict();

// @route POST /api/subscriptions/cancelled — mark a detected charge as cancelled
router.post('/cancelled', protect, async (req, res) => {
    const parsed = cancelSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    try {
        // Name and amount come from the server's own detection, not the
        // request, so a client cannot record arbitrary "savings".
        const current = await loadResult(req.user.id);
        const sub = current.subscriptions.find((s) => s.normalizedName === parsed.data.normalizedName);
        if (!sub) return res.status(404).json({ success: false, message: 'That recurring charge was not found' });
        if (sub.status === 'cancelled') return res.json({ success: true, alreadyCancelled: true });

        const { error } = await supabase
            .from('cancelled_subscriptions')
            .upsert({
                user_id: req.user.id,
                normalized_name: sub.normalizedName,
                merchant: String(sub.merchant).slice(0, 200),
                monthly_amount: sub.monthlyAmount,
                cancelled_at: new Date().toISOString(),
            }, { onConflict: 'user_id,normalized_name' });
        if (error) throw error;

        res.status(201).json({ success: true });
    } catch (e) {
        console.error('Mark cancelled failed:', e.message);
        res.status(500).json({ success: false, message: 'Could not update that subscription' });
    }
});

// @route DELETE /api/subscriptions/cancelled/:normalizedName — undo
router.delete('/cancelled/:normalizedName', protect, async (req, res) => {
    const name = String(req.params.normalizedName || '').trim();
    if (!name || name.length > 100) return res.status(400).json({ success: false, message: 'Invalid subscription' });

    const { data, error } = await supabase
        .from('cancelled_subscriptions')
        .delete()
        .eq('user_id', req.user.id)
        .eq('normalized_name', name)
        .select('id');
    if (error) return res.status(500).json({ success: false, message: 'Could not update that subscription' });
    if (!data || data.length === 0) return res.status(404).json({ success: false, message: 'Not marked as cancelled' });
    res.json({ success: true });
});

module.exports = router;
