/**
 * errors — turn whatever a failed request produced into something a person
 * can act on.
 *
 * Users were being shown raw values like "AxiosError", "Network Error",
 * "Request failed with status code 500" and sometimes "undefined". None of
 * those tell someone what to do next, and in a money app an unexplained
 * failure reads as "my data is gone".
 *
 * The server's own message is preferred when it is present and human — the
 * backend already writes things like "Free tier: 3 receipt scans/month" — and
 * otherwise the status code decides.
 */

const BY_STATUS = {
  400: 'Something in that request was not valid. Please check the details and try again.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have access to that.',
  404: 'We could not find that item. It may already have been deleted.',
  408: 'That took too long. Please check your connection and try again.',
  409: 'That conflicts with something that already exists.',
  413: 'That file is too large. Try a smaller one.',
  422: 'We could not read that. Please check it and try again.',
  429: 'Too many requests in a row. Please wait a moment and try again.',
  500: 'Something went wrong on our side. Please try again in a moment.',
  502: 'Vittova is having trouble reaching its server. Please try again shortly.',
  503: 'Vittova is temporarily unavailable. Please try again in a few minutes.',
  504: 'The server took too long to respond. Please try again.',
};

const OFFLINE =
  "You appear to be offline. Your data is safe — reconnect and we'll pick up where you left off.";

const GENERIC = 'Something went wrong. Please try again.';

/** True when the message looks like a sentence for a user, not a stack trace. */
function looksHuman(message) {
  if (typeof message !== 'string') return false;
  const m = message.trim();
  if (m.length < 8 || m.length > 240) return false;
  if (/^[A-Za-z]*Error\b/.test(m)) return false;
  if (/^Request failed with status/i.test(m)) return false;
  if (/^Network Error$/i.test(m)) return false;
  if (m === 'undefined' || m === 'null') return false;
  return true;
}

/**
 * @param {unknown} err   an axios error, a fetch TypeError, or anything else
 * @param {string} [fallback] context-specific default, e.g. "Couldn't load your expenses."
 * @returns {string} a message safe to show a user
 */
export function friendlyError(err, fallback = GENERIC) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return OFFLINE;

  const status = err?.response?.status ?? err?.status;

  const serverMessage = err?.response?.data?.message ?? err?.data?.message;
  if (looksHuman(serverMessage)) return serverMessage;

  if (status && BY_STATUS[status]) return BY_STATUS[status];
  if (status >= 500) return BY_STATUS[500];
  if (status >= 400) return BY_STATUS[400];

  // No response at all — DNS failure, CORS, timeout, radio dropped.
  if (err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message || '')) return BY_STATUS[408];
  if (err?.request || /network/i.test(err?.message || '')) return OFFLINE;

  return fallback || GENERIC;
}

/** True when the failure means the user must sign in again. */
export function isAuthError(err) {
  const status = err?.response?.status ?? err?.status;
  return status === 401;
}
