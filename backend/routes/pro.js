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
// @desc    Reserved for verified server-to-server purchase events
// @access  Protected
//
// Never trust a product ID or purchase token submitted directly by a client.
// Enable this route only after a verified RevenueCat webhook or Google Play
// Developer API validation is implemented server-side.
// ---------------------------------------------------------------------------
router.post('/activate', protect, async (req, res) => {
    return res.status(503).json({
        success: false,
        message: 'Purchases are not available until payment verification is configured.'
    });
});

// ---------------------------------------------------------------------------
// @route   POST /api/pro/add-freezes
// @desc    Reserved for verified server-to-server purchase events
// @access  Protected
// ---------------------------------------------------------------------------
router.post('/add-freezes', protect, async (req, res) => {
    return res.status(503).json({
        success: false,
        message: 'Purchases are not available until payment verification is configured.'
    });
});

module.exports = router;
