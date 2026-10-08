/**
 * The homepage's interactive "Can I afford this?" card. Runs on one fixed,
 * labelled example month (lib/landingDemo). In the app the same question is
 * answered by the server from the user's own spending, bills and budget.
 */
import { useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { demoCheck, EXAMPLE_MONTH } from '../../lib/landingDemo';
import { inr, parseAmount } from '../../lib/moneyDisplay';
import { useEasedNumber } from '../../components/ui';

const PRESETS = [499, 2499, 6000, 9999];

// The word and the symbol carry the answer; colour only repeats it.
const LOOK = {
  can_afford: { word: 'Comfortable', mark: '✓', tone: 'text-accent' },
  wait: { word: 'Wait', mark: '!', tone: 'text-warn' },
  not_comfortable: { word: 'Too tight', mark: '✕', tone: 'text-danger' },
};

export default function AffordDemo() {
  const [price, setPrice] = useState(2499);
  const [typed, setTyped] = useState('2,499');
  const [error, setError] = useState('');
  const r = demoCheck(price);
  const look = LOOK[r.verdict];
  // The figure counts to its new value (instant with reduced motion).
  const figure = Math.round(useEasedNumber(r.verdict === 'not_comfortable' ? r.shortBy : r.perDay, 500));
  const m = EXAMPLE_MONTH;

  const pick = (p) => { setPrice(p); setTyped(p.toLocaleString('en-IN')); setError(''); };
  const onType = (v) => {
    setTyped(v);
    const parsed = parseAmount(v);
    if (parsed.error) { setError(parsed.error); return; }
    setError('');
    setPrice(parsed.amount);
  };

  return (
    <div className="v-block mx-auto w-full max-w-[420px] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2.5 text-[15px] font-semibold text-ink">
          <span className="v-item-icon h-9 w-9"><ShoppingBag className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" /></span>
          Can I afford this?
        </p>
        <span className="shrink-0 text-xs text-ink-3">Example month</span>
      </div>

      <label htmlFor="demo-amount" className="v-field-label mt-5">Price</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xl font-semibold text-ink-3" aria-hidden="true">₹</span>
        <input id="demo-amount" inputMode="decimal" autoComplete="off" value={typed} onChange={(e) => onType(e.target.value)}
          className="v-input min-h-14 pl-9 text-xl font-semibold tabular-nums" aria-describedby="demo-note" />
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label="Try a price">
        {PRESETS.map((p) => (
          <button key={p} type="button" onClick={() => pick(p)} aria-pressed={price === p}
            className={`l-press min-h-10 rounded-lg px-3 text-[13px] font-semibold tabular-nums ${price === p ? 'bg-ink text-bg' : 'bg-surface-2 text-ink'}`}>
            {inr(p)}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-danger" role="alert">{error}</p>}

      <div key={`${r.verdict}-${price}`} className="l-pop mt-5 rounded-xl bg-surface-2 p-4" aria-live="polite">
        <p className={`flex items-center gap-2 text-[1.75rem] font-semibold leading-none tracking-[-0.02em] ${look.tone}`}>
          <span aria-hidden="true">{look.mark}</span>{look.word}
        </p>
        <dl className="mt-4 space-y-2.5 text-sm">
          {r.verdict === 'not_comfortable' ? (
            <Row label="Short by" value={inr(figure)} />
          ) : (
            <Row label="After this" value={`${inr(figure)}/day`} hint={`for ${m.daysLeft} days`} />
          )}
          <Row label="Next bill" value={inr(m.bill.amount)} hint={`${m.bill.name} · in ${m.bill.inDays} days`} />
          {r.verdict !== 'can_afford' && <Row label="Safer date" value="When your new month starts" />}
        </dl>
      </div>

      <p id="demo-note" className="mt-4 text-xs leading-relaxed text-ink-3">
        Example month: {inr(m.leftThisMonth)} left, a {inr(m.bill.amount)} bill due, about {inr(m.usualPerDay)} usual spend a day. In the app, the answer uses your own spending, bills and budget.
      </p>
    </div>
  );
}

function Row({ label, value, hint }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-2">{label}</dt>
      <dd className="text-right">
        <span className="font-semibold tabular-nums text-ink">{value}</span>
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </dd>
    </div>
  );
}
