const { supabase } = require('../config/supabase');
const { audit } = require('../lib/adminAudit');

/**
 * requireOwner — the only gate in front of /api/admin. Runs after `protect`.
 *
 * Vittova has exactly one operator: the app owner. A request is allowed only
 * when ALL of these hold, each checked server-side on every request:
 *
 *   1. ADMIN_EMAIL is configured on the server. If it is missing or malformed
 *      the admin API is closed to everyone (fail closed).
 *   2. The email on the verified Supabase Auth user equals ADMIN_EMAIL
 *      (case-insensitive) and that email is confirmed. The address comes from
 *      Supabase's token verification in `protect`, never from the request.
 *   3. The account's profile has role = 'admin'. Clients cannot write `role`
 *      (supabase/v1_2_security_p0.sql) and no API accepts it.
 *   4. The profile's email also equals ADMIN_EMAIL, so a stale role on an
 *      account whose address was changed does not keep its access.
 *
 * Both factors are needed: a leaked role flag without the owner's mailbox, or
 * someone who registers the owner's address elsewhere without the role, gets
 * nothing. There is no client-supplied "isAdmin" anywhere.
 *
 * Refusals: no or invalid token -> 401 (from `protect`); a verified user who
 * is not the owner -> 403 Forbidden. Every refusal of a signed-in user is
 * written to the audit log (throttled per user so a probe cannot flood it).
 * The response never says which check failed.
 */

const DENIAL_LOG_MS = 10 * 60 * 1000;
const recentDenials = new Map(); // userId -> ms

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** The configured owner address, or null when absent or not exactly one address. */
function configuredOwnerEmail() {
    const raw = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    return EMAIL_RE.test(raw) ? raw : null;
}

const normalize = (email) => String(email || '').trim().toLowerCase();

function deny(req, res, reason) {
    const userId = req.user?.id;
    const now = Date.now();
    if (userId && !(recentDenials.get(userId) > now - DENIAL_LOG_MS)) {
        if (recentDenials.size > 5000) recentDenials.clear();
        recentDenials.set(userId, now);
        audit(req, 'admin_access_denied', { details: { reason, method: req.method, path: req.baseUrl } }).catch(() => {});
    }
    res.set('Cache-Control', 'no-store');
    return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Forbidden' });
}

async function requireOwner(req, res, next) {
    const ownerEmail = configuredOwnerEmail();
    if (!ownerEmail) {
        console.error('Admin API refused: ADMIN_EMAIL is not configured (or is not a single address).');
        return deny(req, res, 'admin_email_not_configured');
    }
    if (!req.user?.id || normalize(req.user.email) !== ownerEmail) {
        return deny(req, res, 'not_owner_email');
    }
    if (!req.user.emailConfirmed) {
        return deny(req, res, 'email_not_confirmed');
    }

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, email, is_banned')
        .eq('id', req.user.id)
        .maybeSingle();

    if (error) {
        return res.status(503).json({ success: false, message: 'Could not verify permissions' });
    }
    if (!profile || profile.role !== 'admin' || normalize(profile.email) !== ownerEmail || profile.is_banned) {
        return deny(req, res, 'profile_not_owner');
    }

    req.user.isOwner = true;
    // Admin responses carry other users' data; never cache them anywhere.
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    return next();
}

/** Tests only. */
function resetDenialLog() {
    recentDenials.clear();
}

module.exports = { requireOwner, configuredOwnerEmail, resetDenialLog };
