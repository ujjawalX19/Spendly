// The Android app's sign-in return page (public/auth/app-callback.*) and the
// messages the app shows when a callback cannot complete.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handoffFor } from '../public/auth/app-callback.js';
import { loginCallbackFailure, isGoogleSignInPending, GOOGLE_PENDING_MAX_AGE_MS } from '../src/lib/authCallbackOutcome.js';

const here = dirname(fileURLToPath(import.meta.url));
const CODE = '3f1c2a9e-7b5d-4c1e-9a0f-1234567890ab';
const page = (q) => `https://vittova.in/auth/app-callback${q}`;

test('a code is handed only to the Vittova app, by package', () => {
  const r = handoffFor(page(`?code=${CODE}`));
  assert.equal(r.kind, 'code');
  assert.equal(r.appUrl, `spendly://login-callback?code=${CODE}`);
  assert.equal(r.intentUrl, `intent://login-callback?code=${CODE}#Intent;scheme=spendly;package=com.vittova.app;end`);
});

test('no user-agent or storage guess: the page is only the app\'s return address', () => {
  // The old /auth/callback hand-off needed "Android" and "no verifier"; this one does not.
  assert.equal(handoffFor(page(`?code=${CODE}`)).kind, 'code');
});

test('Supabase errors reach the app (query or fragment), descriptions never do', () => {
  const q = handoffFor(page('?error=server_error&error_code=unexpected_failure&error_description=Unable+to+exchange+external+code'));
  assert.equal(q.kind, 'error');
  assert.equal(q.appUrl, 'spendly://login-callback?error=server_error&error_code=unexpected_failure');
  const h = handoffFor(page('#error=access_denied&error_code=bad_oauth_state&error_description=x'));
  assert.equal(h.appUrl, 'spendly://login-callback?error=access_denied&error_code=bad_oauth_state');
});

test('malformed codes, injection attempts and tokens are never forwarded', () => {
  for (const bad of ['short', 'abc#Intent;scheme=evil;package=x;end', 'a b c d e f g h', 'x'.repeat(600)]) {
    assert.equal(handoffFor(page(`?code=${encodeURIComponent(bad)}`)), null, bad);
  }
  assert.equal(handoffFor(page('#access_token=secret&refresh_token=secret')), null);
  const withToken = handoffFor(page(`?code=${CODE}&access_token=secret#refresh_token=secret`));
  assert.doesNotMatch(withToken.intentUrl, /token|secret/);
  assert.equal(handoffFor(page('?error=%3Cscript%3E')), null);
  assert.equal(handoffFor(page('')), null);
});

test('the page strips the code from the address bar and ships strict headers', () => {
  const js = readFileSync(join(here, '../public/auth/app-callback.js'), 'utf8');
  assert.match(js, /history\.replaceState\(null, '', window\.location\.pathname\)/);
  const html = readFileSync(join(here, '../public/auth/app-callback.html'), 'utf8');
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
  assert.doesNotMatch(html, /<script>(?!<\/script>)/, 'no inline script (CSP script-src self)');
  const vercel = JSON.parse(readFileSync(join(here, '../vercel.json'), 'utf8'));
  const rewriteIndex = vercel.rewrites.findIndex((r) => r.source === '/auth/app-callback');
  assert.ok(rewriteIndex >= 0 && rewriteIndex < vercel.rewrites.findIndex((r) => r.source === '/(.*)'), 'rewrite before the SPA catch-all');
  const headers = vercel.headers.find((h) => h.source === '/auth/app-callback(.*)').headers;
  const get = (k) => headers.find((h) => h.key === k)?.value || '';
  assert.equal(get('Referrer-Policy'), 'no-referrer');
  assert.equal(get('Cache-Control'), 'no-store');
  assert.match(get('Content-Security-Policy'), /default-src 'none'; script-src 'self'/);
});

test('Google failures say what happened and how to recover', () => {
  assert.deepEqual(loginCallbackFailure({ google: true, error: 'access_denied' }),
    { message: 'Google sign-in was cancelled.', code: 'google_cancelled' });
  assert.deepEqual(loginCallbackFailure({ google: true, error: 'server_error', errorCode: 'unexpected_failure' }),
    { message: "Google sign-in couldn't be completed. Please try again.", code: 'google_unexpected_failure' });
  assert.equal(loginCallbackFailure({ google: true, exchangeError: { message: 'PKCE code verifier not found in storage' } }).code, 'google_missing_verifier');
  assert.equal(loginCallbackFailure({ google: true, exchangeError: { message: 'invalid flow state' } }).message, "Google sign-in couldn't be completed. Please try again.");
  assert.equal(loginCallbackFailure({ google: true, invalidLink: true }).code, 'google_invalid_callback');
});

test('email-confirmation links keep their own wording', () => {
  assert.match(loginCallbackFailure({ google: false, errorCode: 'otp_expired', error: 'access_denied' }).message, /expired/);
  assert.match(loginCallbackFailure({ google: false, exchangeError: { message: 'code verifier missing' } }).message, /same device/);
  assert.match(loginCallbackFailure({ google: false, invalidLink: true }).message, /not valid/);
});

test('telemetry reason codes are short snake_case', () => {
  const { code } = loginCallbackFailure({ google: true, error: 'Server Error!', errorCode: null });
  assert.match(code, /^[a-z0-9_]{1,40}$/);
});

test('a Google sign-in counts as pending for 15 minutes only', () => {
  const now = 1_000_000_000_000;
  assert.equal(isGoogleSignInPending(now - 1000, now), true);
  assert.equal(isGoogleSignInPending(now - GOOGLE_PENDING_MAX_AGE_MS, now), false);
  assert.equal(isGoogleSignInPending(null, now), false);
  assert.equal(isGoogleSignInPending('garbage', now), false);
});
