/**
 * Wealth screen cards for v1.1: Month Shape, Safe-to-Invest and the SIP
 * Stress Test. Figures come from /api/decisions (backend/lib/moneyDecisions.js),
 * the same calculation the dashboard and Vittova AI use. Nothing here
 * recommends a product or promises a return.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarRange, Sprout, Gauge, Loader2, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiJson } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';
import { inr, parseAmount, quotaLine, stateBadge } from '../lib/moneyDisplay';

function Badge({ state }) {
  const b = stateBadge(state);
  return <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${b.className}`}>{b.label}</span>;
}

function Notes({ title = 'How this is worked out', assumptions = [], missing = [] }) {
  if (!assumptions.length && !missing.length) return null;
  return (
    <details className="mt-3 rounded-xl border border-zinc-800 bg-black/30 px-3 py-2 text-xs text-zinc-400">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold text-zinc-300"><Info className="h-3.5 w-3.5" /> {title}</summary>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        {assumptions.map((a) => <li key={a}>{a}</li>)}
        {missing.map((m) => <li key={m}>Not known: {m}</li>)}
      </ul>
    </details>
  );
}

/** Stacked bar: spent | expected rest of month | bills still due | savings target | left. */
function ShapeBar({ shape }) {
  const parts = [
    { key: 'spent', label: 'Spent', value: shape.spent, className: 'bg-sky-400' },
    { key: 'expected', label: 'Usual spending ahead', value: shape.expectedRestOfMonth || 0, className: 'bg-sky-400/40' },
    { key: 'bills', label: 'Bills still due', value: shape.upcomingBills, className: 'bg-amber-300' },
    { key: 'target', label: 'Savings target', value: shape.savingsTarget, className: 'bg-violet-400' },
  ];
  const total = Math.max(shape.budget, parts.reduce((s, p) => s + p.value, 0), 1);
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-zinc-800" role="img" aria-label="How this month's budget is used and expected to be used">
        {parts.map((p) => p.value > 0 && <div key={p.key} className={p.className} style={{ width: `${(p.value / total) * 100}%` }} />)}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-400">
        {parts.filter((p) => p.value > 0).map((p) => (
          <li key={p.key} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${p.className}`} /> {p.label} {inr(p.value)}</li>
        ))}
      </ul>
    </div>
  );
}

export function MonthShapeCard({ shape, variants }) {
  if (!shape) return null;
  const end = shape.projectedMonthEnd;
  return (
    <motion.section variants={variants} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold"><CalendarRange className="h-5 w-5 text-lime-400" /> Month shape</h2>
        <Badge state={shape.state} />
      </div>
      <p className="mt-2 text-sm text-zinc-300">{shape.headline}</p>
      <div className="mt-4"><ShapeBar shape={shape} /></div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div><dt className="text-xs text-zinc-500">Safe to spend left</dt><dd className="font-mono">{inr(shape.remainingDiscretionary)}</dd></div>
        <div><dt className="text-xs text-zinc-500">Spending pace</dt><dd className="font-mono">{shape.dailyPace !== null ? `${inr(shape.dailyPace)}/day` : 'Not known yet'}</dd></div>
        <div><dt className="text-xs text-zinc-500">Projected month end</dt><dd className={`font-mono ${end < 0 ? 'text-rose-300' : ''}`}>{end < 0 ? `−${inr(-end)}` : inr(end)}</dd></div>
        <div><dt className="text-xs text-zinc-500">Days left</dt><dd className="font-mono">{shape.daysLeft}</dd></div>
      </dl>
      <Notes assumptions={shape.assumptions} missing={shape.missing} />
    </motion.section>
  );
}

export function SafeToInvestCard({ sti, variants }) {
  if (!sti) return null;
  return (
    <motion.section variants={variants} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="flex items-center gap-2 font-bold"><Sprout className="h-5 w-5 text-lime-400" /> Safe to invest this month</h2>
      <p className="mt-3 text-4xl font-extrabold tracking-tight">{inr(sti.amount)}</p>
      <p className="mt-2 text-sm text-zinc-300">{sti.statement}</p>
      <Notes assumptions={sti.assumptions} missing={sti.missing} />
      <p className="mt-3 text-[11px] text-zinc-500">{sti.note}</p>
    </motion.section>
  );
}

export function SipStressTestCard({ variants }) {
  const { session } = useAuth();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const run = async (e) => {
    e.preventDefault();
    const parsed = parseAmount(amount);
    if (parsed.error) { setError(parsed.error); return; }
    setLoading(true);
    setError('');
    try {
      const data = await apiJson('/decisions/sip-stress-test', { session, method: 'POST', body: { monthlyAmount: parsed.amount } });
      setResult({ test: data.test, quota: data.quota });
    } catch (err) {
      setError(friendlyError(err, "We couldn't run that check just now."));
    } finally {
      setLoading(false);
    }
  };

  const t = result?.test;
  const quotaText = quotaLine(result?.quota);
  return (
    <motion.section variants={variants} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="flex items-center gap-2 font-bold"><Gauge className="h-5 w-5 text-lime-400" /> SIP stress test</h2>
      <p className="mt-1 text-xs text-zinc-500">Would a monthly investment fit a typical month? A cash-flow check, not advice on what to invest in.</p>
      <form onSubmit={run} className="mt-3 flex gap-2" noValidate>
        <label htmlFor="sip-amount" className="sr-only">Proposed monthly SIP</label>
        <span className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">₹</span>
          <input id="sip-amount" inputMode="decimal" placeholder="3,000 a month" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-800 py-2.5 pl-7 pr-2 font-mono text-zinc-100 outline-none focus:border-lime-500/60" />
        </span>
        <button type="submit" disabled={loading} className="flex min-w-[5.5rem] items-center justify-center rounded-xl bg-lime-400 px-4 text-sm font-black text-black disabled:opacity-60">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test'}
        </button>
      </form>
      {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
      {t && (
        <div className="mt-4" aria-live="polite">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-bold text-white">{t.headline}</p>
            <Badge state={t.state} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div><dt className="text-xs text-zinc-500">Typical month left, before</dt><dd className="font-mono">{inr(t.leftBefore)}</dd></div>
            <div><dt className="text-xs text-zinc-500">After this SIP</dt><dd className={`font-mono ${t.leftAfter < 0 ? 'text-rose-300' : ''}`}>{t.leftAfter < 0 ? `−${inr(-t.leftAfter)}` : inr(t.leftAfter)}</dd></div>
            <div><dt className="text-xs text-zinc-500">Share of budget</dt><dd className="font-mono">{t.shareOfBudgetPercent !== null ? `${t.shareOfBudgetPercent}%` : '—'}</dd></div>
            <div><dt className="text-xs text-zinc-500">This month, if started now</dt><dd className="font-mono">{t.thisMonth.fits ? `${inr(t.thisMonth.afterSip)} left` : 'Does not fit'}</dd></div>
          </dl>
          <Notes assumptions={t.assumptions} missing={t.missing} />
          {quotaText && <p className="mt-2 text-[11px] text-zinc-500">{quotaText}</p>}
          <p className="mt-2 text-[11px] text-zinc-500">{t.note}</p>
        </div>
      )}
    </motion.section>
  );
}
