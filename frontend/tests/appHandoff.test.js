// The Android sign-in hand-off page forwards only a one-time code or an error
// to the Vittova app, and never interferes with a sign-in started on the web.
import test from 'node:test';
import assert from 'node:assert/strict';
import { appHandoff } from '../src/lib/appHandoff.js';

const ANDROID = 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36';
const CODE = '3f1c2a9e-7b5d-4c1e-9a0f-1234567890ab';
const cb = (q) => `https://vittova.in/auth/callback${q}`;

test('app sign-in on Android hands the code to the Vittova app only', () => {
  const r = appHandoff(cb(`?code=${CODE}`), { hasVerifier: false, userAgent: ANDROID });
  assert.equal(r.appUrl, `spendly://login-callback?code=${CODE}`);
  assert.equal(r.intentUrl, `intent://login-callback?code=${CODE}#Intent;scheme=spendly;package=com.vittova.app;end`);
});

test('a sign-in started on the website is left to the website', () => {
  assert.equal(appHandoff(cb(`?code=${CODE}`), { hasVerifier: true, userAgent: ANDROID }), null);
});

test('desktop browsers never try to open the app', () => {
  assert.equal(appHandoff(cb(`?code=${CODE}`), { hasVerifier: false, userAgent: DESKTOP }), null);
});

test('malformed codes are not forwarded', () => {
  for (const bad of ['short', 'abc#Intent;scheme=evil;end', 'a b c d e f g h', 'x'.repeat(600)]) {
    assert.equal(appHandoff(cb(`?code=${encodeURIComponent(bad)}`), { hasVerifier: false, userAgent: ANDROID }), null, bad);
  }
});

test('tokens in the URL are never forwarded', () => {
  const r = appHandoff(cb(`?code=${CODE}&access_token=secret#refresh_token=secret`), { hasVerifier: false, userAgent: ANDROID });
  assert.doesNotMatch(r.intentUrl, /token|secret/);
  assert.equal(appHandoff(cb('#access_token=secret&refresh_token=secret'), { hasVerifier: false, userAgent: ANDROID }), null);
});

test('a cancelled sign-in reaches the app as an error it can explain', () => {
  const r = appHandoff(cb('?error=access_denied&error_code=bad&error_description=User+cancelled'), { hasVerifier: false, userAgent: ANDROID });
  assert.equal(r.appUrl, 'spendly://login-callback?error=access_denied&error_code=bad');
  assert.equal(appHandoff(cb('?error=%3Cscript%3E'), { hasVerifier: false, userAgent: ANDROID }), null);
});

test('a plain visit does nothing', () => {
  assert.equal(appHandoff(cb(''), { hasVerifier: false, userAgent: ANDROID }), null);
});
