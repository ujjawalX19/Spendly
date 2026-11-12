/** Which AI-proposed actions this app version can run, and whether their values are valid. No imports, so it can be tested in Node. */
const ALLOWED_CATEGORIES = ['Food', 'Transport', 'Shopping', 'Recharge', 'Entertainment', 'Rent', 'Other'];
const MEMORY_KINDS = ['income_cycle', 'goal', 'preference', 'situation', 'habit_target', 'language'];
export const int = (n) => Number.isInteger(n) && n > 0;

/** True for an action this app version knows how to run with valid values. */
export function isRunnable(action) {
  const a = action?.args || {};
  switch (action?.tool) {
    case 'create_budget':
    case 'update_budget':
      return ALLOWED_CATEGORIES.includes(a.category) && int(a.limit_inr);
    case 'create_savings_goal':
      return typeof a.name === 'string' && a.name.length <= 60 && int(a.targetInr) && /^\d{4}-\d{2}-\d{2}$/.test(a.targetDate || '');
    case 'set_savings_target':
      return Number.isInteger(a.investment_target) && a.investment_target >= 0;
    case 'create_reminder':
      return true;
    case 'remember':
      return MEMORY_KINDS.includes(a.kind) && typeof a.content === 'string' && a.content.length >= 2;
    default:
      return false;
  }
}
