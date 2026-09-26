/**
 * billingPlan — pure helpers for the Pro purchase screen (no Capacitor, no
 * network), so they can be unit-tested. See lib/billing.js.
 */

/** ISO-8601 billing period → words: 'P1M' → 'month', 'P1Y' → 'year', 'P3M' → '3 months'. */
export function periodLabel(iso) {
  const m = /^P(\d+)([DWMY])$/.exec(String(iso || ''));
  if (!m) return '';
  const unit = { D: 'day', W: 'week', M: 'month', Y: 'year' }[m[2]];
  return m[1] === '1' ? unit : `${m[1]} ${unit}s`;
}

/** The plan to offer: the first product that has an offer, and its base-plan offer. */
export function pickPlan(products = [], productIds = []) {
  const ordered = [...products].sort((a, b) => productIds.indexOf(a.productId) - productIds.indexOf(b.productId));
  for (const p of ordered) {
    const offers = Array.isArray(p.offers) ? p.offers : [];
    // A base plan has no offerId; prefer it over promotional offers.
    const offer = offers.find((o) => !o.offerId) || offers[0];
    if (offer?.offerToken) {
      return { productId: p.productId, title: p.title, offerToken: offer.offerToken, price: offer.price || '', period: periodLabel(offer.billingPeriod) };
    }
  }
  return null;
}

/** Only completed purchases are sent for verification; pending ones wait for Google. */
export const tokensToVerify = (purchases = []) => purchases.filter((p) => p?.state === 'purchased' && p.purchaseToken).map((p) => p.purchaseToken);

const UNIT = new Set(['day', 'week', 'month', 'year']);
const perPeriod = (iso) => {
  const w = periodLabel(iso);
  return UNIT.has(w) ? `/${w}` : w ? ` every ${w}` : '';
};
const firstPeriod = (iso, cycles) => {
  const w = periodLabel(iso);
  if (!w) return '';
  return cycles === 1 ? `for the first ${w}` : `for the first ${cycles} ${UNIT.has(w) ? `${w}s` : `× ${w}`}`;
};

/**
 * Words for a Google Play offer, built only from its pricing phases so the
 * paywall says exactly what Play will charge (recurrenceMode 1 = renews,
 * 2 = finite intro, 3 = once):
 *   [₹199 × 1 × P1Y, ₹449 / P1Y] → '₹199 for the first year',
 *                                  'Renews at ₹449/year after the offer period unless cancelled.'
 *   [₹49 / P1M]                  → '₹49/month', 'Renews automatically every month until cancelled.'
 */
export function describeOffer(offer) {
  const phases = Array.isArray(offer?.pricingPhases) ? offer.pricingPhases : [];
  if (!phases.length) return null;
  const last = phases[phases.length - 1];
  const intro = phases.length > 1 ? phases[0] : null;
  if (!intro) {
    return { price: `${last.price}${perPeriod(last.billingPeriod)}`, renewal: `Renews automatically every ${periodLabel(last.billingPeriod)} until cancelled.`, intro: false };
  }
  const cycles = Number(intro.billingCycleCount) || 1;
  const free = Number(intro.priceMicros) === 0;
  return {
    price: `${free ? 'Free' : intro.price} ${firstPeriod(intro.billingPeriod, cycles)}`,
    renewal: `Renews at ${last.price}${perPeriod(last.billingPeriod)} after the offer period unless cancelled.`,
    intro: true,
  };
}

const PLAN_TITLES = {
  monthly: 'Pro Monthly',
  yearly: 'Pro Yearly',
  limited_yearly: 'Offer',
  student_monthly: 'Student Monthly',
  student_yearly: 'Student Yearly',
};

/**
 * Paywall cards: the plans the server allows, matched to what Google Play
 * actually returned for this user. A plan Google did not return (not set up,
 * or the user is not eligible for an offer) is simply not shown.
 */
export function planCards(products = [], plans = []) {
  const cards = [];
  for (const plan of plans) {
    for (const product of products) {
      const offer = (product.offers || []).find((o) => o.basePlanId === plan.basePlanId && (plan.offerId ? o.offerId === plan.offerId : !o.offerId));
      const words = offer && describeOffer(offer);
      if (offer?.offerToken && words) {
        cards.push({ key: plan.key, title: PLAN_TITLES[plan.key] || 'Pro', productId: product.productId, offerToken: offer.offerToken, ...words });
        break;
      }
    }
  }
  return cards;
}

