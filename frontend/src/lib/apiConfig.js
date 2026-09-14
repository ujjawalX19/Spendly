/**
 * One place that knows where the Vittova API lives.
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
 * Retries only on cold-start statuses, timeouts and genuine network failures.
 * A 401 or a 400 is returned immediately: retrying a rejected request just
 * wastes the user's time.
 *
 * Only safe methods (GET/HEAD) are retried. Retrying a POST could record an
 * expense or ask the AI twice.
 *
 * Each attempt has its own timeout, because a waking Render instance can hold
 * a connection open instead of failing fast. Backoff 2s, 4s, 8s, 12s — with
 * the timeouts this covers a typical 30–60 second cold start before giving up.
 *
 * @param {string} url
 * @param {RequestInit} options
 * @param {{retries?: number, timeoutMs?: number, onRetry?: (attempt: number) => void}} config
 */
export async function apiFetch(url, options = {}, { retries, timeoutMs = 25000, onRetry } = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const safe = method === 'GET' || method === 'HEAD';
  const maxRetries = safe ? (retries ?? 4) : 0;
  const delays = [2000, 4000, 8000, 12000];
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      onRetry?.(attempt);
      await sleep(delays[attempt - 1] ?? 12000);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener?.('abort', onAbort);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (response.ok || !COLD_START_STATUSES.has(response.status)) return response;
      lastError = Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
    } catch (err) {
      // The caller cancelled: stop, do not retry.
      if (options.signal?.aborted) throw err;
      // Timeout or network-level failure: no usable response.
      lastError = err?.name === 'AbortError'
        ? Object.assign(new Error('Request timed out'), { code: 'ECONNABORTED' })
        : err;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener?.('abort', onAbort);
    }
  }

  throw lastError ?? new Error('Request failed');
}

/**
 * JSON request helper built on apiFetch: returns parsed JSON for 2xx, and
 * throws an Error carrying `status` and the server body otherwise (the shape
 * friendlyError() understands).
 */
export async function apiJson(path, { session, method = 'GET', body, onRetry } = {}) {
  const response = await apiFetch(apiUrl(path), {
    method,
    headers: authHeaders(session, { json: body !== undefined }),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }, { onRetry });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw Object.assign(new Error(data.message || `HTTP ${response.status}`), { status: response.status, data });
  }
  return data;
}
