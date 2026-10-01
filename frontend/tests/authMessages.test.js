// What people see when sign-in, sign-up or a password change fails, what the
// browser callback does with each outcome, and the safe auth trail. Supabase's
// own texts are never shown; real failures are never hidden.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authErrorKind, authErrorMessage } from '../src/lib/authMessages.js';
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
  const java = readFileSync(join(here, '..', 'android/app/src/main/java/com/vittova/app/AuthLogPlugin.java'), 'utf8');
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
  for (const file of ['contexts/AuthContext.jsx', 'App.jsx', 'lib/authLog.js', 'components/AgeGate.jsx']) {
    assert.doesNotMatch(src(file), /console\.(log|info|debug|warn|error)\([^)]*(token|code|password|session|email)/i, file);
  }
});

test('a signed-in user whose profile cannot be read is not sent back to login', () => {
  const app = src('App.jsx');
  // Order in the route guard: no session -> login; profile problem -> its own screen.
  const guard = app.slice(app.indexOf('function ProtectedRoute'), app.indexOf('function Layout'));
  assert.ok(guard.indexOf("if (!session) return <Navigate to=\"/login\"") < guard.indexOf('if (profileError && !user) return <ProfileUnavailable />'));
  const ctx = src('contexts/AuthContext.jsx');
  assert.match(ctx, /authLog\('PROFILE_LOAD_FAILED'\);\s*setProfileError\(true\)/);
  // A profile failure never signs the user out.
  const load = ctx.slice(ctx.indexOf('const loadProfile'), ctx.indexOf('useEffect(() => {', ctx.indexOf('const loadProfile')));
  assert.doesNotMatch(load, /signOut|setSession\(null\)/);
});

test('email login: one Supabase call, session from Supabase, plain errors', () => {
  const ctx = src('contexts/AuthContext.jsx');
  const login = ctx.slice(ctx.indexOf('const login = async'), ctx.indexOf('const signup = async'));
  assert.match(login, /supabase\.auth\.signInWithPassword\(\{ email, password \}\)/);
  assert.match(login, /authErrorMessage\('login', error\)/);
  // The page blocks a second submit while the first is running.
  const page = src('pages/Login.jsx');
  assert.match(page, /setLoading\(true\);\s*const res = await login\(email, password\);\s*setLoading\(false\);/);
  assert.match(page, /disabled=\{loading \|\| googleLoading\}/);
});

test('sign-up: account created, then either signed in or told to confirm the email', () => {
  const ctx = src('contexts/AuthContext.jsx');
  const signup = ctx.slice(ctx.indexOf('const signup = async'), ctx.indexOf('Google sign-in: the one path'));
  assert.match(signup, /supabase\.auth\.signUp\(/);
  assert.match(signup, /emailRedirectTo: loginRedirectUrl\(\)/);
  assert.match(signup, /needsConfirmation: true/);
  assert.match(authErrorMessage('signup', { message: 'User already registered', code: 'user_already_exists' }), /already exists/);
  assert.match(authErrorMessage('signup', { message: 'Password should be at least 8 characters', code: 'weak_password' }), /stronger password/);
  assert.match(authErrorMessage('signup', { message: 'Unable to validate email address: invalid format', code: 'email_address_invalid' }), /valid email/);
});

test('password reset: request, then a new password on the recovery session', () => {
  const ctx = src('contexts/AuthContext.jsx');
  assert.match(ctx, /resetPasswordForEmail\(email, \{ redirectTo: passwordResetRedirectUrl\(\) \}\)/);
  assert.match(ctx, /supabase\.auth\.updateUser\(\{ password \}\)/);
  assert.match(authErrorMessage('update_password', { message: 'Auth session missing!' }), /expired/);
  assert.match(authErrorMessage('update_password', { message: 'New password should be different from the old password.', code: 'same_password' }), /not used/);
});
