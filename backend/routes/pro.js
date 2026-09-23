const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const { protect } = require('../middleware/authMiddleware');
const appTime = require('../lib/appTime');
const { FREE_LIMITS, COUNTERS } = require('../middleware/proGate');
const { z } = require('zod');
const { hasActivePro, purchasesEnabled } = require('../lib/entitlements');
const billing = require('../lib/playBilling');
const play = require('../lib/playDeveloperApi');
const { userApiLimiter } = require('../middleware/rateLimits');
const { validationError } = require('../lib/validation');

/**
 * Pro entitlement API.
 *
 * Nothing here trusts the client. Pro is granted only by
 * POST /api/pro/verify-purchase after Google Play confirms the purchase token
 * (lib/playBilling.js), and kept in sync by Google's real-time developer
 * notifications (POST /api/pro/rtdn). The client shows a purchase button only
 * while `purchasesAvailable` is true.
 */

function usedFor(profile, feature, now) {
    const spec = COUNTERS[feature];
    const key = spec.period === 'month' ? appTime.localMonthKey(now) : appTime.localDateKey(now);
    return profile[spec.reset] === key ? Number(profile[spec.counter]) || 0 : 0;
}

// @route GET /api/pro/status — read-only; never mutates the profile
router.get('/status', protect, async (req, res) => {
    // Catch renewals, cancellations or refunds whose notification was missed.
    if (purchasesEnabled()) {
        await Promise.race([
            billing.reconcileUser(req.user.id).catch(() => {}),
            new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
    }
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

// Legacy paths from before Google Play Billing. They never grant anything.
router.post('/activate', protect, billingUnavailable);
router.post('/add-freezes', protect, billingUnavailable);

// @route GET /api/pro/billing-config — what the app needs to start a purchase
router.get('/billing-config', protect, (req, res) => {
    if (!purchasesEnabled()) return res.json({ success: true, purchasesAvailable: false });
    res.json({
        success: true,
        purchasesAvailable: true,
        productIds: billing.productIds(),
        // Passed to Google Play as obfuscatedAccountId, so a purchase is bound
        // to this account and cannot be claimed by another.
        obfuscatedAccountId: billing.accountIdFor(req.user.id),
    });
});

const verifySchema = z.object({
    purchaseToken: z.string().trim().min(10, 'purchaseToken is required').max(4096),
    productId: z.string().trim().max(100).optional(),
}).strict();

function sendBillingError(res, e) {
    if (e instanceof billing.BillingError) return res.status(e.status).json({ success: false, code: e.code, message: e.message });
    console.error('Billing error:', e?.code || e?.message || 'Error');
    return res.status(503).json({ success: false, code: 'PLAY_UNAVAILABLE', message: "We couldn't confirm your purchase just now. It is safe; please try Restore purchases shortly." });
}

// @route POST /api/pro/verify-purchase — the app hands over a Google Play purchase token
router.post('/verify-purchase', protect, userApiLimiter, async (req, res) => {
    if (!purchasesEnabled()) return billingUnavailable(req, res);
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    try {
        const result = await billing.verifyAndStore(req.user.id, parsed.data.purchaseToken);
        const { data: profile } = await supabase.from('profiles').select('is_pro, pro_expires_at').eq('id', req.user.id).maybeSingle();
        res.json({
            success: true,
            state: result.state,
            entitled: result.entitled,
            pro: { isPro: hasActivePro(profile), expiresAt: hasActivePro(profile) ? profile.pro_expires_at : null },
        });
    } catch (e) {
        sendBillingError(res, e);
    }
});

// @route POST /api/pro/rtdn — Google Play real-time developer notifications (Pub/Sub push)
// Authenticated by Google's signed OIDC token, not a user session. The body is
// only a pointer: the purchase is always re-read from Google.
router.post('/rtdn', async (req, res) => {
    try {
        await play.verifyPushToken(req.headers.authorization);
    } catch (e) {
        return res.status(e.status === 401 ? 401 : 403).json({ success: false, code: 'UNAUTHORIZED_PUSH' });
    }
    let note;
    try {
        note = JSON.parse(Buffer.from(String(req.body?.message?.data || ''), 'base64').toString('utf8'));
    } catch {
        return res.status(204).end(); // unreadable: acknowledge so Pub/Sub does not retry forever
    }
    if (note.packageName !== play.packageName()) return res.status(204).end();
    const token = note.subscriptionNotification?.purchaseToken;
    if (!token) return res.status(204).end(); // test or one-time-product notifications
    try {
        await billing.refreshByToken(token);
        return res.status(204).end();
    } catch (e) {
        // Google or the database is unavailable: ask Pub/Sub to retry.
        console.error('RTDN processing failed:', e.code || e.message);
        return res.status(503).json({ success: false });
    }
});

module.exports = router;
