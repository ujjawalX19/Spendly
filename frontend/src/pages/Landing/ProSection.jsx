/**
 * Vittova Pro on the homepage. Purchases are not switched on yet, so this
 * shows what Pro includes and the PLANNED prices (backend/lib/billingPlans.js),
 * labelled as not on sale; the launch offer shows its renewal price.
 * Keep the list in line with pages/ProUpgrade.jsx, and the prices in line with
 * Play Console before billing goes live.
 */
import { Check, Sparkles } from 'lucide-react';
import { PrimaryCta, Reveal } from './shared';

const PLANS = [
  { name: 'Monthly', price: '₹49', per: '/month', note: 'Cancel any time' },
  { name: 'Yearly', price: '₹449', per: '/year', note: 'About ₹37 a month', best: true },
  { name: 'Launch offer', price: '₹199', per: 'first year', note: 'Then ₹449/year. For eligible new subscribers.' },
];

const INCLUDES = [
  ['Unlimited Afford-It checks', 'Free plan: 5 a day'],
  ['Unlimited SIP stress tests and month checks', null],
  ['Subscription leak audit', 'Every recurring payment and what it costs a year'],
  ['Debit reminders and price-rise alerts', 'A reminder the day before an expected debit'],
  ['More Ask Vittova questions', 'Free plan: 10 a day'],
  ['More receipt scans and bank statement import', null],
];

export default function ProSection() {
  return (
    <section id="pro" className="scroll-mt-20 px-4 py-20 sm:px-6 lg:py-28">
      <Reveal className="relative mx-auto max-w-5xl overflow-hidden rounded-[32px] border border-amber-300/20 bg-gradient-to-br from-amber-400/[0.08] via-[#0f1012] to-[#0f1012] p-6 sm:p-10">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-bold text-amber-200">
              <Sparkles className="l-twinkle h-3.5 w-3.5" aria-hidden="true" /> Vittova Pro
            </p>
            <h2 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">More than tracking. Better decisions.</h2>
            <p className="mt-4 text-zinc-400">Everything in the free plan, with no daily limits on decisions, plus the tools that catch money leaking out every month.</p>
            <p className="mt-6 text-xs font-bold uppercase tracking-wider text-amber-200/80">Planned pricing</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-3">
              {PLANS.map((pl, i) => (
                <li key={pl.name} className={`l-plan relative rounded-2xl border p-3.5 ${pl.best ? 'border-amber-300/50 bg-amber-300/[0.07]' : 'border-white/10 bg-black/30'}`} style={{ animationDelay: `${i * 90}ms` }}>
                  {pl.best && <span className="absolute -top-2.5 left-3 rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-black uppercase text-black">Best value</span>}
                  <p className="text-xs font-semibold text-zinc-400">{pl.name}</p>
                  <p className="mt-1 whitespace-nowrap"><span className="font-mono-finance text-2xl font-black text-white">{pl.price}</span> <span className="text-xs text-zinc-400">{pl.per}</span></p>
                  <p className="mt-1 text-[11px] leading-snug text-zinc-500">{pl.note}</p>
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-3.5 text-xs leading-relaxed text-zinc-300">
              <b className="text-white">Coming soon: not available to buy yet.</b> Pro will be sold through Google Play in the Android app. Google Play shows the final price and renewal terms before you pay, and you can cancel any time in Google Play.
            </p>
            <PrimaryCta className="mt-6">Start free today</PrimaryCta>
          </div>
          <ul className="divide-y divide-white/[0.06] self-start rounded-3xl border border-white/[0.06] bg-black/30 px-5">
            {INCLUDES.map(([title, hint]) => (
              <li key={title} className="flex gap-3 py-3.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                <span>
                  <span className="block text-sm font-semibold text-white">{title}</span>
                  {hint && <span className="block text-xs text-zinc-500">{hint}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </section>
  );
}
