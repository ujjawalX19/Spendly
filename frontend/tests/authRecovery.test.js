// A password-reset link must open the set-password form on the web.
//
// REGRESSION: the app waited for supabase-js's PASSWORD_RECOVERY event, which
// the PKCE flow never emits (it emits SIGNED_IN). The reset page then called
// the link invalid and the now signed-in user was sent to the app instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isPasswordRecoveryUrl } from '../src/lib/authRedirects.js';

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
