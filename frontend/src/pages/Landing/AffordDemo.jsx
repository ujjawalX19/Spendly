/**
 * The homepage's interactive "Can I afford this?" card. Runs on one fixed,
 * labelled example month (lib/landingDemo). In the app the same question is
 * answered by the server from the user's own spending, bills and budget.
 */
import { useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { demoCheck, EXAMPLE_MONTH } from '../../lib/landingDemo';
import { inr, parseAmount } from '../../lib/moneyDisplay';

const PRESETS = [499, 2499, 6000, 9999];

const LOOK = {
  can_afford: { word: 'Comfortable', mark: '✓', tone: 'text-lime-300', ring: 'border-lime-400/30 bg-lime-400/[0.06]' },
  wait: { word: 'Wait', mark: '!', tone: 'text-amber-300', ring: 'border-amber-400/30 bg-amber-400/[0.06]' },
  not_comfortable: { word: 'Too tight', mark: '✕', tone: 'text-rose-300', ring: 'border-rose-400/30 bg-rose-400/[0.06]' },
};

export default function AffordDemo() {
  const [price, setPrice] = useState(2499);
  const [typed, setTyped] = useState('2,499');
  const [error, setError] = useState('');
  const r = demoCheck(price);
  const look = LOOK[r.verdict];
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
    <div className="relative w-full max-w-[400px]">
      <div aria-hidden="true" className="absolute -inset-6 -z-10 rounded-[40px] bg-lime-400/10 blur-3xl" />
      <div className="rounded-[28px] border border-white/10 bg-[#0c0d0f]/95 p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-bold text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-lime-400/15"><ShoppingBag className="h-4 w-4 text-lime-300" aria-hidden="true" /></span>
            Can I afford this?
          </p>
          <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">Example month</span>
        </div>

        <label htmlFor="demo-amount" className="mt-5 block text-xs font-semibold text-zinc-400">Price</label>
        <div className="mt-1.5 flex h-14 items-center rounded-2xl border border-white/10 bg-black/40 px-4 focus-within:border-lime-400/60">
          <span className="text-2xl font-bold text-zinc-500">₹</span>
          <input id="demo-amount" inputMode="decimal" autoComplete="off" value={typed} onChange={(e) => onType(e.target.value)}
            className="ml-1 w-full bg-transparent font-mono-finance text-2xl font-bold text-white outline-none" aria-describedby="demo-note" />
        </div>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Try a price">
          {PRESETS.map((p) => (
            <button key={p} type="button" onClick={() => pick(p)} aria-pressed={price === p}
              className={`l-press min-h-[36px] rounded-full border px-3 text-xs font-bold transition-colors ${price === p ? 'border-lime-400/60 bg-lime-400/10 text-lime-200' : 'border-white/10 text-zinc-300 hover:border-white/25'}`}>
              {inr(p)}
            </button>
          ))}
        </div>
        {error && <p className="mt-2 text-xs text-rose-300" role="alert">{error}</p>}

        <div key={`${r.verdict}-${price}`} className={`l-pop mt-5 rounded-2xl border p-4 ${look.ring}`} aria-live="polite">
          <p className={`flex items-center gap-2 text-3xl font-black tracking-tight ${look.tone}`}>
            <span aria-hidden="true">{look.mark}</span>{look.word}
          </p>
          <dl className="mt-3 space-y-2 text-sm">
            {r.verdict === 'not_comfortable' ? (
              <Row label="Short by" value={inr(r.shortBy)} />
            ) : (
              <Row label="After this" value={`${inr(r.perDay)}/day`} hint={`for ${m.daysLeft} days`} />
            )}
            <Row label="Next bill" value={inr(m.bill.amount)} hint={`${m.bill.name} · in ${m.bill.inDays} days`} />
            {r.verdict !== 'can_afford' && <Row label="Safer date" value="When your new month starts" plain />}
          </dl>
        </div>

        <p id="demo-note" className="mt-4 text-[11px] leading-relaxed text-zinc-500">
          Example month: {inr(m.leftThisMonth)} left, a {inr(m.bill.amount)} bill due, about {inr(m.usualPerDay)} usual spend a day. In the app, the answer uses your own spending, bills and budget.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, hint, plain = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-zinc-400">{label}</dt>
      <dd className="text-right">
        <span className={`${plain ? '' : 'font-mono-finance '}font-bold text-white`}>{value}</span>
        {hint && <span className="block text-[11px] text-zinc-500">{hint}</span>}
      </dd>
    </div>
  );
}
