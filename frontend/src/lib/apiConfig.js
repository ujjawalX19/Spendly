/**
 * One place that knows where the Spendly API lives.
 *
 * The base URL was previously copy-pasted into eleven files, each with its own
 * hardcoded production fallback. Changing the backend host meant finding all
 * eleven, and missing one produced a component that silently talked to the
 * wrong environment.
 *
 * The fallback is deliberate rather than accidental: a release APK is built
 * once and cannot read a .env at runtime, so if `VITE_API_URL` is absent at
 * build time the app must still reach production rather than localhost.
 */

const FALLBACK_API_URL = 'https://spendly-t8s6.onrender.com/api';

export const API_URL = (import.meta.env.VITE_API_URL || FALLBACK_API_URL).replace(/\/+$/, '');

/** Build an API URL from a path: apiUrl('/expenses') -> '<base>/expenses' */
export function apiUrl(path = '') {
  if (!path) return API_URL;
  return `${API_URL}/${String(path).replace(/^\/+/, '')}`;
}

/**
 * Authorization headers for a Supabase session.
 * Returns just the JSON content type when there is no session, so callers can
 * spread the result unconditionally.
 */
export function authHeaders(session, { json = true } = {}) {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

/**
 * Statuses that mean "the server is not ready yet", as opposed to "your
 * request was wrong". Render's free tier sleeps after inactivity and answers
 * with these while a dyno spins back up, which takes 30-60 seconds.
 */
const COLD_START_STATUSES = new Set([502, 503, 504, 408, 429]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * fetch, with retries for a sleeping backend.
 *
 * Without this, the first request after the API has been idle fails and the
 * user sees "check your connection" — when their connection is fine and the
 * server simply needed a minute. That is every user's first impression on a
 * free-tier host, so it is worth handling properly rather than blaming the
 * network.
 *
 * Retries only on cold-start statuses and genuine network failures. A 401 or
 * a 400 is returned immediately: retrying a rejected request just wastes the
 * user's time.
 *
 * @param {string} url
 * @param {RequestInit} options
 * @param {{retries?: number, onRetry?: (attempt: number) => void}} config
 */
export async function apiFetch(url, options = {}, { retries = 3, onRetry } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // 1s, 3s, 7s — enough to cover a typical cold start without leaving
      // the user staring at a spinner forever.
      await sleep([1000, 3000, 7000][attempt - 1] ?? 7000);
      onRetry?.(attempt);
    }

    try {
      const response = await fetch(url, options);
      if (response.ok || !COLD_START_STATUSES.has(response.status)) return response;

      lastError = Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
    } catch (err) {
      // Network-level failure: no response at all.
      lastError = err;
    }
  }

  throw lastError ?? new Error('Request failed');
}
