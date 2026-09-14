const { supabase } = require('../config/supabase');
const { resolveClientIp } = require('../middleware/rateLimits');

/**
 * adminAudit — append-only record of what the owner did in the admin panel,
 * and of refused attempts to reach it. Stored in public.admin_audit_log
 * (supabase/v1_4_admin_ops.sql), readable only through the owner-only API.
 *
 * `details` must never contain tokens, passwords, keys or transaction data;
 * callers pass only action parameters such as a reason or a new expiry date.
 */

const MAX_DETAIL_CHARS = 2000;

function sanitizeDetails(details) {
    const json = JSON.stringify(details || {});
    return json.length > MAX_DETAIL_CHARS ? { truncated: true } : JSON.parse(json);
}

/**
 * Write one audit entry.
 * @param {import('express').Request} req
 * @param {string} action
 * @param {{targetUserId?: string|null, details?: object, required?: boolean}} [options]
 *   `required`: the caller must refuse the action if the entry cannot be
 *   written (used for mutations, so nothing changes without a record).
 * @returns {Promise<boolean>} whether the entry was stored
 */
async function audit(req, action, { targetUserId = null, details = {}, required = false } = {}) {
    const { error } = await supabase.from('admin_audit_log').insert({
        actor_id: req.user?.id || null,
        actor_email: req.user?.email || null,
        action,
        target_user_id: targetUserId,
        details: sanitizeDetails(details),
        ip: resolveClientIp(req).ip || null,
    });
    if (error) {
        console.error(`Admin audit write failed (${action}):`, error.message);
        if (required) return false;
    }
    return !error;
}

module.exports = { audit };
