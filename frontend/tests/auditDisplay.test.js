// Subscription audit and paywall wording: built from server data and Google
// Play pricing phases, never promising a debit or inventing a price.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dueLabel, groupItems, CONFIDENCE } from '../src/lib/auditDisplay.js';
import { describeOffer, planCards } from '../src/lib/billingPlan.js';

test('due dates never say a debit will happen', () => {
  assert.equal(dueLabel('2026-09-25', '2026-09-24'), 'Expected tomorrow');
  assert.equal(dueLabel('2026-10-05', '2026-09-23'), 'Expected around 5 Oct (in 12 days)');
  assert.equal(dueLabel('2026-09-23', '2026-09-23'), 'Expected around today');
  assert.deepEqual(Object.keys(CONFIDENCE), ['high', 'medium', 'possible']);
});

test('items needing a decision come first; dismissed and lapsed ones last', () => {
  const g = groupItems([
    { merchantKey: 'a', status: 'active', confidence: 'medium', decision: null, counted: true },
    { merchantKey: 'b', status: 'active', confidence: 'high', decision: null, counted: true },
    { merchantKey: 'c', status: 'active', confidence: 'possible', decision: 'dismissed', counted: false },
    { merchantKey: 'd', status: 'lapsed', confidence: 'high', decision: null, counted: false },
  ]);
  assert.deepEqual(g.review.map((i) => i.merchantKey), ['a']);
  assert.deepEqual(g.counted.map((i) => i.merchantKey), ['b']);
  assert.deepEqual(g.other.map((i) => i.merchantKey), ['c', 'd']);
});

const INTRO = { pricingPhases: [
  { price: '₹199.00', priceMicros: 199000000, billingPeriod: 'P1Y', billingCycleCount: 1, recurrenceMode: 2 },
  { price: '₹449.00', priceMicros: 449000000, billingPeriod: 'P1Y', billingCycleCount: 0, recurrenceMode: 1 },
] };

test('an intro offer states the first-period price and the exact renewal price', () => {
  assert.deepEqual(describeOffer(INTRO), { price: '₹199.00 for the first year', renewal: 'Renews at ₹449.00/year after the offer period unless cancelled.', intro: true });
});

test('a plain base plan renews at its own price', () => {
  assert.deepEqual(describeOffer({ pricingPhases: [{ price: '₹49.00', priceMicros: 49000000, billingPeriod: 'P1M', billingCycleCount: 0, recurrenceMode: 1 }] }),
    { price: '₹49.00/month', renewal: 'Renews automatically every month until cancelled.', intro: false });
  assert.equal(describeOffer({}), null);
});

test('a free trial says free, then the renewal price', () => {
  const d = describeOffer({ pricingPhases: [
    { price: 'Free', priceMicros: 0, billingPeriod: 'P1W', billingCycleCount: 1, recurrenceMode: 2 },
    { price: '₹49.00', priceMicros: 49000000, billingPeriod: 'P1M', billingCycleCount: 0, recurrenceMode: 1 },
  ] });
  assert.equal(d.price, 'Free for the first week');
  assert.match(d.renewal, /₹49\.00\/month/);
});

test('plan cards show only plans the server allows AND Google returned', () => {
  const products = [{ productId: 'vittova_pro', offers: [
    { offerToken: 'm', basePlanId: 'monthly', offerId: null, pricingPhases: [{ price: '₹49.00', billingPeriod: 'P1M', recurrenceMode: 1 }] },
    { offerToken: 'y', basePlanId: 'yearly', offerId: null, pricingPhases: [{ price: '₹449.00', billingPeriod: 'P1Y', recurrenceMode: 1 }] },
    { offerToken: 'l', basePlanId: 'yearly', offerId: 'launch-199', ...INTRO },
    { offerToken: 's', basePlanId: 'student-monthly', offerId: null, pricingPhases: [{ price: '₹29.00', billingPeriod: 'P1M', recurrenceMode: 1 }] },
  ] }];
  const withoutOffer = planCards(products, [{ key: 'monthly', basePlanId: 'monthly', offerId: null }, { key: 'yearly', basePlanId: 'yearly', offerId: null }]);
  assert.deepEqual(withoutOffer.map((c) => [c.key, c.offerToken, c.price]), [['monthly', 'm', '₹49.00/month'], ['yearly', 'y', '₹449.00/year']]);
  // The student base plan exists in Play but the server never lists it, so it never shows.
  assert.ok(!withoutOffer.some((c) => c.offerToken === 's'));
  const withOffer = planCards(products, [{ key: 'limited_yearly', basePlanId: 'yearly', offerId: 'launch-199' }]);
  assert.equal(withOffer[0].price, '₹199.00 for the first year');
  // If Google did not return the offer (not eligible / ended), there is no card.
  assert.deepEqual(planCards([{ productId: 'vittova_pro', offers: products[0].offers.slice(0, 2) }], [{ key: 'limited_yearly', basePlanId: 'yearly', offerId: 'launch-199' }]), []);
});
