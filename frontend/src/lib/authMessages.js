/**
 * authMessages — what a person sees when sign-in, sign-up or a password
 * change fails. Supabase's own texts ("email rate limit exceeded",
 * "AuthApiError: …") are never shown; real failures are never hidden either:
 * a wrong password still says so.
 *
 * No imports, so it is unit tested in plain Node (tests/authMessages.test.js).
 */

/**
 * @param {{ message?: string, status?: number, code?: string, name?: string }|null|undefined} error
 * @returns {'rate_limited'|'network'|'invalid_credentials'|'email_not_confirmed'|'already_registered'
 *          |'weak_password'|'invalid_email'|'signup_disabled'|'same_password'|'session_expired'|'code_invalid'|'unknown'}
 */
export function authErrorKind(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  const status = Number(error?.status) || 0;

  if (status === 429 || /rate limit|too many|over_email_send_rate_limit|over_request_rate_limit/.test(`${message} ${code}`)) return 'rate_limited';
  if (error?.name === 'AuthRetryableFetchError' || /failed to fetch|network|load failed|timed? ?out/.test(message)) return 'network';
  // A typed email code (or an email link) that is wrong, used or too old.
  if (code === 'otp_expired' || code === 'otp_disabled' || /token has expired or is invalid|otp/.test(message)) return 'code_invalid';
  if (code === 'email_not_confirmed' || /email not confirmed/.test(message)) return 'email_not_confirmed';
  if (code === 'invalid_credentials' || /invalid login credentials/.test(message)) return 'invalid_credentials';
  if (code === 'user_already_exists' || /already registered|already exists/.test(message)) return 'already_registered';
  // Before weak_password: "New password should be different from the old password."
  if (code === 'same_password' || /different from the old password/.test(message)) return 'same_password';
  if (code === 'weak_password' || /password should|weak password|at least \d+ characters/.test(message)) return 'weak_password';
  if (code === 'email_address_invalid' || /invalid email|valid email|email address .* invalid/.test(message)) return 'invalid_email';
  if (code === 'signup_disabled' || /signups? (are )?not allowed|signup is disabled/.test(message)) return 'signup_disabled';
  if (/session (is )?missing|jwt|not authenticated|session_not_found/.test(`${message} ${code}`)) return 'session_expired';
  return 'unknown';
}

const COMMON = {
  network: "We couldn't reach Vittova. Check your internet connection and try again.",
  invalid_email: 'Please enter a valid email address.',
  weak_password: 'Choose a stronger password: at least 8 characters.',
};

const BY_CONTEXT = {
  login: {
    rate_limited: 'Too many attempts. Please wait a few minutes and try again.',
    invalid_credentials: 'Invalid login credentials. If you just signed up, confirm your email first with the code or link we sent.',
    email_not_confirmed: 'Please confirm your email first, with the code or link we sent you, then log in.',
    unknown: "We couldn't log you in. Please try again.",
  },
  signup: {
    rate_limited: 'Email confirmation is temporarily unavailable. Please try again in about an hour, or continue with Google.',
    already_registered: 'An account with this email already exists. Log in instead.',
    signup_disabled: 'New sign-ups are paused right now. Please try again later.',
    unknown: "We couldn't create your account. Please try again.",
  },
  google: {
    rate_limited: 'Too many attempts. Please wait a few minutes and try again.',
    signup_disabled: 'New sign-ups are paused right now. Please try again later.',
    unknown: "Google sign-in couldn't be completed. Please try again.",
  },
  reset: {
    rate_limited: 'Too many reset requests. Please wait a few minutes and try again.',
    unknown: "We couldn't send the reset email. Please try again.",
  },
  verify_code: {
    rate_limited: 'Too many attempts. Please wait a few minutes and try again.',
    code_invalid: "That code isn't right or has expired. Check the newest email, or send a new one.",
    unknown: "We couldn't check that code. Please try again.",
  },
  resend: {
    rate_limited: 'Please wait a minute before asking for another email.',
    unknown: "We couldn't send the email. Please try again.",
  },
  update_password: {
    rate_limited: 'Too many attempts. Please wait a few minutes and try again.',
    same_password: 'Choose a password you have not used for this account before.',
    session_expired: 'This reset link has expired. Please request a new one.',
    unknown: "We couldn't change your password. Please try again.",
  },
};

/**
 * @param {'login'|'signup'|'google'|'reset'|'update_password'|'verify_code'|'resend'} context
 * @param {object|null|undefined} error  a Supabase auth error
 * @returns {string} never the raw error text
 */
export function authErrorMessage(context, error) {
  const kind = authErrorKind(error);
  const table = BY_CONTEXT[context] || {};
  return table[kind] || COMMON[kind] || table.unknown || 'Something went wrong. Please try again.';
}
