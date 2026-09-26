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

/**
 * The website that hosts the app's sign-in return page.
 *
 * The Android app returns to https://vittova.in/auth/app-callback, a small
 * static page (public/auth/app-callback.*) that immediately hands the one-time
 * code to spendly://login-callback. It is only ever the app's return address;
 * the website keeps /auth/callback. Supabase accepts it because the Site URL is
 * https://vittova.in; it should also be listed in Redirect URLs.
 */
export const WEB_ORIGIN = 'https://vittova.in';
export const APP_CALLBACK_PATH = '/auth/app-callback';

/** Google OAuth and signup confirmation. */
export function loginRedirectUrl() {
  return isNative()
    ? `${WEB_ORIGIN}${APP_CALLBACK_PATH}`
    : `${window.location.origin}/auth/callback`;
}

/** Password-reset email link. */
export function passwordResetRedirectUrl() {
  return isNative()
    ? `${NATIVE_SCHEME}://${NATIVE_HOSTS.reset}`
    : `${window.location.origin}/reset-password`;
}

/**
 * Whether this URL is the landing page of a password-reset link.
 *
 * On the web the link is PKCE: /reset-password?code=… . supabase-js exchanges
 * the code on load and emits SIGNED_IN — NOT PASSWORD_RECOVERY, which it only
 * emits for the older implicit flow (#type=recovery). Relying on that event
 * alone left the reset page thinking the link was invalid while the user was
 * in fact signed in, so they were sent to the app instead of the form.
 *
 * The flag this drives only decides whether the form is shown; changing the
 * password still requires the session the one-time code produced.
 *
 * @param {string} href
 * @returns {boolean}
 */
export function isPasswordRecoveryUrl(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  const hash = new URLSearchParams(String(url.hash || '').replace(/^#/, ''));
  const onResetPage = /\/reset-password\/?$/.test(url.pathname);
  return (onResetPage && (url.searchParams.has('code') || url.searchParams.get('type') === 'recovery'))
    || hash.get('type') === 'recovery';
}

/** Marker written when this browser asks for a reset email (see isRecoveryReturn). */
export const RESET_REQUEST_KEY = 'vittova.resetRequested.v1';
const RESET_WINDOW_MS = 60 * 60 * 1000;

/**
 * Whether this page load is the return from a password-reset link, including
 * the case where Supabase ignored our redirect and used the Site URL instead
 * (which happens when /reset-password is missing from Redirect URLs, and drops
 * the user on the home page with the code).
 *
 * A bare `?code=` is ambiguous — Google sign-in returns one too — so it counts
 * only when THIS browser asked for a reset email in the last hour. That marker
 * is local, unforgeable by a link, and still requires the one-time code to
 * produce a session before any password can be changed.
 *
 * @param {string} href
 * @param {number|null} requestedAt  ms timestamp of the last reset request here
 * @param {number} [now]
 */
export function isRecoveryReturn(href, requestedAt, now = Date.now()) {
  if (isPasswordRecoveryUrl(href)) return true;
  const age = now - Number(requestedAt || 0);
  if (!requestedAt || age < 0 || age > RESET_WINDOW_MS) return false;
  try {
    const url = new URL(href);
    // The app's own sign-in return page handles its code itself.
    if (url.pathname.startsWith('/auth/')) return false;
    return url.searchParams.has('code');
  } catch {
    return false;
  }
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
