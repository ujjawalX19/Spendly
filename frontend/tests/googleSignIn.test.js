// Native Android Google sign-in: the nonce Supabase checks, what happens on
// each failure, and that nothing secret ships in the app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeNonce, nativeFailureAction, GOOGLE_WEB_CLIENT_ID } from '../src/lib/googleSignIn.js';

const here = dirname(fileURLToPath(import.meta.url));

test('the nonce sent to Google is the SHA-256 of the raw nonce Supabase receives', async () => {
  const a = await makeNonce();
  const b = await makeNonce();
  assert.match(a.raw, /^[0-9a-f]{64}$/);
  assert.equal(a.hashed, createHash('sha256').update(a.raw).digest('hex'));
  assert.notEqual(a.raw, b.raw, 'a fresh nonce every time');
});

test('cancelling stays on the login screen; unavailable native sign-in falls back to the browser', () => {
  assert.equal(nativeFailureAction('CANCELLED'), 'cancelled');
  assert.equal(nativeFailureAction('INTERRUPTED'), 'retry');
  assert.equal(nativeFailureAction('NO_CREDENTIAL'), 'fallback');
  assert.equal(nativeFailureAction('FAILED'), 'fallback');
  assert.equal(nativeFailureAction(undefined), 'fallback');
});

test('only the public Web client id is in the app, never a client secret', () => {
  assert.match(GOOGLE_WEB_CLIENT_ID, /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/);
  for (const file of ['lib/googleSignIn.js', 'contexts/AuthContext.jsx', 'plugins/GoogleAuth.js']) {
    assert.doesNotMatch(readFileSync(join(here, '..', 'src', file), 'utf8'), /GOCSPX-|client_secret/i, file);
  }
});

test('the app signs in with the Google ID token and raw nonce, never with an email or user id from the device', () => {
  const auth = readFileSync(join(here, '..', 'src', 'contexts', 'AuthContext.jsx'), 'utf8');
  assert.match(auth, /signInWithIdToken\(\{ provider: 'google', token: idToken, nonce: nonce\.raw \}\)/);
  assert.match(auth, /GoogleAuth\.signIn\(\{ serverClientId: GOOGLE_WEB_CLIENT_ID, nonce: nonce\.hashed \}\)/);
  // Logging out also clears the Credential Manager choice.
  assert.match(auth, /GoogleAuth\.signOut\(\)/);
});
