// The homepage "Can I afford this?" demo: one labelled example month, three honest outcomes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoCheck, EXAMPLE_MONTH } from '../src/lib/landingDemo.js';

const here = dirname(fileURLToPath(import.meta.url));

test('the example month gives each verdict at the preset prices', () => {
  assert.equal(demoCheck(499).verdict, 'can_afford');
  assert.equal(demoCheck(2499).verdict, 'can_afford');
  assert.equal(demoCheck(6000).verdict, 'wait');
  assert.equal(demoCheck(9999).verdict, 'not_comfortable');
});

test('the upcoming bill is set aside first and nothing goes negative', () => {
  const afterBill = EXAMPLE_MONTH.leftThisMonth - EXAMPLE_MONTH.bill.amount;
  const r = demoCheck(afterBill);
  assert.equal(r.leftAfter, 0);
  assert.equal(r.perDay, 0);
  const over = demoCheck(afterBill + 1);
  assert.equal(over.shortBy, 1);
  assert.equal(over.leftAfter, 0);
});

test('homepage copy makes no promises the product does not keep', () => {
  const dir = join(here, '..', 'src/pages/Landing');
  const files = ['index.jsx', 'HeroSection.jsx', 'AffordDemo.jsx', 'WhyVittova.jsx', 'HowItWorks.jsx', 'Features.jsx', 'AiSection.jsx', 'ProSection.jsx', 'TrustSection.jsx', 'Faq.jsx', 'Mocks.jsx', 'Footer.jsx', 'Navbar.jsx'];
  const text = files.map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  for (const bad of [/guaranteed? (returns?|profit)/i, /bank[- ]level/i, /military[- ]grade/i, /100% secure/i, /best (stock|fund)/i, /make you rich/i, /predicts? the market/i, /testimonial/i, /\d+(,\d+)*\+? (users|downloads|reviews)/i, /only \d+ (spots|left)/i]) {
    assert.doesNotMatch(text, bad, String(bad));
  }
  // The website sells Razorpay passes: the homepage prices are the server's
  // (razorpayBilling.js PLANS, in paise), say they never renew, and show no
  // Play-only launch offer, student plans or urgency.
  const pro = readFileSync(join(dir, 'ProSection.jsx'), 'utf8');
  assert.match(pro, /'₹49'[\s\S]*for 30 days/);
  assert.match(pro, /'₹449'[\s\S]*for 1 year/);
  assert.match(pro, /Does not renew/);
  assert.doesNotMatch(pro, /₹199|launch offer|student|₹29|₹249|countdown|ends (today|tonight)/i);
  const passes = readFileSync(join(here, '..', '..', 'backend/lib/razorpayBilling.js'), 'utf8');
  assert.match(passes, /monthly: \{ key: 'monthly', amount: 4900, days: 30/);
  assert.match(passes, /yearly: \{ key: 'yearly', amount: 44900, days: 365/);
  // Buying happens on /pro after sign-in, never on the homepage itself, and
  // every example screen is labelled.
  assert.match(pro, /to="\/pro"/);
  assert.doesNotMatch(text, /checkout|pay now|buy now|upgrade to pro/i);
  assert.match(readFileSync(join(dir, 'Faq.jsx'), 'utf8'), /never renews/);
  assert.match(readFileSync(join(dir, 'Mocks.jsx'), 'utf8'), /Example figures/);
  // The demo is labelled as an example everywhere it appears.
  assert.match(readFileSync(join(dir, 'AffordDemo.jsx'), 'utf8'), /Example month/);
});
