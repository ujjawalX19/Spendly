/**
 * rewardsDisplay — how v1.14 rewards are worded on screen. Pure. Nothing here
 * calculates a reward: every number comes from the server.
 */

const n = (v) => Math.round(Number(v) || 0).toLocaleString('en-IN');

/** "+25 XP · +8 Points", or the parts that are not zero. */
export function rewardLine({ xp = 0, points = 0 } = {}, { signed = true } = {}) {
  const sign = (v) => (signed && v > 0 ? '+' : v < 0 ? '−' : '');
  const parts = [];
  if (xp) parts.push(`${sign(xp)}${n(Math.abs(xp))} XP`);
  if (points) parts.push(`${sign(points)}${n(Math.abs(points))} Point${Math.abs(points) === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

/** A mission day on the Rewards screen. Calm words: a day is "not kept", never "failed". */
export function missionDayStatus(status) {
  return {
    active: { label: 'Today', tone: 'neutral' },
    earned: { label: 'Earned', tone: 'good' },
    pending: { label: 'Being checked', tone: 'neutral' },
    missed: { label: 'Not kept', tone: 'neutral' },
  }[status] || { label: 'Today', tone: 'neutral' };
}

/** A reward history event's status. */
export function eventStatus(event) {
  if (event.status === 'reversal') return { label: 'Reversed', tone: 'warn' };
  if (event.status === 'reversed') return { label: 'Later reversed', tone: 'neutral' };
  return { label: 'Confirmed', tone: 'good' };
}

export const DIFFICULTY_ORDER = ['easy', 'balanced', 'advanced'];

/** The difficulty picker's options, from the server's definitions. */
export function difficultyOptions(missions) {
  const defs = missions?.difficulties || [];
  return [
    { key: 'auto', label: 'Automatic', summary: 'Starts Easy and adjusts to how your missions go, one step at a time.' },
    ...defs.map((d) => ({ key: d.key, label: d.label, summary: d.summary })),
  ];
}

/**
 * "₹180 of ₹540" style progress for a mission, or null. A "none at all"
 * mission (a target of ₹0) has no bar: "₹2,499 of ₹0" says nothing useful.
 */
export function missionProgress(progress) {
  if (!progress || progress.unit !== 'inr') return null;
  const current = Number(progress.current) || 0;
  const target = Number(progress.target) || 0;
  if (target <= 0) return null;
  return {
    text: `₹${n(current)} of ₹${n(target)}`,
    percent: Math.min(100, Math.round((current / target) * 100)),
    over: current > target,
  };
}

/** Time left in the mission day, in words: "5 h 20 min left". */
export function timeLeft(deadlineIso, now = Date.now()) {
  const ms = Date.parse(deadlineIso) - now;
  if (!(ms > 0)) return 'Day ended';
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h} h ${m} min left` : `${m} min left`;
}

/** Goal pace in plain words. */
export function goalPace(goal) {
  return {
    reached: 'Reached',
    on_track: 'On track',
    behind: 'A little behind',
    past_date: 'Target date passed',
    archived: 'Archived',
  }[goal?.pace] || '';
}

/** The share card's lines: only what the server put in `share` (no amounts). */
export function shareCardLines(share) {
  if (!share) return [];
  return [
    ...share.stats.map((s) => ({ label: s.label, value: s.value })),
    { label: 'This week', value: share.budget },
  ];
}

/** Plain-text version of the share card. */
export function shareCardText(share) {
  if (!share) return '';
  const stats = share.stats.map((s) => `${s.label}: ${s.value}`).join(' · ');
  return `${share.title}\n${stats}\n${share.level} · ${share.budget}\nBuilding better money habits with Vittova. vittova.in`;
}
