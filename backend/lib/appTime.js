/**
 * appTime — timezone-correct date boundaries for Spendly's money math.
 *
 * WHY THIS EXISTS
 * ---------------
 * Spendly's backend runs on Render, whose containers are UTC. Its users are in
 * India (UTC+05:30). Every financial boundary in the app — "this month's
 * spending", "days remaining", "did you log an expense today", "daily free-tier
 * quota" — is a *calendar* question, and calendar questions must be answered in
 * the user's timezone, not the server's.
 *
 * Computing `new Date(now.getFullYear(), now.getMonth(), 1)` on a UTC server
 * produces 1st 00:00 UTC, which is 1st 05:30 IST. Two concrete bugs follow:
 *
 *   1. Every expense a user logs between midnight and 05:30 IST on the 1st is
 *      attributed to the *previous* month.
 *   2. `new Date().getDate()` returns the UTC day, so between 18:30 and 23:59
 *      IST — peak spending hours in India — the server believes it is still
 *      yesterday. Streaks miss, "days remaining" is off by one, and daily
 *      quotas reset at 05:30 IST instead of midnight.
 *
 * Everything here is pure and deterministic: pass an explicit `now` and the
 * result is fully reproducible, which is what makes the tests meaningful.
 *
 * All functions return UTC `Date` instants (what Postgres `timestamptz`
 * comparisons want) while reasoning in local calendar terms.
 */

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';

const PART_FORMATTER_CACHE = new Map();

function partFormatter(timeZone) {
    let fmt = PART_FORMATTER_CACHE.get(timeZone);
    if (!fmt) {
        fmt = new Intl.DateTimeFormat('en-US', {
            timeZone,
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
        PART_FORMATTER_CACHE.set(timeZone, fmt);
    }
    return fmt;
}

/**
 * Break an instant into its wall-clock parts in the given timezone.
 * @returns {{year:number, month:number, day:number, hour:number, minute:number, second:number}}
 *          `month` is 1-based, matching how humans write dates.
 */
function zonedParts(date = new Date(), timeZone = APP_TIMEZONE) {
    const parts = {};
    for (const p of partFormatter(timeZone).formatToParts(date)) {
        if (p.type !== 'literal') parts[p.type] = p.value;
    }
    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        // Some ICU builds render midnight as "24" under hour12:false.
        hour: Number(parts.hour) % 24,
        minute: Number(parts.minute),
        second: Number(parts.second),
    };
}

/** Milliseconds that the zone is ahead of UTC at the given instant. */
function zoneOffsetMs(date, timeZone = APP_TIMEZONE) {
    const p = zonedParts(date, timeZone);
    const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return asIfUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Convert a local wall-clock time in `timeZone` to the UTC instant it denotes.
 * Two passes settle zones with DST; India has none, but the app should not
 * silently break if it ever ships elsewhere.
 */
function zonedTimeToUtc(year, month, day, hour = 0, minute = 0, second = 0, timeZone = APP_TIMEZONE) {
    const naive = Date.UTC(year, month - 1, day, hour, minute, second);
    let instant = new Date(naive - zoneOffsetMs(new Date(naive), timeZone));
    instant = new Date(naive - zoneOffsetMs(instant, timeZone));
    return instant;
}

/** UTC instant of 00:00:00 local on the 1st of `now`'s local month. */
function startOfMonth(now = new Date(), timeZone = APP_TIMEZONE) {
    const { year, month } = zonedParts(now, timeZone);
    return zonedTimeToUtc(year, month, 1, 0, 0, 0, timeZone);
}

/** UTC instant of 00:00:00 local on the 1st of the *next* local month. */
function startOfNextMonth(now = new Date(), timeZone = APP_TIMEZONE) {
    const { year, month } = zonedParts(now, timeZone);
    return month === 12
        ? zonedTimeToUtc(year + 1, 1, 1, 0, 0, 0, timeZone)
        : zonedTimeToUtc(year, month + 1, 1, 0, 0, 0, timeZone);
}

/** UTC instant of 00:00:00 local today. */
function startOfDay(now = new Date(), timeZone = APP_TIMEZONE) {
    const { year, month, day } = zonedParts(now, timeZone);
    return zonedTimeToUtc(year, month, day, 0, 0, 0, timeZone);
}

/** UTC instant of 00:00:00 local, `n` months before `now`'s local month start. */
function startOfMonthsAgo(n, now = new Date(), timeZone = APP_TIMEZONE) {
    const { year, month } = zonedParts(now, timeZone);
    const zeroBased = (year * 12 + (month - 1)) - n;
    return zonedTimeToUtc(Math.floor(zeroBased / 12), (zeroBased % 12) + 1, 1, 0, 0, 0, timeZone);
}

/** Local calendar day-of-month, 1–31. */
function dayOfMonth(now = new Date(), timeZone = APP_TIMEZONE) {
    return zonedParts(now, timeZone).day;
}

/** Number of days in `now`'s local month. */
function daysInMonth(now = new Date(), timeZone = APP_TIMEZONE) {
    const { year, month } = zonedParts(now, timeZone);
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Days left in the local month, counting today. Always >= 1. */
function daysRemainingInMonth(now = new Date(), timeZone = APP_TIMEZONE) {
    return Math.max(1, daysInMonth(now, timeZone) - dayOfMonth(now, timeZone) + 1);
}

/** 'YYYY-MM-DD' for the local calendar day — the key for daily quotas/streaks. */
function localDateKey(now = new Date(), timeZone = APP_TIMEZONE) {
    const { year, month, day } = zonedParts(now, timeZone);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 'YYYY-MM' for the local calendar month — the key for monthly quotas. */
function localMonthKey(now = new Date(), timeZone = APP_TIMEZONE) {
    const { year, month } = zonedParts(now, timeZone);
    return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Whole calendar days from `from` to `to`, measured in local days.
 * Returns 0 for the same local day, 1 for consecutive days, negative if `to`
 * precedes `from`. This — not a millisecond division — is what streak logic
 * needs, because 23:00 and 01:00 are two days apart even though only two hours
 * elapsed.
 */
function calendarDaysBetween(from, to, timeZone = APP_TIMEZONE) {
    const a = zonedParts(from, timeZone);
    const b = zonedParts(to, timeZone);
    const dayA = Date.UTC(a.year, a.month - 1, a.day);
    const dayB = Date.UTC(b.year, b.month - 1, b.day);
    return Math.round((dayB - dayA) / 86400000);
}

module.exports = {
    APP_TIMEZONE,
    zonedParts,
    zonedTimeToUtc,
    startOfMonth,
    startOfNextMonth,
    startOfMonthsAgo,
    startOfDay,
    dayOfMonth,
    daysInMonth,
    daysRemainingInMonth,
    localDateKey,
    localMonthKey,
    calendarDaysBetween,
};
