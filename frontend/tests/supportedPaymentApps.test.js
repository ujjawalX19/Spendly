import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SUPPORTED_PAYMENT_APPS } from '../src/lib/supportedPaymentApps.js';

const here = dirname(fileURLToPath(import.meta.url));
const javaDir = join(here, '../android/app/src');
const sourcesJava = readFileSync(join(javaDir, 'main/java/com/vittova/app/PaymentSources.java'), 'utf8');

/** [package, type] rows of PaymentSources.KNOWN_PACKAGES. */
function javaAllowlist() {
  const block = /KNOWN_PACKAGES\s*=\s*\{([\s\S]*?)\};/.exec(sourcesJava);
  assert.ok(block, 'KNOWN_PACKAGES not found in PaymentSources.java');
  return [...block[1].matchAll(/\{\s*"([^"]+)"\s*,\s*"[^"]+"\s*,\s*"(UPI|BANK)"\s*\}/g)].map((m) => [m[1], m[2]]);
}

test('the app list shown to users matches the Android allowlist exactly', () => {
  const shown = SUPPORTED_PAYMENT_APPS.map((a) => a.packageName).sort();
  assert.deepEqual(shown, javaAllowlist().map(([pkg]) => pkg).sort());
});

test('each app is described to users as the same kind of app Android treats it as', () => {
  const types = new Map(javaAllowlist());
  for (const app of SUPPORTED_PAYMENT_APPS) {
    assert.equal(types.get(app.packageName), app.type === 'Bank app' ? 'BANK' : 'UPI', app.name);
  }
});

test('messaging, social, email and shopping apps are not in the allowlist', () => {
  const allowed = new Set(javaAllowlist().map(([pkg]) => pkg));
  for (const pkg of [
    'com.whatsapp', 'com.whatsapp.w4b', 'org.telegram.messenger', 'com.instagram.android',
    'com.google.android.apps.messaging', 'com.google.android.gm', 'com.facebook.orca',
    'com.amazon.mShop.android.shopping', 'in.amazon.mShop.android.shopping', 'com.jio.myjio',
  ]) {
    assert.ok(!allowed.has(pkg), `${pkg} must not be monitored`);
  }
});

test('the adb test source and pipeline logging exist only in debug builds', () => {
  const release = readFileSync(join(javaDir, 'release/java/com/vittova/app/DebugFeatures.java'), 'utf8');
  const debug = readFileSync(join(javaDir, 'debug/java/com/vittova/app/DebugFeatures.java'), 'utf8');
  assert.match(release, /EXTRA_SOURCES = \{\};/);
  assert.match(release, /PIPELINE_LOG = false;/);
  assert.doesNotMatch(release, /com\.android\.shell/);
  // The debug build adds exactly the adb shell, nothing else.
  assert.deepEqual([...debug.matchAll(/\{\s*"([^"]+)"/g)].map((m) => m[1]), ['com.android.shell']);
});
