const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const appTime = require('../lib/appTime');
const { FREE_LIMITS, COUNTERS } = require('../middleware/proGate');
const { hasActivePro, purchasesEnabled } = require('../lib/entitlements');

/**
 * Pro entitlement read API.
 *
 * Nothing here can grant Pro. Entitlement is written only by the server after a
 * verified purchase (not yet implemented — see BILLING_ARCHITECTURE.md). The
 * client displays `purchasesAvailable` and never shows a purchase button while
 * it is false.
 */

function usedFor(profile, feature, now) {
    const spec = COUNTERS[feature];
    const key = spec.period === 'month' ? appTime.localMonthKey(now) : appTime.localDateKey(now);
    return profile[spec.reset] === key ? Number(profile[spec.counter]) || 0 : 0;
}

// @route GET /api/pro/status — read-only; never mutates the profile
router.get('/status', protect, async (req, res) => {
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('is_pro, pro_expires_at, streak_freezes_remaining, receipt_scans_this_month, receipt_scans_reset_month, chat_messages_today, chat_messages_reset_at, expenses_today, expenses_reset_at, money_checks_today, money_checks_reset_at')
        .eq('id', req.user.id)
        .maybeSingle();

    if (error) {
        return res.status(500).json({ success: false, message: 'Could not load profile' });
    }
    if (!profile) {
        // Not a server fault: the app creates the row (POST /api/auth/profile).
        return res.status(404).json({ success: false, code: 'PROFILE_NOT_FOUND', message: 'Profile not found' });
    }

    const now = new Date();
    const isPro = hasActivePro(profile, now);

    res.json({
        success: true,
        purchasesAvailable: purchasesEnabled(),
        pro: {
            isPro,
            expiresAt: isPro ? profile.pro_expires_at : null,
            streakFreezes: profile.streak_freezes_remaining,
        },
        // `null` limit means unlimited.
        limits: {
            receiptScansUsed: usedFor(profile, 'receipt_scan', now),
            receiptScansLimit: isPro ? null : FREE_LIMITS.receipt_scan,
            chatMessagesUsed: usedFor(profile, 'chat_message', now),
            chatMessagesLimit: isPro ? null : FREE_LIMITS.chat_message,
            expensesToday: usedFor(profile, 'add_expense', now),
            expensesLimit: isPro ? null : FREE_LIMITS.add_expense,
            moneyChecksUsed: usedFor(profile, 'money_check', now),
            moneyChecksLimit: isPro ? null : FREE_LIMITS.money_check,
        },
    });
});

const billingUnavailable = (req, res) => res.status(501).json({
    success: false,
    code: 'BILLING_NOT_AVAILABLE',
    message: 'Vittova Pro is not available for purchase yet.',
});

// Reserved for a future server-verified Google Play purchase flow. They never
// accept a client-supplied product id or token as proof of payment.
router.post('/activate', protect, billingUnavailable);
router.post('/add-freezes', protect, billingUnavailable);

module.exports = router;
