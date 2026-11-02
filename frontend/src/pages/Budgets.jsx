/**
 * Budgets — a monthly limit per category, next to what has been spent in it.
 * The overall monthly budget stays in Profile, and is shown here for context.
 * Figures come from GET /api/planning/report; nothing is estimated.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Target } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiJson } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';
import { markStep } from '../lib/homePrefs';
import { ErrorState, Skeleton } from '../components/ui';
import BackButton from '../components/BackButton';

const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Recharge', 'Entertainment', 'Rent', 'Other'];
const inr = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function CategoryRow({ name, spent, limit, onSave, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(limit ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const over = limit != null && spent > limit;
  const pct = limit ? Math.min(100, Math.round((spent / limit) * 100)) : 0;

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSave(name, Number(value));
      setEditing(false);
    } catch (err) {
      setError(friendlyError(err, "We couldn't save that. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="py-3">
      <div className="flex min-h-[44px] items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{name}</p>
          <p className={`text-xs tabular-nums ${over ? 'font-semibold text-danger' : 'text-ink-3'}`}>
            {inr(spent)} spent{limit != null ? ` of ${inr(limit)}${over ? ` · ${inr(spent - limit)} over` : ''}` : ' · no limit'}
          </p>
        </div>
        {!editing && (
          <button type="button" onClick={() => { setValue(limit ?? ''); setEditing(true); }} className="v-press v-btn-secondary shrink-0" aria-label={`${limit != null ? 'Change' : 'Set'} limit for ${name}`}>
            {limit != null ? 'Change' : 'Set limit'}
          </button>
        )}
      </div>
      {limit != null && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${name} budget used`}>
          <div className={`h-full rounded-full ${over ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      {editing && (
        <form onSubmit={save} className="mt-2">
          <label htmlFor={`limit-${name}`} className="mb-1 block text-xs font-medium text-ink-2">Monthly limit for {name} (₹)</label>
          <input id={`limit-${name}`} type="number" inputMode="numeric" min="1" step="1" required autoFocus value={value} onChange={(e) => setValue(e.target.value)}
            className="min-h-[44px] w-full rounded-xl border border-line-strong bg-surface-2 px-3 text-ink" />
          {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="v-press v-btn-primary min-h-[44px] px-4 text-sm disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => setEditing(false)} className="v-press v-btn-secondary">Cancel</button>
            {limit != null && <button type="button" disabled={busy} onClick={() => { onRemove(name).then(() => setEditing(false)).catch((err) => setError(friendlyError(err, "We couldn't remove that."))); }} className="v-press v-btn-text">Remove limit</button>}
          </div>
        </form>
      )}
    </li>
  );
}

export default function Budgets() {
  const { session, user } = useAuth();
  const [limits, setLimits] = useState(null);
  const [report, setReport] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [b, r] = await Promise.all([
        apiJson('/planning/category-budgets', { session }),
        apiJson('/planning/report?period=month', { session }),
      ]);
      setLimits(Object.fromEntries(b.budgets.map((x) => [x.category, x.limit_inr])));
      setReport(r.report);
    } catch {
      setFailed(true);
    }
  }, [session]);
  useEffect(() => { load(); }, [load]);

  const onSave = async (category, limit) => {
    await apiJson(`/planning/category-budgets/${category}`, { session, method: 'PUT', body: { limit_inr: limit } });
    markStep('budget');
    setLimits((l) => ({ ...l, [category]: limit }));
  };
  const onRemove = async (category) => {
    await apiJson(`/planning/category-budgets/${category}`, { session, method: 'DELETE' });
    setLimits((l) => { const next = { ...l }; delete next[category]; return next; });
  };

  const spentIn = (name) => report?.categories.find((c) => c.category === name)?.amount ?? 0;
  const total = limits ? Object.values(limits).reduce((a, b) => a + b, 0) : 0;
  const budget = user?.monthly_budget;

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 pb-24 md:p-6">
      <BackButton />
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink"><Target className="h-6 w-6 text-ink-2" aria-hidden="true" /> Budgets</h1>
        <p className="mt-1 text-sm text-ink-2">Set a monthly limit for any category you want to watch.</p>
      </div>
      {failed && <ErrorState onRetry={load} message="We couldn't load your budgets. Your data wasn't changed." />}
      {!failed && (!limits || !report) && <Skeleton className="h-64 w-full" />}
      {!failed && limits && report && (
        <>
          <section className="v-block p-4">
            <p className="v-label">{report.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{inr(report.totalSpent)} <span className="text-sm font-normal text-ink-2">spent</span></p>
            {budget ? <p className="mt-1 text-xs text-ink-3">Overall monthly budget: {inr(budget)}. <Link to="/settings" className="underline">Change in Profile</Link></p> : null}
            {budget && total > budget ? <p role="status" className="mt-2 text-xs font-medium text-warn">Your category limits add up to {inr(total)}, more than your overall budget.</p> : null}
          </section>
          <ul className="v-block v-rows px-4">
            {CATEGORIES.map((name) => <CategoryRow key={name} name={name} spent={spentIn(name)} limit={limits[name] ?? null} onSave={onSave} onRemove={onRemove} />)}
          </ul>
        </>
      )}
    </div>
  );
}
