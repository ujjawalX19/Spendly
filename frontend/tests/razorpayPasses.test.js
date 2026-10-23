// Razorpay Pro passes and which store build sells Pro how. The server is the
// authority on prices and on Pro itself; these check what the app shows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rupees, passCards, outcomeFromVerify } from '../src/lib/razorpayPlan.js';
import { distribution, paymentChannel } from '../src/lib/distribution.js';

const here = dirname(fileURLToPath(import.meta.url));

test('the Play build sells through Google Play only; the website and Indus build through Razorpay', () => {
  assert.equal(distribution({}), 'play');
  assert.equal(distribution({ VITE_DISTRIBUTION: 'indus' }), 'indus');
  assert.equal(distribution({ VITE_DISTRIBUTION: 'something-else' }), 'play');
  assert.equal(paymentChannel({ native: true, platform: 'android' }, 'play'), 'play');
  assert.equal(paymentChannel({ native: true, platform: 'android' }, 'indus'), 'razorpay');
  assert.equal(paymentChannel({ native: false, platform: 'web' }, 'play'), 'razorpay');
  assert.equal(paymentChannel({ native: true, platform: 'ios' }, 'play'), 'none');
});

test('pass cards show the server\'s prices in rupees and say they never renew', () => {
  assert.equal(rupees(4900), '₹49');
  assert.equal(rupees(44900), '₹449');
  const cards = passCards([
    { key: 'monthly', amount: 4900 },
    { key: 'yearly', amount: 44900 },
    { key: 'lifetime', amount: 1 },
    { key: 'yearly', amount: 0 },
    null,
  ]);
  assert.deepEqual(cards.map((c) => [c.key, c.price]), [['monthly', '₹49'], ['yearly', '₹449']]);
  for (const c of cards) assert.match(c.terms, /Does not renew/);
});

test('only the server\'s confirmation turns Pro on in the app', () => {
  assert.equal(outcomeFromVerify({ status: 'paid', pro: { isPro: true } }), 'active');
  assert.equal(outcomeFromVerify({ status: 'paid', pro: { isPro: false } }), 'pending');
  assert.equal(outcomeFromVerify({ status: 'pending' }), 'pending');
  assert.equal(outcomeFromVerify({ status: 'failed' }), 'failed');
  assert.equal(outcomeFromVerify(undefined), 'pending');
});

test('the Play build never reaches Razorpay, and Play restore never runs in the Indus build', () => {
  const ctx = readFileSync(join(here, '..', 'src/contexts/ProContext.jsx'), 'utf8');
  assert.match(ctx, /CHANNEL === 'play' \? data\.purchasesAvailable === true/);
  assert.match(ctx, /CHANNEL !== 'play'\) return;/);
  const page = readFileSync(join(here, '..', 'src/pages/ProUpgrade.jsx'), 'utf8');
  assert.match(page, /paymentChannel === 'razorpay' && \(\s*<RazorpayPlans/);
  assert.doesNotMatch(page, /isAndroidApp\(\)/);
  // The key secret never reaches the app: Checkout gets only the key id the server sends.
  const checkout = readFileSync(join(here, '..', 'src/lib/razorpayCheckout.js'), 'utf8');
  assert.match(checkout, /key: order\.keyId/);
  assert.doesNotMatch(checkout, /secret/i);
});
