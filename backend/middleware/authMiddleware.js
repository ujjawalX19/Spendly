const { supabase } = require('../config/supabase');
const { userApiLimiter } = require('./rateLimits');

/**
 * Supabase JWT Auth Middleware — `protect`
 *
 * 1. Verifies the Bearer token with Supabase Auth (a real network check, so a
 *    deleted user's still-unexpired JWT is rejected).
 * 2. Rejects banned accounts. The ban flag is cached briefly to avoid a
 *    database round trip on every request.
 * 3. Applies the per-user API rate limit, keyed on the verified user id.
 *
 * The backend uses the service-role key, which bypasses RLS. Every route must
 * therefore scope its queries with `req.user.id` itself.
 *
 * Usage: router.get('/protected', protect, handler)
 */

const BAN_CACHE_MS = 30 * 1000;
const banCache = new Map(); // userId -> { banned, at }

async function isBanned(userId) {
    const cached = banCache.get(userId);
    if (cached && Date.now() - cached.at < BAN_CACHE_MS) return cached.banned;

    const { data, error } = await supabase
        .from('profiles')
        .select('is_banned')
        .eq('id', userId)
        .maybeSingle();

    // A missing profile is not a ban; routes that need the profile handle it.
    // A lookup failure is not cached, so the next request tries again.
    if (error) throw error;
    const banned = data?.is_banned === true;
    if (banCache.size > 10000) banCache.clear();
    banCache.set(userId, { banned, at: Date.now() });
    return banned;
}

/** Forget a cached ban decision, e.g. right after an admin changes it. */
function invalidateBanCache(userId) {
    banCache.delete(userId);
}

const protect = async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Not authorized — no token provided'
        });
    }

    let user;
    try {
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data?.user) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized — invalid or expired token'
            });
        }
        user = data.user;
    } catch {
        return res.status(503).json({
            success: false,
            message: 'Authentication service is temporarily unavailable'
        });
    }

    try {
        if (await isBanned(user.id)) {
            return res.status(403).json({
                success: false,
                code: 'ACCOUNT_SUSPENDED',
                message: 'This account has been suspended. Contact support if you think this is a mistake.',
            });
        }
    } catch {
        return res.status(503).json({
            success: false,
            message: 'Authentication service is temporarily unavailable'
        });
    }

    touchActivity(user.id);

    // Controllers use req.user.id for all user-scoped queries.
    // emailConfirmed comes from Supabase Auth, never from the client.
    req.user = { id: user.id, email: user.email, emailConfirmed: Boolean(user.email_confirmed_at) };
    return userApiLimiter(req, res, next);
};

/**
 * Record that a user was active, for the admin panel's active-user counts.
 * At most one write per user per ACTIVITY_WRITE_MS, fire-and-forget: a failed
 * or missing column (migration v1.4 not run) never affects the request.
 */
const ACTIVITY_WRITE_MS = 10 * 60 * 1000;
const lastActivityWrite = new Map(); // userId -> ms
let activityErrorLogged = false;

function touchActivity(userId) {
    const now = Date.now();
    const last = lastActivityWrite.get(userId);
    if (last && now - last < ACTIVITY_WRITE_MS) return;
    if (lastActivityWrite.size > 20000) lastActivityWrite.clear();
    lastActivityWrite.set(userId, now);

    Promise.resolve()
        .then(() => supabase.from('profiles').update({ last_active_at: new Date(now).toISOString() }).eq('id', userId))
        .then((result) => {
            if (result?.error && !activityErrorLogged) {
                activityErrorLogged = true;
                console.error('Activity tracking unavailable (run supabase/v1_4_admin_ops.sql):', result.error.message);
            }
        })
        .catch(() => { /* best effort */ });
}

module.exports = { protect, invalidateBanCache };
