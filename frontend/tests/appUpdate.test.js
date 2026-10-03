// Required updates: a build below the server's minimum must update through
// Google Play. Nothing else is ever blocked, and a bad or missing answer from
// the server never locks anyone out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { effectiveMinimum, minFromConfig, updateRequired, MIN_VERSION_KEY } from '../src/lib/appUpdate.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, '..', p), 'utf8');

test('only a build below the minimum is blocked', () => {
  assert.equal(updateRequired(25, 26), true);
  assert.equal(updateRequired('25', '26'), true);
  assert.equal(updateRequired(26, 26), false);
  assert.equal(updateRequired(27, 26), false);
  // No minimum set: nobody is blocked.
  assert.equal(updateRequired(1, 0), false);
});

test('an unknown build number or a nonsense minimum blocks nobody', () => {
  for (const current of [undefined, null, '', 'abc', 0, -3, NaN]) assert.equal(updateRequired(current, 99), false, String(current));
  for (const min of [undefined, null, '', 'abc', '1e999', '30abc', 30.5, -1, NaN, Infinity, 1.5e300]) assert.equal(updateRequired(25, min), false, String(min));
  assert.equal(minFromConfig({ android: { minSupportedVersionCode: 26 } }), 26);
  for (const body of [null, {}, { android: {} }, { android: { minSupportedVersionCode: 'x' } }, { android: { minSupportedVersionCode: -2 } }]) {
    assert.equal(minFromConfig(body), 0);
  }
});

test('offline or a sleeping server: the last known minimum applies, and with none the app opens', () => {
  assert.equal(effectiveMinimum({ ok: true, body: { android: { minSupportedVersionCode: 30 } } }, '26'), 30);
  // The server answered "no minimum": a remembered block is lifted.
  assert.equal(effectiveMinimum({ ok: true, body: { android: { minSupportedVersionCode: 0 } } }, '26'), 0);
  assert.equal(effectiveMinimum({ ok: false }, '26'), 26);
  assert.equal(effectiveMinimum({ ok: false }, null), 0);
  assert.equal(effectiveMinimum({ ok: false }, 'garbage'), 0);
  assert.equal(MIN_VERSION_KEY, 'vittova.minSupportedVersionCode');
});

test('the update screen: Google Play does the update, one automatic attempt, never a loop', () => {
  const gate = read('src/components/UpdateGate.jsx');
  // Android app only, and nothing is shown unless an update is required.
  assert.match(gate, /if \(!isAndroidApp\(\)\) return undefined;/);
  assert.match(gate, /if \(!required\) return null;/);
  // Google Play's immediate update; its store page only from a tap.
  assert.match(gate, /AppUpdate\.startImmediate\(\)/);
  assert.match(gate, /if \(fromTap\) await AppUpdate\.openStore\(\)/);
  // One automatic attempt.
  assert.match(gate, /if \(!required \|\| asked\.current\) return;\s*asked\.current = true;\s*update\(false\);/);
  // No timers or intervals retrying the update.
  assert.doesNotMatch(gate, /setInterval/);
  // The app never downloads or installs a file itself.
  const plugin = read('android/app/src/main/java/com/vittova/app/AppUpdatePlugin.java');
  assert.doesNotMatch(gate + plugin, /\.apk|DownloadManager|REQUEST_INSTALL_PACKAGES|PackageInstaller/);
  assert.match(plugin, /AppUpdateOptions\.newBuilder\(AppUpdateType\.IMMEDIATE\)/);
  assert.match(plugin, /DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS/);
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.doesNotMatch(manifest, /REQUEST_INSTALL_PACKAGES/);
  // Mounted once, and the plugin is registered.
  assert.equal(read('src/App.jsx').match(/<UpdateGate \/>/g).length, 1);
  assert.match(read('android/app/src/main/java/com/vittova/app/MainActivity.java'), /registerPlugin\(AppUpdatePlugin\.class\);/);
});
