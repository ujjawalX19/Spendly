/**
 * Vittova Pro on the homepage. Purchases are not switched on yet, so this
 * shows what Pro includes and says plainly that it can't be bought; it never
 * shows a price. Keep the list in line with pages/ProUpgrade.jsx.
 */
import { Check, Sparkles } from 'lucide-react';
import { PrimaryCta, Reveal } from './shared';

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
            <p className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-300">
              <b className="text-white">Coming soon.</b> Pro is not available to buy yet. When it is, it will be sold through Google Play, with the price and renewal terms shown before you pay.
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
