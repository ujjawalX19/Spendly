// A password-reset link must open the set-password form on the web.
//
// REGRESSION: the app waited for supabase-js's PASSWORD_RECOVERY event, which
// the PKCE flow never emits (it emits SIGNED_IN). The reset page then called
// the link invalid and the now signed-in user was sent to the app instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isPasswordRecoveryUrl, isRecoveryReturn } from '../src/lib/authRedirects.js';

test('a web reset link is recognised as a recovery, with or without a trailing slash', () => {
  assert.equal(isPasswordRecoveryUrl('https://vittova.in/reset-password?code=abc123'), true);
  assert.equal(isPasswordRecoveryUrl('https://vittova.in/reset-password/?code=abc123'), true);
  assert.equal(isPasswordRecoveryUrl('http://localhost:5173/reset-password?code=abc&next=%2Fdash'), true);
  assert.equal(isPasswordRecoveryUrl('https://vittova.in/reset-password?type=recovery'), true);
});

test('the older implicit-flow fragment is still recognised, on any path', () => {
  assert.equal(isPasswordRecoveryUrl('https://vittova.in/#access_token=x&type=recovery'), true);
  assert.equal(isPasswordRecoveryUrl('https://vittova.in/reset-password#type=recovery&access_token=x'), true);
});

test('ordinary pages and other auth callbacks are not treated as a recovery', () => {
  for (const url of [
    'https://vittova.in/',
    'https://vittova.in/dash',
    'https://vittova.in/auth/callback?code=abc123',
    'https://vittova.in/reset-password',
    'https://vittova.in/reset-passwords?code=abc',
    'https://vittova.in/#type=signup',
    'not a url',
  ]) {
    assert.equal(isPasswordRecoveryUrl(url), false, url);
  }
});

// Supabase falls back to the Site URL when a redirect URL is not allow-listed,
// so the link can land on "/" with the code instead of /reset-password.
test('a code on the home page counts as a recovery only for a browser that just asked for one', () => {
  const now = Date.UTC(2026, 8, 26, 12, 0, 0);
  const minutesAgo = (n) => now - n * 60_000;
  const home = 'https://vittova.in/?code=abc123';

  assert.equal(isRecoveryReturn(home, minutesAgo(2), now), true);
  assert.equal(isRecoveryReturn(home, minutesAgo(59), now), true);
  assert.equal(isRecoveryReturn(home, minutesAgo(61), now), false, 'stale request');
  assert.equal(isRecoveryReturn(home, null, now), false, 'never asked here');
  assert.equal(isRecoveryReturn(home, now + 60_000, now), false, 'clock moved backwards');
  assert.equal(isRecoveryReturn('https://vittova.in/dash', minutesAgo(2), now), false, 'no code');
  assert.equal(isRecoveryReturn('https://vittova.in/auth/callback?code=abc', minutesAgo(2), now), false, 'Google sign-in return');
  assert.equal(isRecoveryReturn('https://vittova.in/auth/app-callback?code=abc', minutesAgo(2), now), false, 'Android hand-off');
  // The explicit reset URL always counts, request marker or not.
  assert.equal(isRecoveryReturn('https://vittova.in/reset-password?code=abc', null, now), true);
});
