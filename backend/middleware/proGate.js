const { supabase } = require('../config/supabase');

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
                .select('is_pro, pro_expires_at, receipt_scans_this_month, chat_messages_today, chat_messages_reset_at, expenses_today, expenses_reset_at')
                .eq('id', userId)
                .single();

            if (error || !profile) {
                // If we can't verify, let the request through (fail-open)
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

            const today = new Date().toISOString().split('T')[0];

            switch (feature) {
                case 'receipt_scan': {
                    if (profile.receipt_scans_this_month >= 3) {
                        return res.status(403).json({
                            success: false,
                            message: 'Free tier: 3 receipt scans/month. Upgrade to Spendly Pro for unlimited scans.',
                            code: 'LIMIT_REACHED',
                            feature: 'receipt_scan',
                        });
                    }
                    // Increment counter
                    await supabase
                        .from('profiles')
                        .update({ receipt_scans_this_month: (profile.receipt_scans_this_month || 0) + 1 })
                        .eq('id', userId);
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

                    if (used >= 10) {
                        return res.status(403).json({
                            success: false,
                            message: 'Free tier: 10 AI messages/day. Upgrade to Spendly Pro for unlimited access.',
                            code: 'LIMIT_REACHED',
                            feature: 'chat_message',
                        });
                    }
                    // Increment counter
                    await supabase
                        .from('profiles')
                        .update({ chat_messages_today: used + 1 })
                        .eq('id', userId);
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

                    if (used >= 20) {
                        return res.status(403).json({
                            success: false,
                            message: 'Free tier: 20 expenses/day. Upgrade to Spendly Pro for unlimited.',
                            code: 'LIMIT_REACHED',
                            feature: 'add_expense',
                        });
                    }
                    await supabase
                        .from('profiles')
                        .update({ expenses_today: used + 1 })
                        .eq('id', userId);
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

module.exports = { proGate };
