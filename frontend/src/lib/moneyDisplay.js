/**
 * moneyDisplay — presentation helpers for the v1.1 money decisions and Money
 * Streak. No figures are calculated here: every number comes from the API
 * (backend/lib/moneyDecisions.js, backend/lib/moneyStreak.js). This only maps
 * results to labels and colours, and reads what the user typed.
 */

export const inr = (v) => `₹${Math.round(Number(v) || 0).toLocaleString('en-IN')}`;

/** Afford-It verdict → badge. Never shaming: "Too tight" describes the month, not the person. */
export const VERDICT = {
  can_afford: { label: 'Comfortable', symbol: '✓', tone: 'good' },
  wait: { label: 'Wait', symbol: '!', tone: 'warn' },
  not_comfortable: { label: 'Too tight', symbol: '✕', tone: 'bad' },
};

/** Month Shape / SIP state → badge. */
export const STATE = {
  comfortable: { label: 'Comfortable', tone: 'good' },
  watch: { label: 'Watch spending', tone: 'warn' },
  tight: { label: 'Tight', tone: 'bad' },
};

// A status is coloured text, not a filled badge: the colour carries the
// meaning and the row stays calm.
export const TONE_CLASSES = {
  good: 'text-accent',
  warn: 'text-warn',
  bad: 'text-danger',
};

export function verdictBadge(verdict) {
  const v = VERDICT[verdict] || VERDICT.wait;
  return { ...v, className: TONE_CLASSES[v.tone] };
}

export function stateBadge(state) {
  const s = STATE[state] || STATE.watch;
  return { ...s, className: TONE_CLASSES[s.tone] };
}

const MAX_AMOUNT = 10_000_000;

/**
 * Read a rupee amount as people type it: "2499", "2,499", "₹2,499.50",
 * "2.5k", "1.2 lakh". Returns { amount } or { error } with a sentence to show.
 */
export function parseAmount(input) {
  const raw = String(input ?? '').trim().toLowerCase().replace(/[₹,\s]|rs\.?|inr/g, '');
  if (!raw) return { error: 'Enter an amount.' };
  const m = /^(\d+(?:\.\d+)?)(k|l|lakh|lac)?$/.exec(raw);
  if (!m) return { error: 'Enter the amount in rupees, for example 2499.' };
  const mult = m[2] === 'k' ? 1000 : m[2] ? 100000 : 1;
  const amount = Math.round(Number(m[1]) * mult * 100) / 100;
  if (!(amount > 0)) return { error: 'The amount must be more than ₹0.' };
  if (amount > MAX_AMOUNT) return { error: 'The amount can be at most ₹1,00,00,000.' };
  return { amount };
}

/** "4 of 5 free checks left today" — null for unlimited (Pro) or unknown. */
export function quotaLine(quota) {
  if (!quota || quota.limit == null) return null;
  const left = Math.max(0, Number(quota.remaining) || 0);
  return `${left} of ${quota.limit} free check${quota.limit === 1 ? '' : 's'} left today`;
}

/** Money Streak day dot → classes and accessible label. */
export function dayDot(status) {
  switch (status) {
    case 'kept': return { className: 'bg-flame text-on-fill', label: 'kept', mark: '✓' };
    case 'missed': return { className: 'bg-surface-3 text-ink-3', label: 'missed', mark: '–' };
    case 'today': return { className: 'bg-transparent text-flame ring-2 ring-flame', label: 'today', mark: '?' };
    case 'not_started': return { className: 'bg-surface-3/60 text-ink-3', label: 'before your streak started', mark: '' };
    default: return { className: 'bg-surface-3/60 text-ink-3', label: 'upcoming', mark: '' };
  }
}

/** Today's mission status → short label. */
export function missionStatus(status) {
  return {
    done: { label: 'Done', tone: 'good' },
    on_track: { label: 'On track', tone: 'good' },
    to_do: { label: 'To do', tone: 'warn' },
    missed: { label: 'Missed today', tone: 'bad' },
  }[status] || { label: 'To do', tone: 'warn' };
}

/** Compact axis labels that never collide: 1500 → ₹1.5k, 2000 → ₹2k. */
export function compactInr(v) {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  const trim = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(1).replace(/\.0$/, ''));
  if (abs >= 100000) return `₹${trim(Math.round((n / 100000) * 10) / 10)}L`;
  if (abs >= 1000) return `₹${trim(Math.round((n / 1000) * 10) / 10)}k`;
  return `₹${Math.round(n)}`;
}

/** When a monthly bill falls due, from its day of the month: "today", "tomorrow", "in 5 days". */
export function billDueIn(dueDay, todayDay) {
  const days = Number(dueDay) - Number(todayDay);
  if (!(days >= 0)) return `on the ${dueDay}`;
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `in ${days} days`;
}
