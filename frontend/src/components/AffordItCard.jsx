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
const VERDICT_TONE = { can_afford: 'text-lime-300', wait: 'text-amber-300', not_comfortable: 'text-rose-300' };

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
        <p className={`flex items-center gap-2 text-4xl font-black tracking-tight ${VERDICT_TONE[check.verdict] || 'text-white'}`}>
          <span aria-hidden="true" className="text-3xl">{badge.symbol}</span>{VERDICT_WORD[check.verdict] || badge.label}
        </p>
        <p className="mt-1 text-sm text-zinc-300">{check.headline}</p>
      </div>

      <dl className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.06] bg-black/30 px-3.5">
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
        <button type="button" onClick={onAgain} className="v-press h-12 flex-1 rounded-2xl border border-white/10 bg-zinc-800 text-sm font-bold text-zinc-200">Check another</button>
        <button type="button" onClick={onClose} className="v-press h-12 flex-1 rounded-2xl bg-lime-400 text-sm font-black text-black">Done</button>
      </div>
    </div>
  );
}

function AffordItSheet({ onClose }) {
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
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        role="dialog" aria-modal="true" aria-labelledby="afford-title"
        className="relative z-10 max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-zinc-800 bg-zinc-900 p-6 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 340, damping: 30 }}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-zinc-700 sm:hidden" />
        <div className="mb-5 flex items-center justify-between">
          <h2 id="afford-title" className="text-lg font-bold text-zinc-100">Can I afford this?</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl bg-zinc-800 p-2 text-zinc-400"><X className="h-4 w-4" /></button>
        </div>

        {result ? (
          <Result check={result.check} quota={result.quota} onAgain={again} onClose={onClose} />
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="afford-amount" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Amount</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-400">₹</span>
                <input
                  id="afford-amount" autoFocus inputMode="decimal" placeholder="2,499" value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-2xl border border-zinc-700 bg-zinc-800 py-3.5 pl-8 pr-4 font-mono-finance text-lg text-zinc-100 outline-none transition-all placeholder:text-zinc-600 focus:border-lime-500/60 focus:ring-2 focus:ring-lime-500/15"
                />
              </div>
            </div>
            <div>
              <label htmlFor="afford-label" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-widest text-zinc-500">What is it? (optional)</label>
              <input
                id="afford-label" maxLength={60} placeholder="Headphones" value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full rounded-2xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-zinc-100 outline-none transition-all placeholder:text-zinc-600 focus:border-lime-500/60 focus:ring-2 focus:ring-lime-500/15"
              />
            </div>
            {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
            <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-lime-400 py-3.5 text-sm font-black tracking-wide text-black disabled:opacity-60">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check'}
            </button>
            <p className="text-center text-[11px] leading-relaxed text-zinc-500">Checked against your budget, bills still due, savings target and usual spending. Vittova doesn't know your income or bank balance.</p>
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
      <section className="v-enter rounded-[20px] border border-lime-400/20 bg-[#111113] p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime-400/15"><ShoppingBag className="h-5 w-5 text-lime-300" aria-hidden="true" /></span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white">Can I afford something?</h2>
            <p className="text-xs text-zinc-400">Check a purchase before you spend.</p>
          </div>
        </div>
        <button type="button" onClick={() => setOpen(true)}
          className="v-press mt-3 h-12 w-full rounded-2xl bg-lime-400 text-[15px] font-black text-black">
          Check a purchase
        </button>
      </section>
      <AnimatePresence>{open && <AffordItSheet onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}
