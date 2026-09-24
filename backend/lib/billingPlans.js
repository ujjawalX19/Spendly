/**
 * billingPlans — the Vittova Pro plans and how they map to Google Play.
 *
 * One subscription product (PLAY_PRO_PRODUCT_IDS, default "vittova_pro") with
 * base plans and one offer, all configured in Play Console:
 *
 *   plan key          base plan (env, default)                 intended price
 *   monthly           PLAY_PLAN_MONTHLY          = monthly         ₹49 / month
 *   yearly            PLAY_PLAN_YEARLY           = yearly          ₹449 / year
 *   limited_yearly    offer PLAY_OFFER_LIMITED   = launch-199      ₹199 first year, then ₹449 / year
 *                     on the yearly base plan
 *   student_monthly   PLAY_PLAN_STUDENT_MONTHLY  = student-monthly ₹29 / month   (disabled)
 *   student_yearly    PLAY_PLAN_STUDENT_YEARLY   = student-yearly  ₹249 / year   (disabled)
 *
 * Prices are never set here or in the app: the app shows Google Play's own
 * formatted price and pricing phases for whatever Play Console holds.
 *
 * The limited offer is shown only when LIMITED_OFFER_ENABLED is on AND Google
 * returns that offer to the user (Google enforces its eligibility and end
 * date). Student plans are never offered while student verification does not
 * exist, and a student base-plan purchase by an unverified account is refused
 * and left unacknowledged, so Google refunds it automatically.
 */

const { flag } = require('./featureFlags');

const env = (name, fallback) => (process.env[name] || fallback).trim();

function planIds() {
    return {
        monthly: env('PLAY_PLAN_MONTHLY', 'monthly'),
        yearly: env('PLAY_PLAN_YEARLY', 'yearly'),
        studentMonthly: env('PLAY_PLAN_STUDENT_MONTHLY', 'student-monthly'),
        studentYearly: env('PLAY_PLAN_STUDENT_YEARLY', 'student-yearly'),
        limitedOffer: env('PLAY_OFFER_LIMITED', 'launch-199'),
    };
}

/** Plans this user may be offered, for the paywall. */
function offeredPlans({ studentVerified = false } = {}) {
    const ids = planIds();
    const plans = [
        { key: 'monthly', basePlanId: ids.monthly, offerId: null },
        { key: 'yearly', basePlanId: ids.yearly, offerId: null },
    ];
    if (flag('limitedOfferEnabled')) plans.push({ key: 'limited_yearly', basePlanId: ids.yearly, offerId: ids.limitedOffer });
    if (flag('studentPlanEnabled') && studentVerified) {
        plans.push({ key: 'student_monthly', basePlanId: ids.studentMonthly, offerId: null });
        plans.push({ key: 'student_yearly', basePlanId: ids.studentYearly, offerId: null });
    }
    return plans;
}

/** Which plan a verified purchase is (from subscriptionsv2 lineItems[].offerDetails). */
function planKeyFor(basePlanId, offerId) {
    const ids = planIds();
    if (basePlanId === ids.studentMonthly) return 'student_monthly';
    if (basePlanId === ids.studentYearly) return 'student_yearly';
    if (basePlanId === ids.yearly) return offerId && offerId === ids.limitedOffer ? 'limited_yearly' : 'yearly';
    if (basePlanId === ids.monthly) return 'monthly';
    return 'unknown';
}

const isStudentPlan = (key) => key === 'student_monthly' || key === 'student_yearly';

module.exports = { planIds, offeredPlans, planKeyFor, isStudentPlan };
