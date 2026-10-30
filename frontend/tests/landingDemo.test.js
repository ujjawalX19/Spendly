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
  // Pro is on sale in the Android app: no leftover pre-launch wording, and the
  // prices match the plans (billingPlans.js). The launch offer is not promised
  // here because it only exists while LIMITED_OFFER_ENABLED is on.
  const pro = readFileSync(join(dir, 'ProSection.jsx'), 'utf8');
  assert.doesNotMatch(pro, /not available to buy yet|Planned pricing|coming soon/i);
  assert.match(pro, /PlayStoreCta/);
  assert.match(pro, /'₹49'/);
  assert.match(pro, /'₹449'/);
  assert.doesNotMatch(pro, /₹199/);
  assert.doesNotMatch(pro, /student|₹29|₹249|countdown|ends (today|tonight)/i);
  const plans = readFileSync(join(here, '..', '..', 'backend/lib/billingPlans.js'), 'utf8');
  for (const price of ['₹49 / month', '₹449 / year', '₹199 first year, then ₹449 / year']) assert.ok(plans.includes(price), price);
  // Pro is sold only through Google Play: the site offers no checkout of its
  // own and says so (Terms §4), and every example screen is labelled.
  assert.match(pro, /not on this website/);
  assert.doesNotMatch(text, /checkout|pay now|buy now|upgrade to pro/i);
  assert.match(readFileSync(join(dir, 'Faq.jsx'), 'utf8'), /cannot be bought on this website/);
  assert.match(readFileSync(join(dir, 'Mocks.jsx'), 'utf8'), /Example figures/);
  // The demo is labelled as an example everywhere it appears.
  assert.match(readFileSync(join(dir, 'AffordDemo.jsx'), 'utf8'), /Example month/);
});
