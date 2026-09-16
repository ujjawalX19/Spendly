/**
 * Android sign-in hand-off: https://vittova.in/auth/callback → the app.
 *
 * The Android app asks Supabase to return to https://vittova.in/auth/callback
 * rather than straight to spendly://login-callback. Chrome does not always
 * follow a server redirect to a custom scheme, which left the Custom Tab stuck
 * on a blank supabase.co page. Landing on a Vittova page first lets us open
 * the app ourselves, and show a button when the browser wants a tap.
 *
 * Only a one-time PKCE `code` (or Supabase's error parameters) is passed on.
 * The code is useless without the code verifier held inside the app, and the
 * intent names the app's package, so no other app receives it. Tokens are
 * never read from or put into a URL.
 *
 * No imports, so the rules can be unit tested in plain Node.
 */

export const APP_PACKAGE = 'com.spendly.app';
// Legacy scheme kept from before the Vittova rebrand (see REBRAND_VITTOVA.md).
export const APP_LOGIN_URL = 'spendly://login-callback';
const [APP_SCHEME, APP_LOGIN_HOST] = APP_LOGIN_URL.split('://');

const CODE_PATTERN = /^[A-Za-z0-9._~-]{8,512}$/;
const TOKEN_PATTERN = /^[a-z0-9_]{1,64}$/;

/**
 * Decide whether this /auth/callback visit belongs to the Android app.
 *
 * @param {string} href        the current page URL
 * @param {object} opts
 * @param {boolean} opts.hasVerifier  this browser holds a PKCE verifier, i.e.
 *                                    the flow was started on the website
 * @param {string} opts.userAgent
 * @returns {{ appUrl: string, intentUrl: string } | null}
 */
export function appHandoff(href, { hasVerifier, userAgent }) {
  // A flow started on the website is finished by the website.
  if (hasVerifier) return null;
  if (!/Android/i.test(userAgent || '')) return null;

  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const params = new URLSearchParams();
  const code = url.searchParams.get('code');
  if (code) {
    if (!CODE_PATTERN.test(code)) return null;
    params.set('code', code);
  } else {
    const error = url.searchParams.get('error');
    if (!error || !TOKEN_PATTERN.test(error)) return null;
    params.set('error', error);
    const errorCode = url.searchParams.get('error_code');
    if (errorCode && TOKEN_PATTERN.test(errorCode)) params.set('error_code', errorCode);
  }

  const query = params.toString();
  return {
    appUrl: `${APP_SCHEME}://${APP_LOGIN_HOST}?${query}`,
    intentUrl: `intent://${APP_LOGIN_HOST}?${query}#Intent;scheme=${APP_SCHEME};package=${APP_PACKAGE};end`,
  };
}
