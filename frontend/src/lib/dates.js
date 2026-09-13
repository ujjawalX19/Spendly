/**
 * Calendar helpers for figures computed on the device, in the device's own
 * timezone. (The server does the same maths explicitly in IST.)
 */

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' for the local calendar day of `date`. */
export function localDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight at the start of the current month. */
export function startOfLocalMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * The last `n` local calendar days including today, oldest first.
 * @returns {Array<{key: string, label: string, start: Date}>}
 */
export function lastNDays(n, now = new Date()) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    // Constructing from parts keeps this correct across DST changes.
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push({
      key: localDateKey(start),
      label: start.toLocaleDateString('en-IN', { weekday: 'short' }),
      start,
    });
  }
  return days;
}
