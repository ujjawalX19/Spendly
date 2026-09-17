import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SUPPORTED_PAYMENT_APPS } from '../src/lib/supportedPaymentApps.js';

const here = dirname(fileURLToPath(import.meta.url));
const parserSource = readFileSync(
  join(here, '../android/app/src/main/java/com/vittova/app/PaymentNotificationParser.java'),
  'utf8'
);

function javaAllowlist() {
  const block = /KNOWN_PACKAGES\s*=\s*\{([\s\S]*?)\};/.exec(parserSource);
  assert.ok(block, 'KNOWN_PACKAGES not found in PaymentNotificationParser.java');
  return [...block[1].matchAll(/\{\s*"([^"]+)"\s*,\s*"[^"]+"\s*\}/g)].map((m) => m[1]).sort();
}

test('the app list shown to users matches the Android allowlist exactly', () => {
  const shown = SUPPORTED_PAYMENT_APPS.map((a) => a.packageName).sort();
  assert.deepEqual(shown, javaAllowlist());
});

test('messaging, social, email and shopping apps are not in the allowlist', () => {
  const allowed = new Set(javaAllowlist());
  for (const pkg of [
    'com.whatsapp', 'com.whatsapp.w4b', 'org.telegram.messenger', 'com.instagram.android',
    'com.google.android.apps.messaging', 'com.google.android.gm', 'com.facebook.orca',
    'com.amazon.mShop.android.shopping', 'in.amazon.mShop.android.shopping', 'com.jio.myjio',
  ]) {
    assert.ok(!allowed.has(pkg), `${pkg} must not be monitored`);
  }
});
