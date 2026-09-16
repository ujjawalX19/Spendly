/**
 * https://vittova.in/auth/app-callback — returns the Android app's sign-in to
 * the app (Google sign-in, signup email confirmation).
 *
 * Why a dedicated static page: the app used to share /auth/callback with the
 * website and the page guessed whether a visit belonged to the app (no PKCE
 * verifier in this browser + an Android user agent). A stale website sign-in
 * in the phone's Chrome defeated the guess, and the full web app had to load
 * before the hand-off ran, long after the user's tap. This page is only ever
 * the app's return address, loads nothing else, and hands off immediately.
 *
 * Security: only a one-time PKCE `code`, or Supabase's `error` / `error_code`
 * tokens, are passed on. The code is useless without the verifier held inside
 * the app. The intent names the app's package, so no other app receives it.
 * Tokens and error descriptions are never forwarded, and the code is removed
 * from the address bar at once.
 *
 * An ES module with no imports, so tests/appCallbackPage.test.js can import it.
 */

export const APP_PACKAGE = 'com.spendly.app';
// Legacy scheme kept from before the Vittova rebrand (see REBRAND_VITTOVA.md).
export const APP_LOGIN_URL = 'spendly://login-callback';

const CODE_PATTERN = /^[A-Za-z0-9._~-]{8,512}$/;
const TOKEN_PATTERN = /^[a-z0-9_]{1,64}$/;

/**
 * What to hand to the app for this callback URL.
 * @param {string} href
 * @returns {{ kind: 'code'|'error', appUrl: string, intentUrl: string } | null}
 *          null when the URL carries neither a valid code nor a valid error.
 */
export function handoffFor(href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  // Supabase reports errors in the query string and repeats them in the fragment.
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const get = (key) => url.searchParams.get(key) || hash.get(key);

  const params = new URLSearchParams();
  let kind;
  const code = url.searchParams.get('code');
  const error = get('error');
  if (code && CODE_PATTERN.test(code)) {
    params.set('code', code);
    kind = 'code';
  } else if (error && TOKEN_PATTERN.test(error)) {
    params.set('error', error);
    const errorCode = get('error_code');
    if (errorCode && TOKEN_PATTERN.test(errorCode)) params.set('error_code', errorCode);
    kind = 'error';
  } else {
    return null;
  }

  const [scheme, host] = APP_LOGIN_URL.split('://');
  const query = params.toString();
  return {
    kind,
    appUrl: `${APP_LOGIN_URL}?${query}`,
    intentUrl: `intent://${host}?${query}#Intent;scheme=${scheme};package=${APP_PACKAGE};end`,
  };
}

function run() {
  const handoff = handoffFor(window.location.href);
  // Keep the one-time code out of the address bar and browser history.
  try { window.history.replaceState(null, '', window.location.pathname); } catch { /* unsupported */ }

  const show = (id) => {
    for (const el of document.querySelectorAll('[data-state]')) el.hidden = el.getAttribute('data-state') !== id;
  };

  if (!handoff) {
    show('invalid');
    return;
  }

  for (const link of document.querySelectorAll('[data-open-app]')) link.setAttribute('href', handoff.intentUrl);
  show(handoff.kind === 'error' ? 'error' : 'opening');

  // Chrome opens the app straight away when it still counts the user's tap
  // on Google's "Continue"; otherwise the button below does it.
  window.location.replace(handoff.intentUrl);
  window.setTimeout(() => {
    for (const el of document.querySelectorAll('[data-slow]')) el.hidden = false;
  }, 1500);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
}
