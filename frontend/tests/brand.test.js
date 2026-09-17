// Guards the Vittova rebrand: "Spendly" may appear in client code only as a
// documented legacy technical identifier (see REBRAND_VITTOVA.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const frontend = join(here, '..');

const ROOTS = ['src', 'admin/src', 'admin/index.html', 'index.html', 'public/manifest.json', 'capacitor.config.json',
  'android/app/src/main/res/values', 'android/app/src/main/AndroidManifest.xml'];

// Intentional legacy identifiers that must not change.
const ALLOWED = [
  /spendly:\/\//g, // auth deep-link scheme
  /NATIVE_SCHEME = 'spendly'/g,
  /android:scheme="spendly"/g,
  /spendly\.(seenPayments|notificationPrompt|recovery|onboarded)(\.v1)?/g, // on-device storage keys
  /spendly-t8s6\.onrender\.com/g, // Render service hostname
  /"name": "spendly-app"/g,
];

function walk(p, out = []) {
  const full = join(frontend, p);
  if (statSync(full).isDirectory()) {
    for (const name of readdirSync(full)) walk(join(p, name), out);
  } else if (/\.(jsx?|html|json|xml)$/.test(full)) {
    out.push(full);
  }
  return out;
}

test('no user-facing Spendly branding remains in the app or admin console', () => {
  const offenders = [];
  for (const file of ROOTS.flatMap((r) => walk(r))) {
    let text = readFileSync(file, 'utf8');
    for (const re of ALLOWED) text = text.replace(re, '');
    text.split('\n').forEach((line, i) => {
      if (/spendly/i.test(line)) offenders.push(`${relative(frontend, file)}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, []);
});

test('Android app label is Vittova and the package id is com.vittova.app', () => {
  const strings = readFileSync(join(frontend, 'android/app/src/main/res/values/strings.xml'), 'utf8');
  assert.match(strings, /<string name="app_name">Vittova<\/string>/);
  assert.match(strings, /<string name="package_name">com\.vittova\.app<\/string>/);
  const gradle = readFileSync(join(frontend, 'android/app/build.gradle'), 'utf8');
  assert.match(gradle, /namespace = "com\.vittova\.app"/);
  assert.match(gradle, /applicationId "com\.vittova\.app"/);
  assert.ok(statSync(join(frontend, 'android/app/src/main/java/com/vittova/app/MainActivity.java')).isFile());
  const cap = JSON.parse(readFileSync(join(frontend, 'capacitor.config.json'), 'utf8'));
  assert.equal(cap.appId, 'com.vittova.app');
  assert.equal(cap.appName, 'Vittova');
});
