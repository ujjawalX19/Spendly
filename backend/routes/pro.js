const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');

// ---------------------------------------------------------------------------
// @route   GET /api/pro/status
// @desc    Check if the user has an active Pro subscription
// @access  Protected
// ---------------------------------------------------------------------------
router.get('/status', protect, async (req, res) => {
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('is_pro, pro_expires_at, streak_freezes_remaining, receipt_scans_this_month, chat_messages_today, chat_messages_reset_at, expenses_today, expenses_reset_at')
            .eq('id', req.user.id)
            .single();

        if (error || !profile) {
            return res.status(500).json({ success: false, message: 'Could not load profile' });
        }

        // Check if Pro has expired
        let isPro = profile.is_pro;
        if (isPro && profile.pro_expires_at) {
            if (new Date(profile.pro_expires_at) < new Date()) {
                isPro = false;
                // Update DB
                await supabase
                    .from('profiles')
                    .update({ is_pro: false })
                    .eq('id', req.user.id);
            }
        }

        // Reset daily counters if needed
        const today = new Date().toISOString().split('T')[0];
        const updates = {};
        if (profile.chat_messages_reset_at !== today) {
            updates.chat_messages_today = 0;
            updates.chat_messages_reset_at = today;
        }
        if (profile.expenses_reset_at !== today) {
            updates.expenses_today = 0;
            updates.expenses_reset_at = today;
        }
        if (Object.keys(updates).length > 0) {
            await supabase.from('profiles').update(updates).eq('id', req.user.id);
        }

        // Reset monthly scan counter on 1st of month
        const isFirstOfMonth = new Date().getDate() === 1;
        if (isFirstOfMonth && profile.receipt_scans_this_month > 0) {
            await supabase
                .from('profiles')
                .update({ receipt_scans_this_month: 0 })
                .eq('id', req.user.id);
        }

        res.json({
            success: true,
            pro: {
                isPro,
                expiresAt: profile.pro_expires_at,
                streakFreezes: profile.streak_freezes_remaining,
            },
            limits: {
                receiptScansUsed: profile.receipt_scans_this_month,
                receiptScansLimit: isPro ? Infinity : 3,
                chatMessagesUsed: updates.chat_messages_today !== undefined ? 0 : profile.chat_messages_today,
                chatMessagesLimit: isPro ? Infinity : 10,
                expensesToday: updates.expenses_today !== undefined ? 0 : profile.expenses_today,
                expensesLimit: isPro ? Infinity : 20,
            }
        });
    } catch (error) {
        console.error('Pro Status Error:', error);
        res.status(500).json({ success: false, message: 'Failed to check Pro status' });
    }
});

// ---------------------------------------------------------------------------
// @route   POST /api/pro/activate
// @desc    Activate Pro subscription (called after purchase verification)
// @access  Protected
//
// In production, this should verify the Google Play Billing receipt
// via RevenueCat webhook or server-side validation.
// For v1 MVP, we trust the client-side purchase confirmation.
// ---------------------------------------------------------------------------
router.post('/activate', protect, async (req, res) => {
    const { productId, purchaseToken, platform } = req.body;

    // TODO: Verify purchase with RevenueCat or Google Play Developer API
    // For now, trust the purchase (RevenueCat handles validation in production)

    try {
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1); // 1 month subscription

        await supabase
            .from('profiles')
            .update({
                is_pro: true,
                pro_expires_at: expiresAt.toISOString(),
            })
            .eq('id', req.user.id);

        res.json({
            success: true,
            message: 'Pro activated! Welcome to Spendly Pro 🎉',
            expiresAt: expiresAt.toISOString(),
        });
    } catch (error) {
        console.error('Pro Activation Error:', error);
        res.status(500).json({ success: false, message: 'Failed to activate Pro' });
    }
});

// ---------------------------------------------------------------------------
// @route   POST /api/pro/add-freezes
// @desc    Add streak freezes after in-app purchase
// @access  Protected
// ---------------------------------------------------------------------------
router.post('/add-freezes', protect, async (req, res) => {
    const { count } = req.body; // 1 for single, 5 for pack

    if (!count || ![1, 5].includes(count)) {
        return res.status(400).json({ success: false, message: 'count must be 1 or 5' });
    }

    try {
        const { data: profile } = await supabase
            .from('profiles')
            .select('streak_freezes_remaining')
            .eq('id', req.user.id)
            .single();

        const current = profile?.streak_freezes_remaining || 0;

        await supabase
            .from('profiles')
            .update({ streak_freezes_remaining: current + count })
            .eq('id', req.user.id);

        res.json({
            success: true,
            message: `${count} streak freeze${count > 1 ? 's' : ''} added!`,
            freezesRemaining: current + count,
        });
    } catch (error) {
        console.error('Add Freezes Error:', error);
        res.status(500).json({ success: false, message: 'Failed to add freezes' });
    }
});

module.exports = router;
