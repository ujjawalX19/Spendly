/**
 * ageAccess — who gets which Vittova experience, from the month and year of
 * birth the user gave (profiles.birth_year_month, 'YYYY-MM').
 *
 * WHY THIS EXISTS
 *   India's DPDP Act 2023 (s. 9) and DPDP Rules 2025 (Rule 10) require the
 *   verifiable consent of a parent/guardian before processing a child's
 *   (under-18) personal data, and prohibit tracking or behavioural monitoring
 *   of children and targeted advertising at them. Vittova's core features
 *   analyse spending behaviour, and it has no verifiable-consent mechanism.
 *   So the under-18 experience is built but OFF (MINOR_ACCESS_ENABLED) until a
 *   legal review approves it and a verification method exists.
 *
 * EXPERIENCES
 *   adult            18+ (or age not given yet: accounts created before the
 *                    age check; the v1.1 app asks on next launch)
 *   minor_blocked    under 18 while minor access is off, or under MIN_MINOR_AGE:
 *                    no finance features; the account can be deleted
 *   minor_pending    under 18, minor access on, guardian consent not verified yet
 *   minor            under 18, minor access on, consent verified: the teen
 *                    experience (no investing tools, sponsored rewards, Pro
 *                    purchase or investing AI; no analytics linked to them)
 *
 * Age is computed conservatively: someone born in March 2008 counts as 18
 * only from 1 April 2026 (the month after), so nobody is treated as an
 * adult early.
 */

const appTime = require('./appTime');

const ADULT_AGE = 18;
const MIN_MINOR_AGE = 15;
const FORMAT = /^(19|20)\d{2}-(0[1-9]|1[0-2])$/;

/** Features an under-18 account never gets (server-enforced). */
const ADULT_ONLY = ['safe_to_invest', 'sip_stress_test', 'investing_ai', 'sponsored_challenges', 'pro_purchase', 'pdf_import', 'subscription_audit'];

function minorAccessEnabled() {
    const raw = process.env.MINOR_ACCESS_ENABLED;
    return raw === 'true' || raw === '1';
}

/** Whole years of age, counting a birthday as the first day of the month AFTER the birth month. */
function ageFrom(birthYearMonth, now = new Date()) {
    if (!FORMAT.test(String(birthYearMonth || ''))) return null;
    const [y, m] = birthYearMonth.split('-').map(Number);
    const today = appTime.localDateKey(now);
    const [ty, tm] = today.split('-').map(Number);
    let age = ty - y;
    if (tm <= m) age -= 1; // birthday counted from the month after the birth month
    return age;
}

/** Validate an answer: real month, not in the future, not over 100 years ago. */
function validBirthYearMonth(value, now = new Date()) {
    if (!FORMAT.test(String(value || ''))) return false;
    const age = ageFrom(value, now);
    const today = appTime.localDateKey(now).slice(0, 7);
    return value <= today && age !== null && age >= 0 && age <= 100;
}

/**
 * @param {{birth_year_month?:string|null}} profile
 * @param {{status?:string}|null} consent
 */
function experienceFor(profile, consent, now = new Date()) {
    const age = ageFrom(profile?.birth_year_month, now);
    if (age === null) return { experience: 'adult', age: null, ageKnown: false };
    if (age >= ADULT_AGE) return { experience: 'adult', age, ageKnown: true };
    if (!minorAccessEnabled() || age < MIN_MINOR_AGE) return { experience: 'minor_blocked', age, ageKnown: true };
    if (consent?.status !== 'verified') return { experience: 'minor_pending', age, ageKnown: true };
    return { experience: 'minor', age, ageKnown: true };
}

const isMinor = (experience) => String(experience || '').startsWith('minor');

/**
 * API paths an under-18 account may still use when blocked or pending: see
 * their own profile and age state, delete the account, and send anonymous
 * crash reports. Everything else is refused.
 */
const BLOCKED_ALLOWLIST = [
    ['GET', /^\/api\/auth\/me$/],
    ['POST', /^\/api\/auth\/profile$/],
    ['GET', /^\/api\/account\/age$/],
    ['POST', /^\/api\/account\/age$/],
    ['DELETE', /^\/api\/account$/],
    ['GET', /^\/api\/features$/],
    ['GET', /^\/api\/pro\/status$/],
];

function allowedWhileBlocked(method, path) {
    return BLOCKED_ALLOWLIST.some(([m, re]) => m === method && re.test(path));
}

module.exports = { ADULT_AGE, MIN_MINOR_AGE, ADULT_ONLY, ageFrom, validBirthYearMonth, experienceFor, isMinor, minorAccessEnabled, allowedWhileBlocked };
