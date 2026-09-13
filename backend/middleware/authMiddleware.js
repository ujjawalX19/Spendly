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

    // Controllers use req.user.id for all user-scoped queries.
    req.user = { id: user.id, email: user.email };
    return userApiLimiter(req, res, next);
};

module.exports = { protect, invalidateBanCache };
