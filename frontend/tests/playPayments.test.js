import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { paymentChannel } from '../src/lib/distribution.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, '..', p), 'utf8');

test('each build sells Pro one way only', () => {
  assert.equal(paymentChannel({ native: true, platform: 'android' }, 'play'), 'play');
  assert.equal(paymentChannel({ native: true, platform: 'android' }, 'indus'), 'razorpay');
  assert.equal(paymentChannel({ native: false, platform: 'web' }, 'play'), 'none'); // the website sells nothing
});

test('the Play app does not describe other ways to pay', () => {
  const terms = read('src/pages/TermsOfService.jsx');
  const open = terms.indexOf('{!isPlayApp() && <>');
  assert.ok(open > 0 && open < terms.indexOf('In the Vittova app from the Indus Appstore'));
  assert.ok(terms.indexOf('</>}') > terms.indexOf('that pass ends.'));
  const privacy = read('src/pages/PrivacyPolicy.jsx');
  assert.match(privacy, /\{!isPlayApp\(\) && <li><strong className="text-ink">Razorpay/);
  assert.match(privacy, /\{!isPlayApp\(\) && ' In the app from the Indus Appstore/);
  // The homepage, with its pass wording, is never shown in the app.
  assert.match(read('src/App.jsx'), /Capacitor\.isNativePlatform\(\)\s*\? <ProtectedRoute><Navigate to="\/dash"/);
});

test('sign-out clears choices that belong to the account', () => {
  const auth = read('src/contexts/AuthContext.jsx');
  for (const key of ['vittova.home.v1', 'vittova.widget.amount']) assert.ok(auth.includes(`'${key}'`), key);
  assert.match(auth, /await clearHomeWidget\(\);/);
  assert.match(auth, /await clearAlertsForSignOut\(\);/);
});
