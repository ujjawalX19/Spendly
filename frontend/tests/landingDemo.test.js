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
  // The website sells nothing: Pro links to Google Play. Prices match Play
  // Console. The offer shows only while the server says it is on and says
  // what it renews at. Next-update Pro features are labelled as such.
  const pro = readFileSync(join(dir, 'ProSection.jsx'), 'utf8');
  assert.doesNotMatch(pro, /not available to buy yet|Planned pricing|Razorpay|webPasses|to="\/pro"/i);
  assert.match(pro, /PlayStoreCta placement="pro" label="Get Vittova Pro in the app"/);
  assert.match(pro, /'₹49'[\s\S]*\/month/);
  assert.match(pro, /'₹449'[\s\S]*\/year/);
  assert.match(pro, /!NEXT_UPDATE_LIVE && <p[^>]*>Coming to Pro in the next app update/);
  assert.match(pro, /offerOn && period === 'yearly'/);
  assert.match(pro, /₹199<\/span> for the first year, then ₹449\/year/);
  assert.doesNotMatch(pro, /student|₹29|₹249|countdown|ends (today|tonight)/i);
  const plans = readFileSync(join(here, '..', '..', 'backend/lib/billingPlans.js'), 'utf8');
  for (const price of ['₹49 / month', '₹449 / year', '₹199 first year, then ₹449 / year']) assert.ok(plans.includes(price), price);
  // No sign-in or purchase on the website, and every example screen is labelled.
  assert.doesNotMatch(text, /checkout|pay now|buy now|upgrade to pro|to="\/login"|to="\/signup"/i);
  assert.match(readFileSync(join(dir, 'Faq.jsx'), 'utf8'), /Can I buy Pro on this website\?[\s\S]*No\./);
  assert.match(readFileSync(join(dir, 'Mocks.jsx'), 'utf8'), /Example figures/);
  // The demo is labelled as an example everywhere it appears.
  assert.match(readFileSync(join(dir, 'AffordDemo.jsx'), 'utf8'), /Example month/);
});
