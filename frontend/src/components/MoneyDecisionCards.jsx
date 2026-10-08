/**
 * Wealth screen cards for v1.1: Month Shape, Safe-to-Invest and the SIP
 * Stress Test. Figures come from /api/decisions (backend/lib/moneyDecisions.js),
 * the same calculation the dashboard and Vittova AI use. Nothing here
 * recommends a product or promises a return.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiJson } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';
import { inr, parseAmount, quotaLine, stateBadge } from '../lib/moneyDisplay';

function Badge({ state }) {
  const b = stateBadge(state);
  return <span className={`shrink-0 text-xs font-semibold ${b.className}`}>{b.label}</span>;
}

function Notes({ title = 'How this is worked out', assumptions = [], missing = [] }) {
  if (!assumptions.length && !missing.length) return null;
  return (
    <details className="mt-4 border-t border-line pt-3 text-xs text-ink-2">
      <summary className="flex min-h-[32px] cursor-pointer list-none items-center gap-1.5 font-medium text-ink-soft"><Info className="h-3.5 w-3.5" aria-hidden="true" /> {title}</summary>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        {assumptions.map((a) => <li key={a}>{a}</li>)}
        {missing.map((m) => <li key={m}>Not known: {m}</li>)}
      </ul>
    </details>
  );
}

function Figure({ label, children, tone = '' }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={`mt-0.5 font-mono tabular-nums ${tone || 'text-ink'}`}>{children}</dd>
    </div>
  );
}

/** Stacked bar: spent | expected rest of month | bills still due | savings target | left. */
function ShapeBar({ shape }) {
  const parts = [
    { key: 'spent', label: 'Spent', value: shape.spent, className: 'bg-ink' },
    { key: 'expected', label: 'Usual spending ahead', value: shape.expectedRestOfMonth || 0, className: 'bg-ink-3' },
    { key: 'bills', label: 'Bills still due', value: shape.upcomingBills, className: 'bg-warn' },
    { key: 'target', label: 'Savings target', value: shape.savingsTarget, className: 'bg-info' },
  ];
  const total = Math.max(shape.budget, parts.reduce((s, p) => s + p.value, 0), 1);
  return (
    <div>
      <div className="flex h-2 gap-px overflow-hidden rounded-full bg-surface-3" role="img" aria-label="How this month's budget is used and expected to be used">
        {parts.map((p) => p.value > 0 && <div key={p.key} className={p.className} style={{ width: `${(p.value / total) * 100}%` }} />)}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-2">
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
    <motion.section variants={variants} className="v-block p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Month shape</h2>
        <Badge state={shape.state} />
      </div>
      <p className="mt-1.5 text-sm text-ink-2">{shape.headline}</p>
      <div className="mt-4"><ShapeBar shape={shape} /></div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Figure label="Safe to spend left">{inr(shape.remainingDiscretionary)}</Figure>
        <Figure label="Spending pace">{shape.dailyPace !== null ? `${inr(shape.dailyPace)}/day` : 'Not known yet'}</Figure>
        <Figure label="Projected month end" tone={end < 0 ? 'text-danger' : ''}>{end < 0 ? `−${inr(-end)}` : inr(end)}</Figure>
        <Figure label="Days left">{shape.daysLeft}</Figure>
      </dl>
      <Notes assumptions={shape.assumptions} missing={shape.missing} />
    </motion.section>
  );
}

export function SafeToInvestCard({ sti, variants }) {
  if (!sti) return null;
  return (
    <motion.section variants={variants} className="v-block p-4">
      <h2 className="text-[15px] font-semibold">Safe to invest this month</h2>
      <p className="mt-2 font-display text-4xl font-bold tabular-nums">{inr(sti.amount)}</p>
      <p className="mt-2 text-sm text-ink-2">{sti.statement}</p>
      <Notes assumptions={sti.assumptions} missing={sti.missing} />
      <p className="mt-3 text-[11px] leading-relaxed text-ink-3">{sti.note}</p>
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
    <motion.section variants={variants} className="v-block p-4">
      <h2 className="text-[15px] font-semibold">SIP stress test</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-3">Would a monthly investment fit a typical month? A cash-flow check, not advice on what to invest in.</p>
      <form onSubmit={run} className="mt-3 flex gap-2" noValidate>
        <label htmlFor="sip-amount" className="sr-only">Proposed monthly SIP</label>
        <span className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">₹</span>
          <input id="sip-amount" inputMode="decimal" placeholder="3,000 a month" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="v-input pl-7 font-mono" />
        </span>
        <button type="submit" disabled={loading} className="v-press v-btn-primary min-w-[5.5rem] px-4 disabled:opacity-60">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test'}
        </button>
      </form>
      {error && <p role="alert" className="v-error mt-2">{error}</p>}
      {t && (
        <div className="mt-4" aria-live="polite">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-ink">{t.headline}</p>
            <Badge state={t.state} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Figure label="Typical month left, before">{inr(t.leftBefore)}</Figure>
            <Figure label="After this SIP" tone={t.leftAfter < 0 ? 'text-danger' : ''}>{t.leftAfter < 0 ? `−${inr(-t.leftAfter)}` : inr(t.leftAfter)}</Figure>
            <Figure label="Share of budget">{t.shareOfBudgetPercent !== null ? `${t.shareOfBudgetPercent}%` : '—'}</Figure>
            <Figure label="This month, if started now">{t.thisMonth.fits ? `${inr(t.thisMonth.afterSip)} left` : 'Does not fit'}</Figure>
          </dl>
          <Notes assumptions={t.assumptions} missing={t.missing} />
          {quotaText && <p className="mt-2 text-[11px] text-ink-3">{quotaText}</p>}
          <p className="mt-2 text-[11px] leading-relaxed text-ink-3">{t.note}</p>
        </div>
      )}
    </motion.section>
  );
}
