/**
 * Afford-It Check — "Before you spend, know if you can afford it."
 *
 * A dashboard card that opens a sheet: the user types a price, the backend
 * (POST /api/decisions/afford) checks it against Safe-to-Spend, bills still
 * due, the savings target and their usual spending, and the answer shows in
 * a few seconds: Comfortable, Wait, or Too tight.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, X, Loader2, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiJson } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';
import { billDueIn, inr, parseAmount, quotaLine, verdictBadge } from '../lib/moneyDisplay';

const VERDICT_WORD = { can_afford: 'Comfortable', wait: 'Wait', not_comfortable: 'Too tight' };
const VERDICT_TONE = { can_afford: 'text-accent', wait: 'text-warn', not_comfortable: 'text-danger' };

function Fact({ label, value, sub }) {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-3 py-1.5">
      <dt className="shrink-0 whitespace-nowrap text-sm text-zinc-400">{label}</dt>
      <dd className="text-right">
        <span className="block font-mono-finance text-base font-bold text-white">{value}</span>
        {sub && <span className="block text-xs text-zinc-500">{sub}</span>}
      </dd>
    </div>
  );
}

function Result({ check, quota, onAgain, onClose }) {
  const badge = verdictBadge(check.verdict);
  const quotaText = quotaLine(quota);
  const bill = check.nextBill;
  return (
    <div className="v-enter space-y-4" aria-live="polite">
      <div>
        <p className={`flex items-center gap-2 text-3xl font-bold tracking-tight ${VERDICT_TONE[check.verdict] || 'text-ink'}`}>
          <span aria-hidden="true" className="text-2xl">{badge.symbol}</span>{VERDICT_WORD[check.verdict] || badge.label}
        </p>
        <p className="mt-1 text-sm text-ink-soft">{check.headline}</p>
      </div>

      <dl className="v-rows rounded-2xl bg-surface-2 px-4">
        {check.shortfall
          ? <Fact label="Short by" value={inr(check.shortfall)} sub="over what's safe this month" />
          : <Fact label="After this purchase" value={`${inr(check.leftAfter)} left`} sub={check.daysLeft > 0 ? `about ${inr(check.leftAfterPerDay)}/day` : null} />}
        {bill && <Fact label="Upcoming bill" value={inr(bill.amount)} sub={`${bill.name} · ${billDueIn(bill.dueDay, new Date().getDate())}`} />}
        {check.saferDate && <Fact label="Safer date" value={check.saferDate.label} sub="when your new month starts" />}
      </dl>

      <details className="rounded-xl px-1 text-xs text-zinc-400">
        <summary className="flex min-h-[40px] cursor-pointer list-none items-center gap-1.5 font-semibold text-zinc-300">
          <Info className="h-3.5 w-3.5" aria-hidden="true" /> {check.confidence === 'low' ? 'Why? (limited data)' : 'Why?'}
        </summary>
        <p className="mt-1 text-zinc-300">{check.detail}</p>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {check.assumptions.map((x) => <li key={x}>{x}</li>)}
          {check.missing.map((m) => <li key={m}>Not known: {m}</li>)}
        </ul>
      </details>

      {quotaText && <p className="text-center text-[11px] text-zinc-500">{quotaText}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={onAgain} className="v-press v-btn-secondary min-h-[3rem] flex-1">Check another</button>
        <button type="button" onClick={onClose} className="v-press v-btn-primary flex-1">Done</button>
      </div>
    </div>
  );
}

export function AffordItSheet({ onClose }) {
  const { session } = useAuth();
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const parsed = parseAmount(amount);
    if (parsed.error) { setError(parsed.error); return; }
    setLoading(true);
    setError('');
    try {
      const body = { amount: parsed.amount, ...(label.trim() ? { label: label.trim().slice(0, 60) } : {}) };
      const data = await apiJson('/decisions/afford', { session, method: 'POST', body });
      setResult({ check: data.check, quota: data.quota });
    } catch (err) {
      setError(friendlyError(err, "We couldn't check that just now. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const again = () => { setResult(null); setAmount(''); setLabel(''); setError(''); };

  return (
    <motion.div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="v-scrim absolute inset-0" onClick={onClose} />
      <motion.div
        role="dialog" aria-modal="true" aria-labelledby="afford-title"
        className="v-sheet relative z-10 max-h-[92vh] w-full max-w-md overflow-y-auto p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'tween', duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-surface-3 sm:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <h2 id="afford-title" className="text-lg font-bold text-ink">Can I afford this?</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="v-press flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-ink-2"><X className="h-4 w-4" /></button>
        </div>

        {result ? (
          <Result check={result.check} quota={result.quota} onAgain={again} onClose={onClose} />
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="afford-amount" className="v-field-label">Amount</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-semibold text-ink-2">₹</span>
                <input
                  id="afford-amount" autoFocus inputMode="decimal" placeholder="2,499" value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="v-input pl-8 font-mono-finance text-lg"
                />
              </div>
            </div>
            <div>
              <label htmlFor="afford-label" className="v-field-label">What is it? (optional)</label>
              <input
                id="afford-label" maxLength={60} placeholder="Headphones" value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="v-input"
              />
            </div>
            {error && <p role="alert" className="v-error">{error}</p>}
            <button type="submit" disabled={loading} className="v-press v-btn-primary w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check'}
            </button>
            <p className="text-center text-xs leading-relaxed text-ink-3">Checked against your budget, bills still due, savings target and usual spending. Vittova doesn't know your income or bank balance.</p>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
}

export default function AffordItCard() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Home's one main action: a button, with one line saying what it does. */}
      <section className="v-enter" aria-labelledby="afford-entry">
        <button type="button" id="afford-entry" onClick={() => setOpen(true)} className="v-press v-btn-primary w-full">
          <ShoppingBag className="h-[18px] w-[18px]" aria-hidden="true" /> Check a purchase
        </button>
        <p className="mt-2 text-center text-xs text-ink-3">See whether something fits before you buy it.</p>
      </section>
      <AnimatePresence>{open && <AffordItSheet onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}
