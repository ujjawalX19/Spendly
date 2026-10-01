// Google sign-in on Android happens inside the app: Google's account sheet →
// Google ID token → supabase.auth.signInWithIdToken. No browser, except on a
// phone with no Google Play services. Every failure is reported as what it is;
// in particular a build Google refuses is never mistaken for the user
// cancelling (that mistake made "Continue with Google" silently do nothing).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  makeNonce, nativeFailureAction, nativeFailureMessage, nativeFailureCode, GOOGLE_WEB_CLIENT_ID,
} from '../src/lib/googleSignIn.js';
import { singleFlight } from '../src/lib/singleFlight.js';
import { APP_CALLBACK_PATH, WEB_ORIGIN, NATIVE_SCHEME, NATIVE_HOSTS } from '../src/lib/authRedirects.js';
import { handoffFor, APP_PACKAGE, APP_LOGIN_URL } from '../public/auth/app-callback.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = (p) => readFileSync(join(root, 'src', p), 'utf8');
const java = (f) => readFileSync(join(root, 'android/app/src/main/java/com/vittova/app', f), 'utf8');
const auth = src('contexts/AuthContext.jsx');
const native = auth.slice(auth.indexOf('const nativeGoogleSignIn'), auth.indexOf('const startGoogleSignIn'));
const start = auth.slice(auth.indexOf('const startGoogleSignIn'), auth.indexOf('const [loginWithGoogle]'));

test('the nonce sent to Google is the SHA-256 of the raw nonce Supabase receives', async () => {
  const a = await makeNonce();
  const b = await makeNonce();
  assert.match(a.raw, /^[0-9a-f]{64}$/);
  assert.equal(a.hashed, createHash('sha256').update(a.raw).digest('hex'));
  assert.notEqual(a.raw, b.raw);
});

test('Android signs in inside the app: ID token and raw nonce to Supabase, nothing else trusted', () => {
  assert.match(native, /GoogleAuth\.signIn\(\{ serverClientId: GOOGLE_WEB_CLIENT_ID, nonce: nonce\.hashed \}\)/);
  assert.match(native, /signInWithIdToken\(\{ provider: 'google', token: idToken, nonce: nonce\.raw \}\)/);
  // The native flow itself never opens a browser.
  assert.doesNotMatch(native, /Browser\.open|signInWithOAuth/);
  // Android tries the in-app sheet first.
  assert.ok(start.indexOf('nativeGoogleSignIn()') < start.indexOf('browserGoogleSignIn()'));
  assert.match(start, /Capacitor\.getPlatform\(\) === 'android'/);
});

test('only a phone without Google Play services ever gets the browser', () => {
  assert.equal(nativeFailureAction('UNSUPPORTED'), 'browser');
  for (const code of ['OAUTH_CONFIGURATION_ERROR', 'NETWORK_ERROR', 'GOOGLE_AUTH_FAILED', 'SOMETHING_NEW', undefined]) {
    assert.notEqual(nativeFailureAction(code), 'browser', String(code));
  }
  assert.notEqual(nativeFailureAction('USER_CANCELLED'), 'browser');
  // In the code: the native result is final unless it is exactly "browser".
  assert.match(native, /if \(action === 'browser'\) return null;/);
  assert.equal(auth.match(/Browser\.open\(/g).length, 1, 'the browser tab is opened in exactly one place');
});

test('a real cancellation is silent; a refused build says so', () => {
  assert.equal(nativeFailureAction('USER_CANCELLED'), 'cancelled');
  assert.match(native, /if \(action === 'cancelled'\) return \{ success: false, cancelled: true \};/);

  assert.equal(nativeFailureAction('OAUTH_CONFIGURATION_ERROR'), 'message');
  const msg = nativeFailureMessage('OAUTH_CONFIGURATION_ERROR');
  assert.match(msg, /isn't available in this version/);
  assert.match(msg, /email and password/);
  // Never Google's or the console's wording.
  assert.doesNotMatch(msg, /SHA|OAuth|console|UNREGISTERED|reauth/i);

  assert.match(nativeFailureMessage('NETWORK_ERROR'), /internet connection/);
  assert.match(nativeFailureMessage('GOOGLE_AUTH_FAILED'), /couldn't be completed/);
  assert.match(nativeFailureMessage(undefined), /couldn't be completed/);
});

test('the native plugin reads Google\'s real status, so "refused" and "cancelled" differ', () => {
  const plugin = java('GoogleAuthPlugin.java');
  // Google's Identity sign-in intent, read from the result even when cancelled.
  assert.match(plugin, /getSignInIntent\(request\)/);
  assert.match(plugin, /getSignInCredentialFromIntent\(data\)/);
  assert.match(plugin, /GoogleAuthErrors\.classify\(api\.getStatusCode\(\), api\.getMessage\(\)\)/);
  // Not androidx Credential Manager, which reports every cancellation the same.
  assert.doesNotMatch(plugin, /^import androidx\.credentials/m);
  // Only the token leaves the plugin; the trail holds a code and a number.
  assert.match(plugin, /out\.put\("idToken", idToken\)/);
  assert.doesNotMatch(plugin, /trail\([^)]*(idToken|getMessage|getDisplayName|getId\(\))/);
});

test('the web layer understands every code the plugin can send', () => {
  const codes = [...java('GoogleAuthErrors.java').matchAll(/static final String \w+ = "([A-Z_]+)";/g)].map((m) => m[1]);
  assert.deepEqual(codes.sort(), ['GOOGLE_AUTH_FAILED', 'NETWORK_ERROR', 'OAUTH_CONFIGURATION_ERROR', 'UNSUPPORTED', 'USER_CANCELLED']);
  assert.deepEqual(codes.filter((c) => nativeFailureAction(c) === 'cancelled'), ['USER_CANCELLED']);
  for (const c of codes) assert.match(nativeFailureCode(c), /^[a-z0-9_]{1,40}$/);
  assert.equal(nativeFailureCode('OAUTH_CONFIGURATION_ERROR'), 'native_oauth_client_mismatch');
});

test('only the public Web client id is in the app, never a client secret', () => {
  assert.match(GOOGLE_WEB_CLIENT_ID, /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/);
  for (const file of ['lib/googleSignIn.js', 'contexts/AuthContext.jsx', 'plugins/GoogleAuth.js', 'lib/supabaseClient.js']) {
    assert.doesNotMatch(src(file), /GOCSPX-|client_secret|service_role/i, file);
  }
});

test('there is one Supabase client and one session', () => {
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(join(root, 'src', dir), { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name));
      else if (/\.(js|jsx)$/.test(e.name)) files.push(join(dir, e.name).replace(/\\/g, '/'));
    }
  };
  walk('.');
  assert.deepEqual(files.filter((f) => /createClient\(/.test(src(f)) && !f.startsWith('admin/')), ['lib/supabaseClient.js']);
  // Auth state comes from Supabase only: one listener, no auth flag of our own.
  assert.deepEqual(files.filter((f) => /onAuthStateChange\(/.test(src(f))), ['contexts/AuthContext.jsx']);
  assert.doesNotMatch(auth, /localStorage\.setItem\([^)]*(isLoggedIn|loggedIn|authenticated)/i);
  // The native plugin returns a token and keeps no session of its own.
  assert.doesNotMatch(java('GoogleAuthPlugin.java'), /SharedPreferences|getSharedPreferences/);
});

test('the browser return path (website, and phones without Play services) is unchanged', () => {
  assert.equal(`${WEB_ORIGIN}${APP_CALLBACK_PATH}`, 'https://vittova.in/auth/app-callback');
  assert.equal(APP_LOGIN_URL, `${NATIVE_SCHEME}://${NATIVE_HOSTS.login}`);
  assert.equal(APP_PACKAGE, 'com.vittova.app');
  const manifest = readFileSync(join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  assert.equal(manifest.match(/<data android:scheme=/g).length, 2, 'only the two auth deep links');
  const ok = handoffFor('https://vittova.in/auth/app-callback?code=abcDEF123456-_.~');
  assert.equal(ok.kind, 'code');
  assert.equal(handoffFor('https://vittova.in/auth/app-callback#access_token=aaa&refresh_token=bbb'), null);
  assert.equal(handoffFor('https://vittova.in/auth/app-callback?code=<script>'), null);
});

test('one Google sign-in at a time: a second tap opens nothing new', async () => {
  let started = 0;
  let busy = 0;
  let finish;
  const run = singleFlight(() => { started++; return new Promise((r) => { finish = r; }); }, () => { busy++; });
  const first = run();
  const second = run();
  await Promise.resolve();
  assert.equal(started, 1, 'only one attempt starts');
  assert.equal(busy, 1);
  finish({ success: true });
  assert.deepEqual(await first, { success: true });
  assert.deepEqual(await second, { success: true });
  const again = run();
  await Promise.resolve();
  assert.equal(started, 2, 'settled: the next tap is a new attempt');
  finish({ success: false });
  await again;
  const failing = singleFlight(() => Promise.reject(new Error('x')));
  await assert.rejects(failing());
  await assert.rejects(failing());
});

test('logging out ends the session and never deletes the account', () => {
  const logout = auth.slice(auth.indexOf('const logout = async'));
  assert.match(logout, /supabase\.auth\.signOut\(\{ scope \}\)/);
  assert.match(logout, /GoogleAuth\.signOut\(\)/);
  assert.match(logout, /setSession\(null\)/);
  assert.doesNotMatch(logout.slice(0, logout.indexOf('setSession(null)')), /account\/delete|deleteAccount|method: 'DELETE'/);
});
