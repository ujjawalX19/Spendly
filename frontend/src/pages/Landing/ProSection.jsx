/**
 * Pricing on the homepage: the free plan next to Vittova Pro.
 *
 * Pro is sold only through Google Play in the Android app, and is not on sale
 * to the public yet, so this shows the PLANNED prices
 * (backend/lib/billingPlans.js), labelled as planned, with no buy button. The
 * launch offer shows what it renews at. Keep the Pro list in line with
 * pages/ProUpgrade.jsx, the free limits with backend/middleware/proGate.js, and
 * the prices with Play Console before billing goes live.
 */
import { useState } from 'react';
import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PrimaryCta, Reveal, SectionHeading, WRAP } from './shared';

const PLANS = {
  monthly: { name: 'Monthly', price: '₹49', per: '/month', note: 'Billed every month. Cancel any time.' },
  yearly: { name: 'Yearly', price: '₹449', per: '/year', note: 'About ₹37 a month: ₹139 less than twelve monthly payments.' },
};
const OFFER = { price: '₹199', terms: 'for the first year. Then ₹449/year.' };

const FREE = [
  'Expense tracking, budgets and Safe-to-Spend',
  'Money Streak, Month Shape and Safe-to-Invest',
  'Save-to-Earn challenges and Group Pool',
  '5 Afford-It checks or SIP stress tests a day',
  '10 Ask Vittova questions a day',
  '3 receipt scans a month',
];

const PRO = [
  ['Unlimited Afford-It checks', 'Free plan: 5 a day'],
  ['Unlimited SIP stress tests and month checks', null],
  ['Subscription leak audit', 'Every recurring payment and what it costs a year'],
  ['Debit reminders and price-rise alerts', 'A reminder the day before an expected debit'],
  ['More Ask Vittova questions', 'Free plan: 10 a day'],
  ['More receipt scans and bank statement import', null],
  ['Advanced Save-to-Earn challenges', 'Bigger savings sprints and your full challenge history'],
];

function Includes({ items }) {
  return (
    <ul className="mt-6 space-y-3 border-t border-line pt-6">
      {items.map((item) => {
        const [title, hint] = Array.isArray(item) ? item : [item, null];
        return (
          <li key={title} className="flex gap-3">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-ink-2" aria-hidden="true" />
            <span>
              <span className="block text-sm font-medium text-ink">{title}</span>
              {hint && <span className="block text-xs text-ink-3">{hint}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default function ProSection() {
  const [period, setPeriod] = useState('yearly');
  const plan = PLANS[period];
  return (
    <section id="pro" className="scroll-mt-20 border-t border-line py-20 lg:py-28">
      <div className={WRAP}>
        <SectionHeading eyebrow="Pricing" title="Free to use. Pro when you want more.">
          The free plan covers tracking, budgeting and everyday decisions. Pro removes the daily limits and adds the tools that catch money leaking out every month.
        </SectionHeading>

        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          <Reveal className="v-block flex flex-col p-6 sm:p-8">
            <h3 className="text-lg font-semibold text-ink">Free</h3>
            <p className="mt-4 flex items-baseline gap-2"><span className="text-4xl font-semibold tracking-[-0.03em] tabular-nums text-ink">₹0</span></p>
            <p className="mt-2 text-sm text-ink-2">No card needed. Yours for as long as you use Vittova.</p>
            <Includes items={FREE} />
            <div className="mt-auto pt-8"><PrimaryCta className="w-full sm:w-auto">Start free</PrimaryCta></div>
          </Reveal>

          <Reveal delay={100} className="v-block flex flex-col border-line-strong p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-ink">Vittova Pro</h3>
              <div className="v-seg bg-surface-2" role="group" aria-label="Billing period">
                {Object.entries(PLANS).map(([key, p]) => (
                  <button key={key} type="button" aria-pressed={period === key} onClick={() => setPeriod(key)}>{p.name}</button>
                ))}
              </div>
            </div>
            <p className="mt-4 flex flex-wrap items-baseline gap-x-2" aria-live="polite">
              <span className="text-4xl font-semibold tracking-[-0.03em] tabular-nums text-ink">{plan.price}</span>
              <span className="text-sm text-ink-2">{plan.per}</span>
              <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-2">Planned pricing</span>
            </p>
            <p className="mt-2 text-sm text-ink-2">{plan.note}</p>
            {period === 'yearly' && (
              <p className="mt-2 text-sm text-ink-2">Launch offer for eligible new subscribers: <span className="font-semibold text-ink">{OFFER.price}</span> {OFFER.terms}</p>
            )}
            <Includes items={PRO} />
            <p className="mt-8 rounded-xl bg-surface-2 p-4 text-sm leading-relaxed text-ink-soft">
              <b className="font-semibold text-ink">Coming soon: not available to buy yet.</b> Pro will be sold through Google Play in the Vittova Android app, not on this website. Google Play shows the final price and renewal terms before you pay.
            </p>
          </Reveal>
        </div>

        <Reveal className="mt-6 max-w-3xl text-sm leading-relaxed text-ink-3">
          Pro renews automatically until you cancel in Google Play → Payments &amp; subscriptions, and stays on until the end of the period you paid for. Refunds follow Google Play&apos;s policies. Offer eligibility is decided by Google Play. Full details are in the <Link to="/terms" className="l-link">Terms of Service</Link>.
        </Reveal>
      </div>
    </section>
  );
}
