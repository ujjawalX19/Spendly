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
import { ShoppingBag, X, Loader2, CalendarClock, Receipt, PieChart, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiJson } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';
import { inr, parseAmount, quotaLine, verdictBadge } from '../lib/moneyDisplay';

function Result({ check, quota, onAgain, onClose }) {
  const badge = verdictBadge(check.verdict);
  const quotaText = quotaLine(quota);
  return (
    <div className="space-y-4" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-lg font-black ${badge.className}`} aria-hidden="true">{badge.symbol}</span>
        <div>
          <p className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider ${badge.className}`}>{badge.label}</p>
          <h3 className="mt-1.5 text-base font-bold leading-snug text-white">{check.headline}</h3>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-zinc-300">{check.detail}</p>

      <dl className="space-y-2 rounded-2xl border border-zinc-800 bg-black/30 p-3.5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="flex shrink-0 items-center gap-2 whitespace-nowrap text-zinc-400"><Receipt className="h-4 w-4" /> {check.shortfall ? 'Short by' : 'Left after buying'}</dt>
          <dd className={`font-mono font-bold ${check.shortfall ? 'text-rose-300' : 'text-white'}`}>{inr(check.shortfall || check.leftAfter)}</dd>
        </div>
        {!check.shortfall && check.daysLeft > 0 && (
          <div className="flex items-center justify-between gap-3">
            <dt className="pl-6 text-xs text-zinc-500">About {inr(check.leftAfterPerDay)} a day for {check.daysLeft} day{check.daysLeft === 1 ? '' : 's'}</dt>
          </div>
        )}
        {check.nextBill && (
          <div className="flex items-center justify-between gap-3">
            <dt className="flex shrink-0 items-center gap-2 whitespace-nowrap text-zinc-400"><CalendarClock className="h-4 w-4" /> Next bill</dt>
            <dd className="text-right text-zinc-200">{check.nextBill.name} · <span className="font-mono">{inr(check.nextBill.amount)}</span> on the {check.nextBill.dueDay}{ordinal(check.nextBill.dueDay)}</dd>
          </div>
        )}
        {check.budgetImpactPercent !== null && (
          <div className="flex items-center justify-between gap-3">
            <dt className="flex shrink-0 items-center gap-2 whitespace-nowrap text-zinc-400"><PieChart className="h-4 w-4" /> Budget impact</dt>
            <dd className="text-zinc-200"><span className="font-mono">{check.budgetImpactPercent}%</span> of your monthly budget</dd>
          </div>
        )}
      </dl>

      {check.saferDate && (
        <p className="rounded-xl border border-lime-400/25 bg-lime-400/10 px-3 py-2 text-sm text-lime-200">Safer from <strong>{check.saferDate.label}</strong>, when your new month's budget starts.</p>
      )}

      {(check.confidence !== 'good' || check.missing?.length > 0) && (
        <details className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold text-zinc-300"><Info className="h-3.5 w-3.5" /> {check.confidence === 'low' ? 'Based on limited data' : 'What this is based on'}</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {check.assumptions.map((a) => <li key={a}>{a}</li>)}
            {check.missing.map((m) => <li key={m}>Not known: {m}</li>)}
          </ul>
        </details>
      )}

      {quotaText && <p className="text-center text-[11px] text-zinc-500">{quotaText}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={onAgain} className="flex-1 rounded-2xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-zinc-200">Check another</button>
        <button type="button" onClick={onClose} className="flex-1 rounded-2xl bg-lime-400 py-3 text-sm font-black text-black">Done</button>
      </div>
    </div>
  );
}

function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  return { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th';
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
          <h2 id="afford-title" className="text-lg font-bold text-zinc-100">Can I afford it?</h2>
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

export default function AffordItCard({ variants }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <motion.button
        type="button" variants={variants} onClick={() => setOpen(true)} whileTap={{ scale: 0.98 }}
        className="flex w-full items-center gap-3 rounded-2xl border border-lime-400/20 bg-[#141414] p-4 text-left"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime-400/15"><ShoppingBag className="h-5 w-5 text-lime-400" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-white">Can I afford something?</span>
          <span className="block text-xs text-[#a1a1aa]">Know before you spend</span>
        </span>
        <span className="shrink-0 rounded-xl bg-lime-400 px-3 py-2 text-xs font-black text-black">Check a purchase</span>
      </motion.button>
      <AnimatePresence>{open && <AffordItSheet onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}
