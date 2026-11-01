/**
 * The expense this new one seems to repeat, or null: the same amount with the
 * same description (any case) within a day, or the same amount and category
 * within ten minutes. It only asks; the person can always add it anyway.
 */
const TEN_MINUTES = 10 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

export function findDuplicate(expenses, { amount, category, description }, now = Date.now()) {
  const name = String(description || '').trim().toLowerCase();
  return (expenses || []).find((e) => {
    if (Number(e.amount) !== Number(amount)) return false;
    const age = now - Date.parse(e.occurred_at || e.created_at);
    if (!(age >= 0)) return false;
    if (name && String(e.description || '').trim().toLowerCase() === name && age < DAY) return true;
    return e.category === category && age < TEN_MINUTES;
  }) || null;
}
