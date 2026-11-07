/**
 * Vittova Pro on the website: what it adds, its prices and renewal terms. Pro
 * is bought only in the Android app through Google Play; the website sells
 * nothing. The launch offer is named only while GET /api/app-config says it is
 * on. No timers or invented discounts. Keep the lists in line with
 * pages/ProUpgrade.jsx and backend/middleware/proGate.js, and the prices with
 * Play Console (backend/lib/billingPlans.js).
 */
import { useEffect, useState } from 'react';
import { apiUrl } from '../../lib/apiConfig';
import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { NEXT_UPDATE_LIVE } from '../../lib/siteFeatures';
import { track } from '../../lib/telemetry';
import { PlayStoreCta, Reveal, SectionHeading, WRAP } from './shared';

const PLANS = {
  monthly: { name: 'Monthly', price: '₹49', per: '/month', note: 'Billed every month by Google Play. Cancel any time.' },
  yearly: { name: 'Yearly', price: '₹449', per: '/year', note: 'About ₹37 a month: ₹139 less than twelve monthly payments.' },
};

const FREE = [
  'Expense tracking, budgets and Safe-to-Spend',
  'Money Streak, Month Shape and Safe-to-Invest',
  'Save-to-Earn challenges and Group Pool',
  '5 Afford-It checks or SIP stress tests a day',
  '10 Ask Vittova questions a day',
  '3 receipt scans a month',
];

/** In the Pro plan on Google Play today. */
const PRO = [
  ['Unlimited Afford-It checks', 'Free plan: 5 a day'],
  ['Unlimited SIP stress tests and month checks', null],
  ['Subscription leak audit', 'Every recurring payment and what it costs a year'],
  ['Debit reminders and price-rise alerts', 'A reminder the day before an expected debit'],
  ['More Ask Vittova questions', 'Free plan: 10 a day'],
  ['More receipt scans and bank statement import', null],
  ['Advanced Save-to-Earn challenges', 'Bigger savings sprints and your full challenge history'],
];

/** Pro features in the next app update. */
const PRO_NEXT = [
  ['Month Calendar', 'Spending, bills and goal dates by day'],
  ['Split a receipt item by item', 'In your groups'],
  ['PDF reports', 'CSV export stays free'],
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
  const [offerOn, setOfferOn] = useState(false);
  useEffect(() => {
    fetch(apiUrl('/app-config')).then((r) => r.json()).then((c) => setOfferOn(c.launchOffer === true)).catch(() => {});
  }, []);
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
            <p className="mt-2 text-sm text-ink-2">{plan.note}</p>
            {offerOn && period === 'yearly' && (
              <p className="mt-2 text-sm text-ink-2"><span className="font-semibold text-ink">Diwali and launch offer: ₹199</span> for the first year, then ₹449/year, for eligible new subscribers.</p>
            )}
            <Includes items={PRO} />
            {!NEXT_UPDATE_LIVE && <p className="mt-6 text-xs font-medium text-ink-3">Coming to Pro in the next app update</p>}
            <Includes items={PRO_NEXT} />
            <p className="mt-8 rounded-xl bg-surface-2 p-4 text-sm leading-relaxed text-ink-soft">
              <b className="font-semibold text-ink">Get Pro in the app.</b> Pro is bought in the Vittova Android app through Google Play, which shows the final price and renewal terms before you pay.
            </p>
            <PlayStoreCta placement="pro" label="Get Vittova Pro in the app" onClick={() => track('site_pro_cta')} className="mt-4 w-full" />
          </Reveal>
        </div>

        <Reveal className="mt-6 max-w-3xl text-sm leading-relaxed text-ink-3">
          Pro is a Google Play subscription that renews automatically until you cancel it in Google Play → Payments &amp; subscriptions, and stays on until the end of the period you paid for. Refunds follow Google Play&apos;s policies. Full details are in the <Link to="/terms" className="l-link">Terms of Service</Link>.
        </Reveal>
      </div>
    </section>
  );
}
