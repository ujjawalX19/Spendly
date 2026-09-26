/**
 * entitlements — the single server-side answer to "is this user Pro?"
 *
 * TRUST MODEL
 * -----------
 * `profiles.is_pro` and `profiles.pro_expires_at` are a *cache of a verified
 * entitlement*. They may only be written by:
 *   - the backend's service-role client, after a purchase has been verified
 *     server-side with Google Play (lib/playBilling.js), or
 *   - an operator making a deliberate manual grant.
 *
 * The client can never write them: supabase/v1_2_security_p0.sql revokes all
 * client UPDATE rights on server-owned profile columns. No API route accepts
 * `is_pro`, `pro_expires_at` or `role` from a request body.
 *
 * Every place that needs to know about Pro (proGate, /api/pro/status, PDF
 * import) must go through `hasActivePro` so expiry is handled identically.
 */

const PRO_PROFILE_COLUMNS = 'is_pro, pro_expires_at';

/**
 * @param {{is_pro?: boolean, pro_expires_at?: string|null}|null} profile
 * @param {Date} [now]
 * @returns {boolean} true only for a Pro flag that has not expired.
 *          `is_pro` with no expiry is a manual, non-expiring grant.
 */
function hasActivePro(profile, now = new Date()) {
    if (!profile || profile.is_pro !== true) return false;
    if (!profile.pro_expires_at) return true;
    const expires = new Date(profile.pro_expires_at);
    if (Number.isNaN(expires.getTime())) return false;
    return expires > now;
}

/**
 * Whether in-app purchase is available: only when server-side Google Play
 * verification is configured (a service account) AND explicitly switched on
 * (PLAY_BILLING_ENABLED=true). See lib/playBilling.js.
 */
function purchasesEnabled() {
    return require('./playBilling').purchasesEnabled();
}

module.exports = { hasActivePro, purchasesEnabled, PRO_PROFILE_COLUMNS };
