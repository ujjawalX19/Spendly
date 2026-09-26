/**
 * splash — when the startup splash (components/StartupSplash.jsx) is shown.
 * Once per app session (a cold start), never on navigation.
 */

export const SPLASH_SESSION_KEY = 'vittova.splash.v1';

// Website visitors to the landing, legal and auth-return pages go straight in.
const WEB_SKIP = ['/', '/privacy', '/terms', '/delete-account'];

/**
 * @param {string} pathname  the path the app was opened on
 * @param {boolean} native   true inside the Android app
 * @param {Storage} [storage] sessionStorage (injectable for tests)
 */
export function shouldShowSplash(pathname, native, storage) {
  try {
    const store = storage || window.sessionStorage;
    if (store.getItem(SPLASH_SESSION_KEY)) return false;
  } catch { /* storage unavailable: show it once in memory */ }
  if (native) return true;
  return !WEB_SKIP.includes(pathname) && !String(pathname).startsWith('/auth/');
}

export function markSplashShown(storage) {
  try { (storage || window.sessionStorage).setItem(SPLASH_SESSION_KEY, '1'); } catch { /* storage unavailable */ }
}
