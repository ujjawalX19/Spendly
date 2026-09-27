/**
 * age — the app's side of age-aware accounts. The server decides (backend/
 * lib/ageAccess.js); this only mirrors the rule for instant feedback at signup
 * and remembers a sign-up answer until the account can store it.
 *
 * Age is counted from the month AFTER the birth month, exactly as the server
 * does, so nobody is treated as older than they are.
 */

export const ADULT_AGE = 18;
const PENDING_KEY = 'vittova.pendingBirthYearMonth.v1';
const FORMAT = /^(19|20)\d{2}-(0[1-9]|1[0-2])$/;

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function ageFrom(birthYearMonth, now = new Date()) {
  if (!FORMAT.test(String(birthYearMonth || ''))) return null;
  const [y, m] = birthYearMonth.split('-').map(Number);
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 <= m) age -= 1;
  return age;
}

/** Years offered in the picker: this year back 100 years, newest first. No default. */
export function yearOptions(now = new Date()) {
  const y = now.getFullYear();
  return Array.from({ length: 101 }, (_, i) => y - i);
}

export function toBirthYearMonth(year, month) {
  if (!year || !month) return null;
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function rememberPendingAge(value) {
  try { if (FORMAT.test(value)) localStorage.setItem(PENDING_KEY, value); } catch { /* storage unavailable */ }
}
export function takePendingAge() {
  try {
    const v = localStorage.getItem(PENDING_KEY);
    localStorage.removeItem(PENDING_KEY);
    return FORMAT.test(String(v || '')) ? v : null;
  } catch { return null; }
}
