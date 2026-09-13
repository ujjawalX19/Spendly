/**
 * streak — one definition of "what happens to a streak when a user acts".
 *
 * This logic previously existed in three copies (expenses.js, the streaks
 * check-in route, and the streaks status route), each computing calendar days
 * from the server's UTC clock. They could and did disagree.
 *
 * These functions are pure: give them the stored profile values and an
 * explicit `now`, and they return what to store. No database, no clock.
 */

const { calendarDaysBetween } = require('./appTime');

/**
 * Advance a streak because the user just did something that counts.
 *
 * @param {object}   profile
 * @param {number}   profile.streak_current
 * @param {number}   profile.streak_longest
 * @param {string|Date|null} profile.streak_last_log
 * @param {Date}     now
 * @returns {{streak_current:number, streak_longest:number, streak_last_log:string, incremented:boolean}}
 */
function advanceStreak(profile, now = new Date()) {
    const current = Number(profile?.streak_current) || 0;
    const longest = Number(profile?.streak_longest) || 0;
    const lastLog = profile?.streak_last_log ? new Date(profile.streak_last_log) : null;

    let next;
    let incremented;

    if (!lastLog || Number.isNaN(lastLog.getTime())) {
        // First ever qualifying action.
        next = 1;
        incremented = true;
    } else {
        const gap = calendarDaysBetween(lastLog, now);
        if (gap <= 0) {
            // Same local day (or a clock skew that looks like the past) —
            // acting twice in one day must not inflate the streak.
            next = Math.max(current, 1);
            incremented = false;
        } else if (gap === 1) {
            next = current + 1;
            incremented = true;
        } else {
            // A full local day was missed; the streak restarts at today.
            next = 1;
            incremented = true;
        }
    }

    return {
        streak_current: next,
        streak_longest: Math.max(longest, next),
        streak_last_log: now.toISOString(),
        incremented,
    };
}

/**
 * Describe a streak without modifying it — used by the status endpoint.
 *
 * 'active'  — the user has already acted today.
 * 'at_risk' — the last action was yesterday and today is still empty.
 * 'broken'  — a whole local day passed with no action.
 *
 * @returns {'active'|'at_risk'|'broken'|'none'}
 */
function streakStatus(lastLogAt, actedToday, now = new Date()) {
    if (!lastLogAt) return 'none';
    const lastLog = lastLogAt instanceof Date ? lastLogAt : new Date(lastLogAt);
    if (Number.isNaN(lastLog.getTime())) return 'none';

    const gap = calendarDaysBetween(lastLog, now);
    if (gap > 1) return 'broken';
    if (gap === 1) return actedToday ? 'active' : 'at_risk';
    return 'active';
}

module.exports = { advanceStreak, streakStatus };
