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

