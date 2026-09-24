/**
 * featureFlags — switches for monetization features, read from the server
 * environment so they can be rolled out (or pulled) without an app release.
 *
 *   SUBSCRIPTION_AUDIT_ENABLED     default on   (Pro: recurring leak audit, debit reminders)
 *   SPONSORED_CHALLENGES_ENABLED   default off  (needs a real sponsor, vouchers and challenge terms)
 *   CAMPAIGN_DASHBOARD_ENABLED     default off  (Owner Console campaign management)
 *   LIMITED_OFFER_ENABLED          default off  (only when the Play offer is configured)
 *   STUDENT_PLAN_ENABLED           forced off   (no safe student verification exists yet)
 *
 * The app reads them from GET /api/features and hides what is off. Every
 * route also checks its flag, so a client cannot reach a disabled feature.
 */

const DEFAULTS = {
    subscriptionAuditEnabled: ['SUBSCRIPTION_AUDIT_ENABLED', true],
    sponsoredChallengesEnabled: ['SPONSORED_CHALLENGES_ENABLED', false],
    campaignDashboardEnabled: ['CAMPAIGN_DASHBOARD_ENABLED', false],
    limitedOfferEnabled: ['LIMITED_OFFER_ENABLED', false],
};

/**
 * Student pricing needs verified eligibility (an approved academic identity or
 * email-domain check with a confirmation step). None is implemented, and a
 * client-supplied "isStudent" must never be trusted, so the plan stays off
 * whatever the environment says. See BILLING_ARCHITECTURE.md.
 */
const STUDENT_VERIFICATION_AVAILABLE = false;

function readBool(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    return raw === 'true' || raw === '1';
}

function flag(key) {
    if (key === 'studentPlanEnabled') return STUDENT_VERIFICATION_AVAILABLE && readBool('STUDENT_PLAN_ENABLED', false);
    const def = DEFAULTS[key];
    if (!def) throw new Error(`Unknown feature flag ${key}`);
    return readBool(def[0], def[1]);
}

function allFlags() {
    return {
        subscriptionAuditEnabled: flag('subscriptionAuditEnabled'),
        sponsoredChallengesEnabled: flag('sponsoredChallengesEnabled'),
        campaignDashboardEnabled: flag('campaignDashboardEnabled'),
        studentPlanEnabled: flag('studentPlanEnabled'),
        limitedOfferEnabled: flag('limitedOfferEnabled'),
    };
}

/** Express middleware: 404 FEATURE_DISABLED when a flag is off. */
function requireFlag(key) {
    return (req, res, next) => (flag(key)
        ? next()
        : res.status(404).json({ success: false, code: 'FEATURE_DISABLED', message: 'This feature is not available.' }));
}

module.exports = { flag, allFlags, requireFlag, STUDENT_VERIFICATION_AVAILABLE };
