const { supabase } = require('../config/supabase');
const appTime = require('../lib/appTime');
const { hasActivePro } = require('../lib/entitlements');

/**
 * proGate — server-side free-tier quotas and Pro-only features.
 *
 * The client UI is never the authority: it only displays what /api/pro/status
 * reports. Everything is enforced here.
 *
 * HOW A QUOTA IS CHARGED
 * ----------------------
 * 1. Reserve: atomically increment the counter *before* the handler runs, using
 *    a compare-and-set update (`... where counter = <value we read>`). Two
 *    parallel requests cannot both take the last slot: one CAS fails, re-reads,
 *    and is refused. The previous read-then-write-later design let a burst of
 *    parallel requests all pass the check.
 * 2. Refund: if the handler ends in an error (4xx/5xx), the slot is returned,
 *    so a Gemini timeout or a validation error does not cost the user a scan.
 *
 * Quota exhaustion is 429 QUOTA_EXCEEDED. A Pro-only feature is 403
 * PRO_REQUIRED. If the database cannot be read, expensive features fail
 * CLOSED (503): the failure mode must not be unlimited free AI usage.
 */

const PRO_ONLY_FEATURES = new Set(['pdf_import']);

const FREE_LIMITS = {
    receipt_scan: 3,   // per calendar month
    chat_message: 10,  // per calendar day
    add_expense: 20,   // per calendar day
};

/** Features whose handler costs real money; these never fail open. */
const FAIL_CLOSED = new Set(['receipt_scan', 'chat_message', 'pdf_import']);

const COUNTERS = {
    receipt_scan: { counter: 'receipt_scans_this_month', reset: 'receipt_scans_reset_month', period: 'month' },
    chat_message: { counter: 'chat_messages_today', reset: 'chat_messages_reset_at', period: 'day' },
    add_expense: { counter: 'expenses_today', reset: 'expenses_reset_at', period: 'day' },
};

const LIMIT_MESSAGES = {
    receipt_scan: `You've used all ${FREE_LIMITS.receipt_scan} free receipt scans this month. Your scans reset on the 1st.`,
    chat_message: `You've used all ${FREE_LIMITS.chat_message} free AI messages for today. They reset at midnight (IST).`,
    add_expense: `You've reached the free limit of ${FREE_LIMITS.add_expense} expenses today. The limit resets at midnight (IST).`,
};

const MAX_CAS_ATTEMPTS = 4;

class QuotaUnavailableError extends Error {}

function periodKey(period, now) {
    return period === 'month' ? appTime.localMonthKey(now) : appTime.localDateKey(now);
}

/** Next reset instant, for the client to display. */
function resetsAt(period, now) {
    return period === 'month'
        ? appTime.startOfNextMonth(now).toISOString()
        : new Date(appTime.startOfDay(now).getTime() + 24 * 60 * 60 * 1000).toISOString();
}

/** `.eq` for a value, `.is(null)` for null — PostgREST needs the distinction. */
function matchValue(query, column, value) {
    return value === null || value === undefined ? query.is(column, null) : query.eq(column, value);
}

/**
 * Atomically take one unit of quota.
 * @returns {Promise<{ok: boolean, used: number}>}
 */
async function reserve(userId, spec, key, limit) {
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
        const { data: row, error } = await supabase
            .from('profiles')
            .select(`${spec.counter}, ${spec.reset}`)
            .eq('id', userId)
            .maybeSingle();
        if (error || !row) throw new QuotaUnavailableError(error?.message || 'profile not found');

        const storedCount = row[spec.counter];
        const storedReset = row[spec.reset];
        const used = storedReset === key ? Number(storedCount) || 0 : 0;
        if (used >= limit) return { ok: false, used };

        let update = supabase
            .from('profiles')
            .update({ [spec.counter]: used + 1, [spec.reset]: key })
            .eq('id', userId);
        update = matchValue(update, spec.counter, storedCount);
        update = matchValue(update, spec.reset, storedReset);

        const { data: updated, error: updateError } = await update.select('id');
        if (updateError) throw new QuotaUnavailableError(updateError.message);
        if (updated && updated.length === 1) return { ok: true, used: used + 1 };
        // Someone else changed the row between our read and write; retry.
    }
    throw new QuotaUnavailableError('quota update contention');
}

/** Return one unit of quota after a failed request. Best effort. */
async function refund(userId, spec, key) {
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
        const { data: row, error } = await supabase
            .from('profiles')
            .select(`${spec.counter}, ${spec.reset}`)
            .eq('id', userId)
            .maybeSingle();
        if (error || !row || row[spec.reset] !== key) return;
        const current = Number(row[spec.counter]) || 0;
        if (current <= 0) return;

        const { data: updated } = await matchValue(
            supabase.from('profiles').update({ [spec.counter]: current - 1 }).eq('id', userId).eq(spec.reset, key),
            spec.counter,
            row[spec.counter]
        ).select('id');
        if (updated && updated.length === 1) return;
    }
}

function proGate(feature) {
    return async (req, res, next) => {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        const now = new Date();

        try {
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('is_pro, pro_expires_at')
                .eq('id', userId)
                .maybeSingle();
            if (error || !profile) throw new QuotaUnavailableError(error?.message || 'profile not found');

            if (hasActivePro(profile, now)) return next();

            if (PRO_ONLY_FEATURES.has(feature)) {
                return res.status(403).json({
                    success: false,
                    code: 'PRO_REQUIRED',
                    feature,
                    message: 'This feature is part of Vittova Pro, which is not available yet.',
                });
            }

            const spec = COUNTERS[feature];
            if (!spec) {
                // A feature name with no quota definition is a programming
                // error; refuse rather than silently allow.
                console.error(`proGate: unknown feature "${feature}"`);
                return res.status(500).json({ success: false, message: 'Internal server error' });
            }

            const limit = FREE_LIMITS[feature];
            const key = periodKey(spec.period, now);
            const result = await reserve(userId, spec, key, limit);

            if (!result.ok) {
                return res.status(429).json({
                    success: false,
                    code: 'QUOTA_EXCEEDED',
                    feature,
                    limit,
                    used: result.used,
                    resetsAt: resetsAt(spec.period, now),
                    message: LIMIT_MESSAGES[feature],
                });
            }

            res.locals.quota = { feature, limit, used: result.used, remaining: Math.max(0, limit - result.used) };
            res.once('finish', () => {
                if (res.statusCode >= 400) {
                    refund(userId, spec, key).catch((e) => console.error('proGate refund failed:', e.message));
                }
            });
            return next();
        } catch (err) {
            console.error(`proGate(${feature}) could not verify quota:`, err.message);
            if (FAIL_CLOSED.has(feature)) {
                return res.status(503).json({
                    success: false,
                    code: 'VERIFICATION_UNAVAILABLE',
                    feature,
                    message: 'We could not check your usage just now. Please try again in a moment.',
                });
            }
            // Logging an expense stays available during a database blip: the
            // worst case is a few extra free expense rows, not a cost.
            return next();
        }
    };
}

module.exports = { proGate, FREE_LIMITS, PRO_ONLY_FEATURES, COUNTERS };
