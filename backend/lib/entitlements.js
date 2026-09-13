/**
 * entitlements — the single server-side answer to "is this user Pro?"
 *
 * TRUST MODEL
 * -----------
 * `profiles.is_pro` and `profiles.pro_expires_at` are a *cache of a verified
 * entitlement*. They may only be written by:
 *   - the backend's service-role client, after a purchase has been verified
 *     server-side with Google Play (not implemented yet — see
 *     BILLING_ARCHITECTURE.md), or
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
 * Whether in-app purchase is available. Hard-coded false: there is no Google
 * Play Billing integration or server-side purchase verification yet, and an
 * environment flag must not be able to switch on a purchase flow that does not
 * exist. Change this only together with the verification endpoint.
 */
function purchasesEnabled() {
    return false;
}

module.exports = { hasActivePro, purchasesEnabled, PRO_PROFILE_COLUMNS };
