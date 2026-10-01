// Google sign-in is ONE path, the same as v1.0: Supabase's Google URL in a
// browser tab, back through vittova.in/auth/app-callback to
// spendly://login-callback with a one-time PKCE code, exchanged by Supabase.
//
// V1.1 briefly put a native Credential Manager sign-in in front of it. On a
// build whose signing certificate had no Android OAuth client, Google's refusal
// reached the app as an ordinary "cancelled", so login silently did nothing.
// These tests keep the simple path the only path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { singleFlight } from '../src/lib/singleFlight.js';
import { APP_CALLBACK_PATH, WEB_ORIGIN, NATIVE_SCHEME, NATIVE_HOSTS } from '../src/lib/authRedirects.js';
import { handoffFor, APP_PACKAGE, APP_LOGIN_URL } from '../public/auth/app-callback.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = (p) => readFileSync(join(root, 'src', p), 'utf8');
const auth = src('contexts/AuthContext.jsx');

test('Google sign-in is the Supabase browser flow and nothing else', () => {
  assert.match(auth, /supabase\.auth\.signInWithOAuth\(\{\s*provider: 'google'/);
  assert.match(auth, /redirectTo: loginRedirectUrl\(\)/);
  assert.match(auth, /skipBrowserRedirect: isNative\(\)/);
  assert.equal(auth.match(/Browser\.open\(/g).length, 1, 'the browser tab is opened in exactly one place');
  // No second, native sign-in system.
  assert.doesNotMatch(auth, /signInWithIdToken|GoogleAuth|CredentialManager|nativeGoogleSignIn/);
  assert.equal(existsSync(join(root, 'src/plugins/GoogleAuth.js')), false);
  assert.equal(existsSync(join(root, 'src/lib/googleSignIn.js')), false);
});

test('the Android project has no native Google sign-in to misconfigure', () => {
  const java = readdirSync(join(root, 'android/app/src/main/java/com/vittova/app'));
  assert.ok(!java.includes('GoogleAuthPlugin.java'));
  const gradle = readFileSync(join(root, 'android/app/build.gradle'), 'utf8');
  assert.doesNotMatch(gradle, /androidx\.credentials|googleid|play-services-auth/);
  // The log plugin takes no part in signing in.
  const log = readFileSync(join(root, 'android/app/src/main/java/com/vittova/app/AuthLogPlugin.java'), 'utf8');
  assert.deepEqual([...log.matchAll(/@PluginMethod\s+public void (\w+)/g)].map((m) => m[1]), ['logEvent']);
});

test('there is one Supabase client and one session', () => {
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(join(root, 'src', dir), { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name));
      else if (/\.(js|jsx)$/.test(e.name)) files.push(join(dir, e.name));
    }
  };
  walk('.');
  const creators = files.filter((f) => /createClient\(/.test(src(f)) && !f.replace(/\\/g, '/').startsWith('admin/'));
  assert.deepEqual(creators.map((f) => f.replace(/\\/g, '/')), ['lib/supabaseClient.js']);
  // Auth state comes from Supabase only: one listener, no auth flag of our own.
  const listeners = files.filter((f) => /onAuthStateChange\(/.test(src(f)));
  assert.deepEqual(listeners.map((f) => f.replace(/\\/g, '/')), ['contexts/AuthContext.jsx']);
  assert.doesNotMatch(auth, /localStorage\.setItem\([^)]*(isLoggedIn|loggedIn|authenticated)/i);
});

test('the app return address and the deep link are the v1.0 ones', () => {
  assert.equal(`${WEB_ORIGIN}${APP_CALLBACK_PATH}`, 'https://vittova.in/auth/app-callback');
  assert.equal(APP_LOGIN_URL, `${NATIVE_SCHEME}://${NATIVE_HOSTS.login}`);
  assert.equal(APP_PACKAGE, 'com.vittova.app');
  const manifest = readFileSync(join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  assert.match(manifest, /android:scheme="spendly" android:host="login-callback"/);
  assert.match(manifest, /android:scheme="spendly" android:host="reset-password"/);
  // No broader link filter (https hosts, wildcards) that another page could trigger.
  assert.equal(manifest.match(/<data android:scheme=/g).length, 2);
});

test('the return page hands the app only a one-time code, addressed to the app', () => {
  const ok = handoffFor('https://vittova.in/auth/app-callback?code=abcDEF123456-_.~');
  assert.equal(ok.kind, 'code');
  assert.equal(ok.appUrl, 'spendly://login-callback?code=abcDEF123456-_.%7E');
  assert.match(ok.intentUrl, /package=com\.vittova\.app;end$/);
  // Tokens in the URL are never forwarded.
  const tokens = handoffFor('https://vittova.in/auth/app-callback#access_token=aaa&refresh_token=bbb');
  assert.equal(tokens, null);
  // Google "access_denied" (the user pressed Cancel on Google's page).
  assert.equal(handoffFor('https://vittova.in/auth/app-callback?error=access_denied').kind, 'error');
  // Invalid callback.
  assert.equal(handoffFor('https://vittova.in/auth/app-callback?code=<script>'), null);
  assert.equal(handoffFor('not a url'), null);
});

test('only a public key is in the app, never a client secret or service key', () => {
  for (const file of ['contexts/AuthContext.jsx', 'lib/supabaseClient.js', 'lib/authRedirects.js', 'lib/authLog.js']) {
    assert.doesNotMatch(src(file), /GOCSPX-|client_secret|service_role/i, file);
  }
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
  // Settled: the next tap is a new attempt (no permanent lock, also after a failure).
  const again = run();
  await Promise.resolve();
  assert.equal(started, 2);
  finish({ success: false });
  await again;
  const failing = singleFlight(() => Promise.reject(new Error('x')));
  await assert.rejects(failing());
  await assert.rejects(failing());
});

test('logging out ends the session and keeps the two things separate from deleting the account', () => {
  const logout = auth.slice(auth.indexOf('const logout = async'), auth.indexOf('const applyServerProfile') > 0 ? auth.indexOf('const applyServerProfile') : undefined);
  assert.match(logout, /supabase\.auth\.signOut\(\{ scope \}\)/);
  assert.match(logout, /setSession\(null\)/);
  assert.match(logout, /setUser\(null\)/);
  // Logout never calls the account-deletion endpoint.
  assert.doesNotMatch(logout, /account\/delete|deleteAccount|method: 'DELETE'/);
});
