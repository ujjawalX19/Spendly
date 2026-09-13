import { Capacitor } from '@capacitor/core';

/**
 * Where Supabase sends the user back after Google sign-in, email confirmation,
 * or a password-reset link.
 *
 * Every URL here must be listed in Supabase → Authentication → URL
 * Configuration → Redirect URLs. If one is missing, Supabase silently falls
 * back to the Site URL and the user lands on the website instead of the app.
 * (See AUTH_DEEP_LINKS.md.)
 *
 * The app uses the PKCE flow: the link carries a one-time `code`, which is
 * useless without the code verifier this device stored when the flow started.
 * Tokens are never placed in the URL.
 */

export const NATIVE_SCHEME = 'spendly';
export const NATIVE_HOSTS = {
  login: 'login-callback',
  reset: 'reset-password',
};

export function isNative() {
  return Capacitor.isNativePlatform();
}

/** Google OAuth and signup confirmation. */
export function loginRedirectUrl() {
  return isNative()
    ? `${NATIVE_SCHEME}://${NATIVE_HOSTS.login}`
    : `${window.location.origin}/auth/callback`;
}

/** Password-reset email link. */
export function passwordResetRedirectUrl() {
  return isNative()
    ? `${NATIVE_SCHEME}://${NATIVE_HOSTS.reset}`
    : `${window.location.origin}/reset-password`;
}

/**
 * Turn Supabase's error parameters into a message a person can act on.
 * Supabase reports them in the query string (PKCE) or the fragment.
 * @returns {string|null}
 */
export function authErrorFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const get = (key) => parsed.searchParams.get(key) || hash.get(key);

  const code = get('error_code');
  const error = get('error');
  if (!code && !error) return null;

  if (code === 'otp_expired' || /expired|invalid/i.test(get('error_description') || '')) {
    return 'This link has expired or has already been used. Please request a new one.';
  }
  if (error === 'access_denied') {
    return 'Sign-in was cancelled.';
  }
  return 'We could not complete that request. Please try again.';
}

/** A PKCE exchange that failed because this device did not start the flow. */
export function isMissingVerifierError(err) {
  return /code verifier|code_verifier|flow state/i.test(err?.message || '');
}
