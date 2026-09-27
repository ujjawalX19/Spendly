/**
 * shareProgress — privacy-safe share text for Save-to-Earn moments.
 *
 * The user picks what to share. Nothing is included by default beyond the
 * achievement itself: no transactions, balances, budgets or categories, ever.
 * The Victory Pot amount is only added if the user ticks it, and it is always
 * labelled as an estimate.
 */

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

/**
 * @param {object} opts
 * @param {'streak'|'badge'|'challenge'} opts.kind
 * @param {number} [opts.streakDays]
 * @param {string} [opts.badgeTitle]
 * @param {string} [opts.challengeTitle]
 * @param {number|null} [opts.estimate]   only used when includeAmount is true
 * @param {boolean} [opts.includeAmount]
 */
export function shareText({ kind, streakDays, badgeTitle, challengeTitle, estimate, includeAmount = false }) {
  let line;
  if (kind === 'streak') line = `🔥 ${streakDays}-day Money Streak on Vittova.`;
  else if (kind === 'badge') line = `🏅 I earned "${badgeTitle}" on Vittova.`;
  else line = `✅ I completed "${challengeTitle}" on Vittova.`;
  const amount = includeAmount && Number(estimate) > 0 ? ` About ${inr(estimate)} of spending avoided (estimate).` : '';
  return `${line}${amount} Building better money habits. vittova.in`;
}

/** Share through the phone's share sheet, the browser, or the clipboard. Returns 'shared' | 'copied' | 'cancelled'. */
export async function shareProgress(text, { native, share, clipboard } = {}) {
  try {
    if (native) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: 'My Vittova progress', text });
      return 'shared';
    }
    if (share) { await share({ text }); return 'shared'; }
    if (clipboard) { await clipboard.writeText(text); return 'copied'; }
  } catch { return 'cancelled'; }
  return 'cancelled';
}
