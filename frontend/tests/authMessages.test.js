// What people see when sign-in, sign-up or a password change fails, and how a
// failed native Google sign-in is routed. Supabase's own texts are never shown;
// real failures are never hidden.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authErrorKind, authErrorMessage } from '../src/lib/authMessages.js';
import { nativeFailureAction, nativeFailureCode, singleFlight } from '../src/lib/googleSignIn.js';
import { loginCallbackFailure } from '../src/lib/authCallbackOutcome.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(join(here, '..', 'src', p), 'utf8');

const RATE = { message: 'email rate limit exceeded', status: 429, code: 'over_email_send_rate_limit' };

test('sign-up rate limit: plain words, never "email rate limit exceeded"', () => {
  assert.equal(authErrorKind(RATE), 'rate_limited');
  const msg = authErrorMessage('signup', RATE);
  assert.match(msg, /temporarily unavailable/);
  assert.match(msg, /continue with Google/);
  assert.doesNotMatch(msg, /rate limit/i);
  // The text alone is enough (older Supabase responses carry no code).
  assert.equal(authErrorKind({ message: 'email rate limit exceeded' }), 'rate_limited');
});

test('password-reset and login rate limits ask the person to wait', () => {
  assert.match(authErrorMessage('reset', RATE), /Too many reset requests/);
  assert.match(authErrorMessage('login', { message: 'Request rate limit reached', status: 429 }), /Too many attempts/);
  assert.match(authErrorMessage('update_password', { status: 429, message: 'x' }), /Too many attempts/);
});

test('a wrong password still says so (a real failure is not hidden)', () => {
  const msg = authErrorMessage('login', { message: 'Invalid login credentials', status: 400, code: 'invalid_credentials' });
  assert.match(msg, /Invalid login credentials/);
  assert.match(authErrorMessage('login', { message: 'Email not confirmed', code: 'email_not_confirmed' }), /confirm your email/i);
});

test('network failures point at the connection, in every flow', () => {
  for (const ctx of ['login', 'signup', 'google', 'reset', 'update_password']) {
    assert.match(authErrorMessage(ctx, { name: 'AuthRetryableFetchError', message: 'Failed to fetch' }), /internet connection/, ctx);
  }
});

test('no flow ever shows the raw provider text', () => {
  const raw = [
    { message: 'AuthApiError: Database error saving new user', status: 500 },
    { message: 'unexpected_failure', code: 'unexpected_failure' },
    { message: 'email rate limit exceeded', status: 429 },
    { message: 'New password should be different from the old password.', code: 'same_password' },
    { message: 'Auth session missing!' },
    null,
    undefined,
  ];
  for (const ctx of ['login', 'signup', 'google', 'reset', 'update_password']) {
    for (const err of raw) {
      const msg = authErrorMessage(ctx, err);
      assert.ok(msg.length > 10, `${ctx}: empty message`);
      assert.doesNotMatch(msg, /AuthApiError|unexpected_failure|rate limit exceeded|Database error|session missing/i, `${ctx}: ${msg}`);
    }
  }
});

test('the auth context shows no raw Supabase message', () => {
  const ctx = src('contexts/AuthContext.jsx');
  assert.doesNotMatch(ctx, /message:\s*error\.message/, 'error.message must go through authErrorMessage');
  assert.match(ctx, /authErrorMessage\('signup', error\)/);
  assert.match(ctx, /authErrorMessage\('login', error\)/);
});

test('native Google failures: only a real cancellation stays silent', () => {
  // The user closed the picker: stay on the login screen, no browser.
  assert.equal(nativeFailureAction('USER_CANCELLED'), 'cancelled');
  // "[16] Account reauth failed" / UNREGISTERED_ON_API_CONSOLE: the browser flow.
  assert.equal(nativeFailureAction('OAUTH_CONFIGURATION_ERROR'), 'fallback');
  assert.equal(nativeFailureAction('NO_CREDENTIAL'), 'fallback');
  assert.equal(nativeFailureAction('UNSUPPORTED'), 'fallback');
  assert.equal(nativeFailureAction('GOOGLE_AUTH_FAILED'), 'fallback');
  // No connection: a browser would fail the same way.
  assert.equal(nativeFailureAction('NETWORK_ERROR'), 'network');
  assert.equal(nativeFailureAction('INTERRUPTED'), 'retry');

  assert.equal(nativeFailureCode('OAUTH_CONFIGURATION_ERROR'), 'native_oauth_client_mismatch');
  assert.equal(nativeFailureCode('NETWORK_ERROR'), 'native_network');
  assert.equal(nativeFailureCode('UNSUPPORTED'), 'native_unsupported');
  assert.equal(nativeFailureCode('GOOGLE_AUTH_FAILED'), 'native_failed');
  for (const c of ['OAUTH_CONFIGURATION_ERROR', 'NETWORK_ERROR', 'UNSUPPORTED', 'GOOGLE_AUTH_FAILED', 'NO_CREDENTIAL', 'x']) {
    assert.match(nativeFailureCode(c), /^[a-z0-9_]{1,40}$/);
  }
});

test('the web layer and the native plugin agree on the codes', () => {
  const java = readFileSync(join(here, '..', 'android/app/src/main/java/com/vittova/app/GoogleAuthErrors.java'), 'utf8');
  const codes = [...java.matchAll(/static final String \w+ = "([A-Z_]+)";/g)].map((m) => m[1]);
  assert.deepEqual(codes.sort(), ['GOOGLE_AUTH_FAILED', 'INTERRUPTED', 'NETWORK_ERROR', 'NO_CREDENTIAL', 'OAUTH_CONFIGURATION_ERROR', 'UNSUPPORTED', 'USER_CANCELLED']);
  // Exactly one of them means "the user chose to stop".
  assert.deepEqual(codes.filter((c) => nativeFailureAction(c) === 'cancelled'), ['USER_CANCELLED']);
});

test('one Google sign-in at a time: a second tap opens nothing new', async () => {
  let started = 0;
  let busy = 0;
  let finish;
  const run = singleFlight(() => { started++; return new Promise((r) => { finish = r; }); }, () => { busy++; });
  const first = run();
  const second = run();
  const third = run();
  await Promise.resolve();
  assert.equal(started, 1, 'only one attempt starts');
  assert.equal(busy, 2);
  finish({ success: true });
  assert.deepEqual(await first, { success: true });
  assert.deepEqual(await second, { success: true });
  assert.deepEqual(await third, { success: true });
  // Finished: the next tap is a new attempt (no permanent lock, also after a failure).
  const again = run();
  await Promise.resolve();
  assert.equal(started, 2);
  finish({ success: false });
  await again;
  const failing = singleFlight(() => Promise.reject(new Error('x')));
  await assert.rejects(failing());
  await assert.rejects(failing());
});

test('the browser is opened in exactly one place, and never after a cancellation', () => {
  const ctx = src('contexts/AuthContext.jsx');
  assert.equal(ctx.match(/Browser\.open\(/g).length, 1, 'one Browser.open call');
  // A cancellation returns before the fallback is reached.
  const native = ctx.slice(ctx.indexOf('const nativeGoogleSignIn'), ctx.indexOf('const startGoogleSignIn'));
  assert.ok(native.indexOf("action === 'cancelled'") < native.indexOf('return null'), 'cancelled is handled before the fallback');
  assert.match(native, /cancelled: true/);
  // The fallback never calls back into the native flow (no loop).
  const browser = ctx.slice(ctx.indexOf('const browserGoogleSignIn'), ctx.indexOf('const nativeGoogleSignIn'));
  assert.doesNotMatch(browser, /nativeGoogleSignIn|GoogleAuth\.signIn/);
});

test('browser callback outcomes: cancelled, invalid, used twice, wrong device', () => {
  assert.deepEqual(loginCallbackFailure({ google: true, error: 'access_denied' }), { message: 'Google sign-in was cancelled.', code: 'google_cancelled' });
  assert.equal(loginCallbackFailure({ google: true, invalidLink: true }).code, 'google_invalid_callback');
  assert.equal(loginCallbackFailure({ google: true, exchangeError: { message: 'invalid flow state, no valid flow state found' } }).code, 'google_missing_verifier');
  assert.equal(loginCallbackFailure({ google: true, exchangeError: { message: 'code already used' } }).code, 'google_exchange_failed');
  for (const o of [loginCallbackFailure({ google: true, exchangeError: { message: 'x' } }), loginCallbackFailure({ google: true, invalidLink: true })]) {
    assert.match(o.message, /couldn't be completed/);
  }
});

test('the deep-link handler drops a repeated callback and only trusts a one-time code', () => {
  const app = src('App.jsx');
  assert.match(app, /handledDeepLinks\.has\(url\)\) \{ authLog\('BROWSER_CALLBACK_DUPLICATE'\); return; \}/);
  assert.match(app, /parsed\.protocol !== `\$\{NATIVE_SCHEME\}:`/);
  assert.match(app, /exchangeCodeForSession\(code\)/);
  // Tokens in a link are never used to make a session.
  assert.doesNotMatch(app, /setSession\(|access_token|refresh_token/);
});

test('the auth log can only write fixed codes, the same list on both sides', () => {
  const js = [...src('lib/authLog.js').matchAll(/'([A-Z_]{3,40})'/g)].map((m) => m[1]);
  const java = readFileSync(join(here, '..', 'android/app/src/main/java/com/vittova/app/GoogleAuthPlugin.java'), 'utf8');
  const block = java.slice(java.indexOf('AUTH_EVENTS = new HashSet'), java.indexOf('@PluginMethod', java.indexOf('AUTH_EVENTS = new HashSet')));
  const native = [...block.matchAll(/"([A-Z_]{3,40})"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(js)].sort(), [...new Set(native)].sort());
  // Every authLog(...) call in the app uses a literal from that list.
  for (const file of ['contexts/AuthContext.jsx', 'App.jsx', 'components/AgeGate.jsx', 'hooks/useOAuthBrowserReset.js']) {
    for (const line of src(file).split('\n').filter((l) => l.includes('authLog(') && !l.trim().startsWith('import'))) {
      const call = line.slice(line.indexOf('authLog('));
      const literals = [...call.matchAll(/'([A-Z_]{3,40})'/g)].map((x) => x[1]);
      assert.ok(literals.length > 0, `${file}: "${line.trim()}" must use literal codes`);
      for (const code of literals) assert.ok(js.includes(code), `${file}: ${code}`);
    }
  }
  // Nothing sensitive is ever written to the console by the auth code.
  for (const file of ['contexts/AuthContext.jsx', 'App.jsx', 'lib/authLog.js', 'lib/googleSignIn.js']) {
    assert.doesNotMatch(src(file), /console\.(log|info|debug|warn|error)\([^)]*(token|code|password|session|email)/i, file);
  }
});
