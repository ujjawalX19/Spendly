/**
 * Pricing on the homepage: the free plan next to Vittova Pro.
 *
 * On the website Pro is a one-time Razorpay pass (backend/lib/razorpayBilling.js
 * PLANS: ₹49 for 30 days, ₹449 for a year), bought on /pro after sign-in. The
 * Google Play app sells the same plans as subscriptions (billingPlans.js). No
 * timers or invented discounts. Keep the Pro list in line with
 * pages/ProUpgrade.jsx, the free limits with backend/middleware/proGate.js, and
 * the prices with razorpayBilling.js and Play Console.
 */
import { useState } from 'react';
import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PrimaryCta, Reveal, SectionHeading, WRAP } from './shared';

const PLANS = {
  monthly: { name: 'Monthly', price: '₹49', per: 'for 30 days', note: 'One payment. Does not renew.' },
  yearly: { name: 'Yearly', price: '₹449', per: 'for 1 year', note: 'One payment, about ₹37 a month. Does not renew.' },
};

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
            </p>
            <p className="mt-2 text-sm text-ink-2">{plan.note} Prices include all taxes.</p>
            <Includes items={PRO} />
            <p className="mt-8 rounded-xl bg-surface-2 p-4 text-sm leading-relaxed text-ink-soft">
              Buy a Pro pass here after you sign in, paid securely through Razorpay with UPI, a card or net banking. Pro then works in the app too.
            </p>
            <div className="mt-6"><Link to="/pro" className="v-press v-btn-primary inline-flex w-full items-center justify-center sm:w-auto">Get Pro</Link></div>
          </Reveal>
        </div>

        <Reveal className="mt-6 max-w-3xl text-sm leading-relaxed text-ink-3">
          A pass is a single payment and never renews; a new pass starts when your current one ends. In the Vittova app from Google Play, Pro is instead a Google Play subscription that you manage in Google Play. Refunds and full details are in the <Link to="/terms" className="l-link">Terms of Service</Link>.
        </Reveal>
      </div>
    </section>
  );
}
