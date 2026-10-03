// Email confirmation and password reset can be finished inside the app by
// typing the code from the email: no link, no browser. The link in the same
// email keeps working.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanCode, isCode, resendWaitLeft, CODE_MIN, CODE_MAX, RESEND_WAIT_SECONDS } from '../src/lib/emailCode.js';
import { authErrorKind, authErrorMessage } from '../src/lib/authMessages.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(join(here, '../src', p), 'utf8');

test('a typed or pasted code is reduced to its digits', () => {
  assert.equal(cleanCode('123456'), '123456');
  assert.equal(cleanCode(' 123 456 '), '123456');
  assert.equal(cleanCode('Code: 12-34-56.'), '123456');
  assert.equal(cleanCode('abc'), '');
  assert.equal(cleanCode(null), '');
  assert.equal(cleanCode('1'.repeat(40)).length, CODE_MAX);
});

test('only a whole code is sent to be checked', () => {
  assert.equal(CODE_MIN, 6);
  assert.equal(isCode('123456'), true);
  assert.equal(isCode('12345678'), true);
  assert.equal(isCode('1'.repeat(CODE_MAX)), true);
  for (const bad of ['', '12345', '1'.repeat(CODE_MAX + 1), '12345a', ' 123456', null, undefined]) assert.equal(isCode(bad), false, String(bad));
});

test('another email can be asked for after a minute, not before', () => {
  const now = 1_790_000_000_000;
  assert.equal(resendWaitLeft(now, now), RESEND_WAIT_SECONDS);
  assert.equal(resendWaitLeft(now - 20_000, now), 40);
  assert.equal(resendWaitLeft(now - 60_000, now), 0);
  assert.equal(resendWaitLeft(now - 600_000, now), 0);
  // Nothing sent, garbage, or a clock set back: no wait.
  for (const v of [null, undefined, 'x', 0, now + 5000]) assert.equal(resendWaitLeft(v, now), 0, String(v));
});

test('a wrong or expired code says so in plain words, never in Supabase\'s', () => {
  const expired = { message: 'Token has expired or is invalid', code: 'otp_expired', status: 403 };
  assert.equal(authErrorKind(expired), 'code_invalid');
  assert.match(authErrorMessage('verify_code', expired), /isn't right or has expired/);
  assert.equal(authErrorKind({ message: 'Email link is invalid or has expired', code: 'otp_expired' }), 'code_invalid');
  // Too many tries is still a rate limit, and a dropped connection a network problem.
  assert.match(authErrorMessage('verify_code', { status: 429, message: 'rate limit' }), /wait a few minutes/);
  assert.match(authErrorMessage('verify_code', { name: 'AuthRetryableFetchError', message: 'Failed to fetch' }), /internet connection/);
  assert.match(authErrorMessage('resend', { status: 429, code: 'over_email_send_rate_limit' }), /wait a minute/);
  for (const ctx of ['verify_code', 'resend']) {
    for (const e of [expired, { message: 'AuthApiError: boom' }, null]) {
      assert.doesNotMatch(authErrorMessage(ctx, e), /token|otp|AuthApiError|supabase/i);
    }
  }
});

test('the code is checked by Supabase, and each flow ends in the right place', () => {
  const auth = src('contexts/AuthContext.jsx');
  const fn = auth.slice(auth.indexOf('const confirmEmailCode'), auth.indexOf('const resendSignupEmail'));
  assert.match(fn, /supabase\.auth\.verifyOtp\(\{ email, token: code, type \}\)/);
  // A recovery code opens the set-password form; nothing else is granted here.
  assert.match(fn, /if \(type === 'recovery'\) markPasswordRecovery\(true\);/);
  // A failed check never reports success.
  assert.ok(fn.indexOf('return { success: false') < fn.indexOf('return { success: true }'));
  assert.match(auth, /supabase\.auth\.resend\(\{ type: 'signup', email,/);

  const signup = src('pages/Signup.jsx');
  assert.match(signup, /confirmEmailCode\(email\.trim\(\), code, 'signup'\)/);
  assert.match(signup, /resendSignupEmail\(email\.trim\(\)\)/);
  const forgot = src('pages/ForgotPassword.jsx');
  assert.match(forgot, /confirmEmailCode\(email\.trim\(\), code, 'recovery'\)/);
  assert.match(forgot, /if \(res\.success\) navigate\('\/reset-password', \{ replace: true \}\);/);
  // The password is still set on the existing form, behind a recovery session.
  assert.match(src('pages/ResetPassword.jsx'), /passwordRecovery/);

  // No browser is opened by any of it.
  for (const f of ['components/EmailCodeForm.jsx', 'pages/Signup.jsx', 'pages/ForgotPassword.jsx']) {
    assert.doesNotMatch(src(f), /Browser\.open|window\.open|location\.href\s*=/, f);
  }
  const form = src('components/EmailCodeForm.jsx');
  assert.match(form, /autoComplete="one-time-code"/);
  assert.match(form, /inputMode="numeric"/);
});
