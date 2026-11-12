/**
 * Money-Saved — purchases the person skipped after an Afford-It check, and
 * lower prices they recorded. Self-reported: Vittova can't see a bank balance,
 * and this is money not spent, not money set aside.
 */
import { useCallback, useEffect, useState } from 'react';
import { PiggyBank, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiJson } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';
import { EmptyState, ErrorState, Skeleton } from '../components/ui';
import BackButton from '../components/BackButton';
import AskVittova from '../components/AskVittova';

const inr = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const KIND = { skipped_purchase: 'Skipped purchase', price_difference: 'Lower price' };
const FIELD = 'min-h-[44px] w-full rounded-xl border border-line-strong bg-surface-2 px-3 text-ink';

export default function MoneySaved() {
  const { session } = useAuth();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: '', usualPrice: '', paidPrice: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setData(await apiJson('/planning/savings-ledger', { session }));
    } catch {
      setFailed(true);
    }
  }, [session]);
  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiJson('/planning/savings-ledger/price-difference', { session, method: 'POST', body: { label: form.label, usualPrice: Number(form.usualPrice), paidPrice: Number(form.paidPrice) } });
      setForm({ label: '', usualPrice: '', paidPrice: '' });
      setAdding(false);
      load();
    } catch (err) {
      setError(friendlyError(err, "We couldn't save that. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    setError('');
    try {
      await apiJson(`/planning/savings-ledger/${id}`, { session, method: 'DELETE' });
      load();
    } catch (err) {
      setError(friendlyError(err, "We couldn't remove that."));
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 pb-24 md:p-6">
      <BackButton />
      <h1 className="text-2xl font-bold text-ink">Money-Saved</h1>
      {failed && <ErrorState onRetry={load} message="We couldn't load this. Your data wasn't changed." />}
      {!failed && !data && <Skeleton className="h-48 w-full" />}
      {data && (
        <>
          <section className="v-block p-4">
            <p className="v-label">Not spent so far</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-ink">{inr(data.total)}</p>
            <p className="mt-1 text-xs text-ink-3">From what you recorded. This is money you chose not to spend, not a balance Vittova can see.</p>
          </section>
          {!adding && <button type="button" onClick={() => setAdding(true)} className="v-press v-btn-secondary min-h-[48px] w-full">Record a lower price</button>}
          {adding && (
            <form onSubmit={submit} className="v-block space-y-3 p-4">
              <div><label htmlFor="ms-label" className="mb-1 block text-xs font-medium text-ink-2">What did you buy?</label><input id="ms-label" required maxLength={60} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className={FIELD} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label htmlFor="ms-usual" className="mb-1 block text-xs font-medium text-ink-2">Usual price (₹)</label><input id="ms-usual" type="number" inputMode="decimal" min="0.01" step="0.01" required value={form.usualPrice} onChange={(e) => setForm({ ...form, usualPrice: e.target.value })} className={FIELD} /></div>
                <div><label htmlFor="ms-paid" className="mb-1 block text-xs font-medium text-ink-2">You paid (₹)</label><input id="ms-paid" type="number" inputMode="decimal" min="0" step="0.01" required value={form.paidPrice} onChange={(e) => setForm({ ...form, paidPrice: e.target.value })} className={FIELD} /></div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={busy} className="v-press v-btn-primary min-h-[44px] px-4 text-sm disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
                <button type="button" onClick={() => setAdding(false)} className="v-press v-btn-secondary">Cancel</button>
              </div>
            </form>
          )}
          {error && <p role="alert" className="px-1 text-sm text-danger">{error}</p>}
          {data.total > 0 && <AskVittova screen="saved" question="Where should my savings go?" />}
          {data.events.length === 0
            ? <EmptyState icon={PiggyBank} title="Nothing here yet" body="Skip a purchase after an Afford-It check, or record a lower price, and it will show here." />
            : (
              <ul className="v-block v-rows px-4">
                {data.events.map((e) => (
                  <li key={e.id} className="flex min-h-[56px] items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0"><span className="block truncate font-medium text-ink">{e.label || KIND[e.kind]}</span><span className="block text-xs text-ink-3">{KIND[e.kind]}</span></span>
                    <span className="flex shrink-0 items-center"><span className="tabular-nums text-ink">{inr(e.amount)}</span>
                      <button type="button" aria-label={`Remove ${e.label || KIND[e.kind]}`} onClick={() => remove(e.id)} className="flex h-11 w-11 items-center justify-center text-ink-3"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </>
      )}
    </div>
  );
}
