/**
 * expenseDisplay — how an expense row is worded in lists. The stored values
 * (`source: 'upi_auto'`, "Receipt from D-Mart") are for the system; people see
 * plain words.
 *
 * No imports, so it is unit tested in plain Node (tests/expenseDisplay.test.js).
 */

const SOURCE_LABELS = {
  upi_auto: 'Auto-tracked',
  ai_scan: 'Receipt scan',
  pdf_import: 'Statement import',
};

/** How the expense got here, or '' for one typed in by hand (the normal case needs no label). */
export function sourceLabel(source) {
  return SOURCE_LABELS[source] || '';
}

/** The name shown for an expense: who was paid, never an internal prefix. */
export function expenseTitle(row) {
  const description = String(row?.description || '').trim();
  if (!description) return row?.category || 'Expense';
  // A scan is stored as "Receipt from <merchant>"; the source label already says it was a receipt.
  if (row?.source === 'ai_scan') {
    const merchant = description.replace(/^Receipt from\s+/i, '').trim();
    return merchant && merchant.toLowerCase() !== 'unknown' ? merchant : 'Receipt';
  }
  return description;
}

/** "Food · Auto-tracked", or just "Food". */
export function expenseMeta(row) {
  const parts = [row?.category || 'Other', sourceLabel(row?.source)].filter(Boolean);
  return parts.join(' · ');
}

/**
 * Rows (already sorted) grouped under their day label, with each day's total.
 * @param {object[]} rows
 * @param {(iso: string) => string} dayLabel
 * @returns {{ label: string, total: number, rows: object[] }[]}
 */
export function groupByDay(rows, dayLabel) {
  const groups = [];
  for (const row of rows || []) {
    const label = dayLabel(row.occurred_at || row.created_at);
    let group = groups[groups.length - 1];
    if (!group || group.label !== label) {
      group = { label, total: 0, rows: [] };
      groups.push(group);
    }
    group.rows.push(row);
    group.total += Number(row.amount) || 0;
  }
  return groups;
}
