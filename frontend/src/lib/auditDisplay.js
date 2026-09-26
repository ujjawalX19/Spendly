/**
 * auditDisplay — labels for the Subscription Audit screen. No detection or
 * maths here: every figure comes from GET /api/subscription-audit.
 */

export const CONFIDENCE = {
  high: { label: 'High confidence', className: 'border-lime-400/30 bg-lime-400/10 text-lime-300' },
  medium: { label: 'Medium confidence', className: 'border-sky-400/30 bg-sky-400/10 text-sky-300' },
  possible: { label: 'Possible recurring', className: 'border-zinc-600 bg-zinc-800 text-zinc-300' },
};

export const DECISIONS = [
  { value: 'confirmed', label: 'Confirm' },
  { value: 'intentional', label: 'Keep: intentional' },
  { value: 'unwanted', label: 'Mark unwanted' },
  { value: 'dismissed', label: 'Not recurring' },
];

export const DECISION_BADGE = {
  confirmed: 'Confirmed',
  intentional: 'Intentional',
  unwanted: 'Unwanted',
  dismissed: 'Dismissed',
};

const DAY_MS = 86400000;
const toUtc = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

export function formatDay(key) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(toUtc(key)));
}

/** "Expected tomorrow", "Expected around 5 Oct (in 12 days)" — never "will be debited". */
export function dueLabel(dateKey, todayKey) {
  const days = Math.round((toUtc(dateKey) - toUtc(todayKey)) / DAY_MS);
  if (days <= 0) return 'Expected around today';
  if (days === 1) return 'Expected tomorrow';
  return `Expected around ${formatDay(dateKey)} (in ${days} days)`;
}

export const VERIFY_LABEL = {
  matched: { label: 'Seen', className: 'text-lime-300' },
  not_confirmed: { label: 'Not seen', className: 'text-amber-300' },
  pending: { label: 'Waiting', className: 'text-zinc-400' },
};

/** Groups for the screen: what needs a decision first, then what is counted, then set aside. */
export function groupItems(items = []) {
  const review = items.filter((i) => i.status === 'active' && !i.decision && i.confidence !== 'high');
  const counted = items.filter((i) => i.counted && !review.includes(i));
  const other = items.filter((i) => !review.includes(i) && !counted.includes(i));
  return { review, counted, other };
}
