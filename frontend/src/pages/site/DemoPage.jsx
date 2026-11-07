/**
 * Interactive demo with fictional sample data. Nothing is sent to the server,
 * saved, or connected to any account; every answer is computed on this page.
 */
import { useEffect, useMemo, useState } from 'react';
import SiteLayout from './SiteLayout';
import { WRAP } from '../Landing/shared';
import { playUrl, trackPlayClick } from '../../lib/playStore';
import { track } from '../../lib/telemetry';

const BUDGET = 20000;
const BILLS = 6000;
const TXNS = [
  { day: '8 Nov', name: 'Grocery store', cat: 'Food', amt: 1240 },
  { day: '8 Nov', name: 'Metro card', cat: 'Transport', amt: 200 },
  { day: '7 Nov', name: 'Food delivery', cat: 'Food', amt: 380 },
  { day: '6 Nov', name: 'Mobile recharge', cat: 'Recharge', amt: 299 },
  { day: '5 Nov', name: 'Movie tickets', cat: 'Entertainment', amt: 560 },
  { day: '4 Nov', name: 'Shoes', cat: 'Shopping', amt: 1899 },
  { day: '3 Nov', name: 'Cafe', cat: 'Food', amt: 220 },
];
const LIMITS = { Food: 3000, Shopping: 2500, Transport: 1500, Entertainment: 1000 };
const ANSWERS = {
  'Where did most of my money go?': 'Food is the largest share in this sample: ₹1,840, about 38% of spending so far. Most of it is one grocery trip.',
  'Am I on track this month?': 'Yes. In this sample, ₹4,798 is spent of a ₹20,000 budget, with ₹6,000 set aside for bills. About ₹420 a day is safe for the rest of the month.',
  'Can I save ₹2,000 this month?': 'In this sample, yes: after bills and spending so far, setting aside ₹2,000 still leaves about ₹330 a day.',
};
const TABS = ['Overview', 'Activity', 'Budgets', 'Ask Vittova', 'Can I Afford?'];
const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export default function DemoPage() {
  const [tab, setTab] = useState(TABS[0]);
  const [seen, setSeen] = useState(() => new Set([TABS[0]]));
  const [question, setQuestion] = useState(null);
  const [price, setPrice] = useState('2499');
  const spent = TXNS.reduce((s, t) => s + t.amt, 0);
  const left = BUDGET - BILLS - spent;
  const daysLeft = 22;
  const byCat = useMemo(() => TXNS.reduce((m, t) => ({ ...m, [t.cat]: (m[t.cat] || 0) + t.amt }), {}), []);

  useEffect(() => { track('site_demo_started'); }, []);
  const open = (t) => {
    setTab(t);
    setSeen((s) => {
      const next = new Set(s).add(t);
      if (next.size === TABS.length && s.size < TABS.length) track('site_demo_completed');
      return next;
    });
  };

  const p = Number(price) || 0;
  const after = left - p;
  const verdict = p <= 0 ? null : after >= daysLeft * 250 ? 'Fits comfortably this month' : after >= 0 ? 'Fits, but leaves little room' : 'Would put this month under pressure';

  return (
    <SiteLayout title="Interactive demo · Vittova" path="/demo"
      description="Try Vittova with sample data: Safe-to-Spend, budgets, Can I Afford and Vittova AI. No sign-up and no real data.">
      <div className={`${WRAP} py-14 lg:py-20`}>
        <p className="inline-block rounded-md bg-warn/15 px-2 py-1 text-xs font-semibold text-warn" role="note">Interactive Demo — Sample Data</p>
        <h1 className="mt-4 text-[clamp(2rem,6vw,3rem)] font-semibold leading-[1.05] tracking-[-0.03em]">Try Vittova with a sample month.</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-2">Everything here is fictional and stays on this page. Nothing is saved or sent anywhere. Your real numbers are in the Android app.</p>

        <div className="mt-10 grid gap-8 lg:grid-cols-[220px_1fr]">
          <div role="tablist" aria-label="Demo screens" className="flex gap-2 overflow-x-auto lg:flex-col">
            {TABS.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => open(t)}
                className={`min-h-[44px] shrink-0 rounded-xl px-4 text-left text-sm font-medium ${tab === t ? 'bg-ink text-bg' : 'bg-surface text-ink-2'}`}>
                {t}{seen.has(t) && tab !== t ? ' ✓' : ''}
              </button>
            ))}
          </div>

          <div role="tabpanel" aria-label={tab} className="v-block max-w-xl p-5 sm:p-6">
            {tab === 'Overview' && (
              <>
                <p className="text-sm text-ink-2">Left to spend this month</p>
                <p className="mt-1 text-4xl font-semibold tabular-nums">{inr(left)}</p>
                <p className="mt-2 text-sm text-ink-2">About {inr(left / daysLeft)} a day for {daysLeft} days, after {inr(BILLS)} of bills.</p>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-accent" style={{ width: `${((spent + BILLS) / BUDGET) * 100}%` }} /></div>
                <p className="mt-2 text-xs text-ink-3">{inr(spent)} spent of {inr(BUDGET)}</p>
              </>
            )}
            {tab === 'Activity' && (
              <ul className="v-rows">
                {TXNS.map((t) => <li key={t.name} className="flex min-h-[52px] items-center justify-between gap-3 text-sm"><span><span className="block font-medium">{t.name}</span><span className="text-xs text-ink-3">{t.cat} · {t.day}</span></span><span className="tabular-nums">{inr(t.amt)}</span></li>)}
              </ul>
            )}
            {tab === 'Budgets' && (
              <ul className="space-y-4">
                {Object.entries(LIMITS).map(([c, lim]) => {
                  const used = byCat[c] || 0;
                  return (
                    <li key={c}>
                      <div className="flex justify-between text-sm"><span className="font-medium">{c}</span><span className="tabular-nums text-ink-2">{inr(used)} of {inr(lim)}</span></div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className={`h-full rounded-full ${used > lim ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${Math.min(100, (used / lim) * 100)}%` }} /></div>
                    </li>
                  );
                })}
              </ul>
            )}
            {tab === 'Ask Vittova' && (
              <div>
                <p className="text-sm text-ink-2">Pick a question. Answers here are written for the sample month.</p>
                <div className="mt-3 flex flex-col gap-2">
                  {Object.keys(ANSWERS).map((q) => <button key={q} type="button" onClick={() => setQuestion(q)} className="min-h-[44px] rounded-xl bg-surface-2 px-4 text-left text-sm">{q}</button>)}
                </div>
                {question && <p role="status" className="mt-4 rounded-xl border border-line p-4 text-sm leading-relaxed text-ink-soft">{ANSWERS[question]}</p>}
              </div>
            )}
            {tab === 'Can I Afford?' && (
              <div>
                <label htmlFor="demo-price" className="text-sm text-ink-2">Price (sample)</label>
                <input id="demo-price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, '').slice(0, 7))} className="mt-1 min-h-[44px] w-full rounded-xl border border-line-strong bg-surface-2 px-3 text-ink" />
                {verdict && <p role="status" className="mt-4 text-lg font-semibold">{verdict}</p>}
                {verdict && <p className="mt-1 text-sm text-ink-2">{after >= 0 ? `${inr(after)} would be left for ${daysLeft} days.` : `${inr(-after)} more than is safe this month.`}</p>}
              </div>
            )}
          </div>
        </div>

        <div className="mt-12 max-w-xl rounded-2xl border border-line p-6">
          <p className="text-lg font-semibold">See this with your own money.</p>
          <p className="mt-2 text-sm text-ink-2">Install Vittova from Google Play to track real expenses and get answers from your own budget.</p>
          <a href={playUrl('demo_end')} onClick={() => trackPlayClick('demo_end')} target="_blank" rel="noopener noreferrer" className="v-btn-primary mt-4 inline-flex min-h-12 items-center px-6 text-[15px]">Download on Google Play</a>
        </div>
      </div>
    </SiteLayout>
  );
}
