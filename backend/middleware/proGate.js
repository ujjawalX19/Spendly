const { supabase } = require('../config/supabase');
const appTime = require('../lib/appTime');

/**
 * Free-tier allowances. Exported so the /api/pro/status endpoint reports the
 * same numbers this middleware actually enforces.
 */
const PRO_ONLY_FEATURES = new Set(['pdf_import']);

const FREE_LIMITS = {
    receipt_scan: 3,   // per calendar month
    chat_message: 10,  // per calendar day
    add_expense: 20,   // per calendar day
};


/**
 * Charge a quota only once the request has actually succeeded.
 *
 * The counter used to be incremented inside the middleware, before the
 * handler ran. A receipt scan that failed because Gemini timed out, or an
 * expense that failed validation, still consumed one of the user's three
 * monthly scans — they were billed for nothing. Deferring the write to the
 * response's `finish` event, and only for a 2xx, fixes that.
 *
 * The write is fire-and-forget: the response has already been sent, so a
 * failure here is logged rather than surfaced. Under-counting a quota is a
 * far better failure than charging for a request that errored.
 */
function chargeOnSuccess(res, userId, updates) {
    res.once('finish', () => {
        if (res.statusCode >= 400) return;
        supabase
            .from('profiles')
            .update(updates)
            .eq('id', userId)
            .then(({ error }) => {
                if (error) console.error('proGate quota charge failed:', error.message);
            });
    });
}

/**
 * proGate — Server-side rate-limiting middleware for Free vs Pro users.
 *
 * Without this, a user can bypass the frontend ProGate by calling the API
 * directly. This middleware checks the DB for quota usage and blocks requests
 * that exceed the free-tier limits.
 *
 * Usage:
 *   router.post('/scan', protect, proGate('receipt_scan'), handler);
 *   router.post('/',     protect, proGate('add_expense'),  handler);
 *
 * Must be placed AFTER `protect` (needs req.user.id).
 */
function proGate(feature) {
    return async (req, res, next) => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ success: false, message: 'Authentication required' });
            }

            const { data: profile, error } = await supabase
                .from('profiles')
                .select('is_pro, pro_expires_at, receipt_scans_this_month, receipt_scans_reset_month, chat_messages_today, chat_messages_reset_at, expenses_today, expenses_reset_at')
                .eq('id', userId)
                .single();

            if (error || !profile) {
                // Quota features fail OPEN: a database blip should not stop
                // someone logging an expense, and the worst case is a few
                // free requests.
                //
                // Pro-ONLY features fail CLOSED: the worst case there is
                // giving away the paid product, so an unverifiable request is
                // refused rather than granted.
                console.error('proGate could not read profile:', error?.message || 'no profile');
                if (PRO_ONLY_FEATURES.has(feature)) {
                    return res.status(503).json({
                        success: false,
                        message: 'We could not verify your subscription just now. Please try again in a moment.',
                        code: 'VERIFICATION_UNAVAILABLE',
                        feature,
                    });
                }
                return next();
            }

            // Check if Pro has expired
            let isPro = profile.is_pro;
            if (isPro && profile.pro_expires_at) {
                if (new Date(profile.pro_expires_at) < new Date()) {
                    isPro = false;
                }
            }

            // Pro users bypass all limits
            if (isPro) return next();

            const today = appTime.localDateKey();
            const thisMonth = appTime.localMonthKey();

            switch (feature) {
                case 'receipt_scan': {
                    // Roll the monthly counter over lazily, keyed on the month
                    // it belongs to, so it cannot get stuck across a month end.
                    let scansUsed = profile.receipt_scans_this_month || 0;
                    if (profile.receipt_scans_reset_month !== thisMonth) {
                        scansUsed = 0;
                    }

                    if (scansUsed >= FREE_LIMITS.receipt_scan) {
                        return res.status(403).json({
                            success: false,
                            message: `Free tier: ${FREE_LIMITS.receipt_scan} receipt scans/month. Upgrade to Spendly Pro for unlimited scans.`,
                            code: 'LIMIT_REACHED',
                            feature: 'receipt_scan',
                        });
                    }
                    chargeOnSuccess(res, userId, {
                        receipt_scans_this_month: scansUsed + 1,
                        receipt_scans_reset_month: thisMonth,
                    });
                    break;
                }

                case 'chat_message': {
                    let used = profile.chat_messages_today || 0;
                    // Reset daily counter if stale
                    if (profile.chat_messages_reset_at !== today) {
                        used = 0;
                        await supabase.from('profiles').update({
                            chat_messages_today: 0,
                            chat_messages_reset_at: today,
                        }).eq('id', userId);
                    }

                    if (used >= FREE_LIMITS.chat_message) {
                        return res.status(403).json({
                            success: false,
                            message: `Free tier: ${FREE_LIMITS.chat_message} AI messages/day. Upgrade to Spendly Pro for unlimited access.`,
                            code: 'LIMIT_REACHED',
                            feature: 'chat_message',
                        });
                    }
                    chargeOnSuccess(res, userId, { chat_messages_today: used + 1 });
                    break;
                }

                case 'add_expense': {
                    let used = profile.expenses_today || 0;
                    if (profile.expenses_reset_at !== today) {
                        used = 0;
                        await supabase.from('profiles').update({
                            expenses_today: 0,
                            expenses_reset_at: today,
                        }).eq('id', userId);
                    }

                    if (used >= FREE_LIMITS.add_expense) {
                        return res.status(403).json({
                            success: false,
                            message: `Free tier: ${FREE_LIMITS.add_expense} expenses/day. Upgrade to Spendly Pro for unlimited.`,
                            code: 'LIMIT_REACHED',
                            feature: 'add_expense',
                        });
                    }
                    chargeOnSuccess(res, userId, { expenses_today: used + 1 });
                    break;
                }

                case 'pdf_import': {
                    return res.status(403).json({
                        success: false,
                        message: 'Bank Statement Import is a Pro-only feature. Upgrade to unlock.',
                        code: 'PRO_ONLY',
                        feature: 'pdf_import',
                    });
                }

                default:
                    // Unknown feature — let through
                    break;
            }

            next();
        } catch (err) {
            console.error('proGate middleware error:', err);
            // Fail-open: don't block the user on middleware errors
            next();
        }
    };
}

module.exports = { proGate, FREE_LIMITS, PRO_ONLY_FEATURES };
