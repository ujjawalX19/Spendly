/**
 * aiActions — runs an action Vittova AI proposed, only after the person taps
 * to confirm it, through the same validated endpoints the rest of the app
 * uses. The server chose the action and its values from the user's own data;
 * nothing here trusts free text from the model.
 *
 * Returns { ok, message } or { navigate } for actions that open a screen.
 */
import { apiJson } from './apiConfig';

import { int, isRunnable } from './aiActionRules';

export { isRunnable };

export async function runAction(action, session) {
  if (!isRunnable(action)) return { ok: false, message: 'This action is not available in this version of the app.' };
  const a = action.args;
  switch (action.tool) {
    case 'create_budget':
    case 'update_budget':
      await apiJson(`/planning/category-budgets/${a.category}`, { session, method: 'PUT', body: { limit_inr: a.limit_inr } });
      return { ok: true, message: `${a.category} limit set.` };
    case 'create_savings_goal':
      await apiJson('/goals', { session, method: 'POST', body: { name: a.name, targetInr: a.targetInr, targetDate: a.targetDate, ...(int(a.planMonthlyInr) ? { planMonthlyInr: a.planMonthlyInr } : {}) } });
      return { ok: true, message: `Goal "${a.name}" created.` };
    case 'set_savings_target':
      await apiJson('/account/investment-target', { session, method: 'PUT', body: { investment_target: a.investment_target } });
      return { ok: true, message: 'Savings target saved.' };
    case 'create_reminder':
      return { ok: true, navigate: '/alerts' };
    case 'remember':
      await apiJson('/ai/memory', { session, method: 'POST', body: { kind: a.kind, content: a.content } });
      return { ok: true, message: 'Remembered. You can change it in Vittova AI memory.' };
    default:
      return { ok: false, message: 'This action is not available.' };
  }
}
