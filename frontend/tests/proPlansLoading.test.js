// The Pro screen must always say what is happening with the plans: loading,
// shown, or why not. On the first Play build the billing plugin never loaded
// (Google's library refused its settings) and the screen showed no plans, no
// button and no message.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { plansFailureCode, plansFailureMessage } from '../src/lib/billingPlan.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, '..', p), 'utf8');

test('the billing client is built with the settings Google Play requires', () => {
  const plugin = read('android/app/src/main/java/com/vittova/app/PlayBillingPlugin.java');
  // Play Billing throws "Pending purchases for one-time products must be
  // supported" from build() without enableOneTimeProducts(), subscriptions-only or not.
  assert.match(plugin, /PendingPurchasesParams\.newBuilder\(\)\.enableOneTimeProducts\(\)\.enablePrepaidPlans\(\)\.build\(\)/);
  assert.match(plugin, /\.enablePendingPurchases\(pendingPurchases\(\)\)/);
  // A set-up failure no longer takes the plugin down: calls answer with a code.
  assert.match(plugin, /catch \(RuntimeException e\) \{[\s\S]{0,300}client = null;/);
  assert.match(plugin, /if \(client == null\) \{\s*call\.reject\("[^"]+", "SETUP_FAILED"\);/);
});

test('a failed plan load becomes a short code, never the error text', () => {
  assert.equal(plansFailureCode({ code: '3', message: 'Billing service unavailable on device.' }), 'play_3');
  assert.equal(plansFailureCode({ code: '-1' }), 'play_m1');
  assert.equal(plansFailureCode({ code: 'UNIMPLEMENTED', message: '"PlayBilling" plugin is not implemented on android' }), 'no_bridge');
  assert.equal(plansFailureCode({ code: 'SETUP_FAILED' }), 'no_bridge');
  assert.equal(plansFailureCode({ status: 503, data: {} }), 'server_503');
  assert.equal(plansFailureCode(new Error('anything at all')), 'unknown');
  assert.equal(plansFailureCode(null), 'unknown');
  for (const e of [{ code: '5', message: 'secret debug text' }, { status: 500, message: 'stack trace' }, new Error('boom')]) {
    assert.match(plansFailureCode(e), /^[a-z0-9_]{1,20}$/);
  }
});

test('every failure has plain words', () => {
  for (const code of ['timeout', 'off', 'play_3', 'play_2', 'play_5', 'play_m1', 'server_503', 'no_bridge', 'unknown']) {
    const text = plansFailureMessage(code);
    assert.ok(text.length > 20, code);
    assert.doesNotMatch(text, /BillingClient|exception|undefined|null|plugin/i, code);
  }
  assert.match(plansFailureMessage('play_3'), /signed in to the Play Store/);
  assert.match(plansFailureMessage('timeout'), /didn't answer/);
});

test('the screen shows loading, then plans or the reason, with a way to retry', () => {
  const page = read('src/pages/ProUpgrade.jsx');
  assert.match(page, /Loading plans from Google Play…/);
  assert.match(page, /plansFailureMessage\(plans\.failed\)/);
  assert.match(page, /Code: \{plans\.failed\}/);
  assert.match(page, /onClick=\{\(\) => setAttempt\(\(n\) => n \+ 1\)\}/);
  // The error is no longer swallowed.
  assert.doesNotMatch(page, /\.catch\(\(\) => \{\}\)/);
  assert.match(page, /\.catch\(\(err\) => \{\s*if \(cancelled\) return;\s*setPlans\(\{ failed: plansFailureCode\(err\) \}\);/);
  // And a request that never answers is given up on.
  assert.match(page, /PLANS_TIMEOUT_MS = 15000/);
});
