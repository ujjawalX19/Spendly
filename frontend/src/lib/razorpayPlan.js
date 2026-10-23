/**
 * razorpayPlan — pure helpers for Razorpay Pro passes (no network, no DOM),
 * kept apart from razorpayCheckout.js so they can be tested in Node.
 */

/** "₹449" from 44900 paise. */
export function rupees(paise) {
  const value = Number(paise) / 100;
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** Plan cards from the server's config; anything unexpected is dropped. */
export function passCards(plans = []) {
  return plans
    .filter((p) => p && (p.key === 'monthly' || p.key === 'yearly') && Number(p.amount) > 0)
    .map((p) => ({
      key: p.key,
      title: p.key === 'yearly' ? 'Yearly' : 'Monthly',
      price: rupees(p.amount),
      amount: p.amount,
      terms: p.key === 'yearly'
        ? 'One payment for 1 year of Pro. Does not renew.'
        : 'One payment for 30 days of Pro. Does not renew.',
    }));
}

/**
 * What to tell the user from the server's verify answer. Only the server's
 * "paid" plus an active Pro counts as active; Checkout's own success never does.
 * @returns {'active'|'failed'|'pending'}
 */
export function outcomeFromVerify(body) {
  if (body?.pro?.isPro && body?.status === 'paid') return 'active';
  if (body?.status === 'failed') return 'failed';
  return 'pending';
}
