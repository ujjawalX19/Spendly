/**
 * ProUpgrade.jsx — the Vittova Pro paywall.
 *
 * How Pro is bought depends on the build (lib/distribution.js):
 *   Play build: Google Play purchase -> app sends the purchase token -> backend
 *     verifies it with Google -> backend stores the entitlement.
 *   Website and Indus build: Razorpay pass (RazorpayPlans) -> backend confirms
 *     the payment with Razorpay -> backend stores the entitlement.
 * Then the app reads /api/pro/status. Never: button tap -> is_pro = true.
 *
 * Plans and prices come from Google Play (lib/billing.loadPlans): a card is
 * shown only if the server allows the plan AND Google returned it for this
 * user, with Google's own price and renewal terms. No countdowns, no invented
 * discounts, no "X people bought this". While purchases are off, the page
 * shows what Pro includes and no price or button.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, FileText, Check } from 'lucide-react';
import { usePro } from '../contexts/ProContext';
import { useAuth } from '../contexts/AuthContext';
import { friendlyError } from '../lib/errors';
import { track } from '../lib/telemetry';
import { loadPlans, subscribe, restorePurchases, MANAGE_SUBSCRIPTIONS_URL, plansFailureCode, plansFailureMessage } from '../lib/billing';
import { loadPassConfig, buyPass } from '../lib/razorpayCheckout';

const PASS_MESSAGES = {
  active: 'Vittova Pro is active. Thank you!',
  pending: "Payment received. We're confirming it with Razorpay; Pro turns on within a few minutes.",
  failed: "The payment didn't go through, so nothing was charged. You can try again.",
  cancelled: '',
};

/**
 * Razorpay passes (website and Indus build): one payment, a fixed period,
 * no renewal. Prices come from the server; Pro is granted only after the
 * server confirms the payment with Razorpay.
 */
function RazorpayPlans({ session, refreshProStatus }) {
  const [config, setConfig] = useState('loading');
  const [selected, setSelected] = useState('yearly');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setConfig('loading');
    loadPassConfig(session)
      .then((c) => { if (!cancelled) setConfig(c || { failed: true }); })
      .catch(() => { if (!cancelled) setConfig({ failed: true }); });
    return () => { cancelled = true; };
  }, [session, attempt]);

  if (config === 'loading') return <p role="status" className="mb-7 text-sm text-ink-2">Loading plans…</p>;
  if (config.failed) {
    return (
      <div role="alert" className="v-block mb-7 p-4">
        <p className="text-sm text-ink-soft">Plans couldn't be loaded. Check your connection and try again.</p>
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="v-press v-btn-secondary mt-3">Try again</button>
      </div>
    );
  }
  const card = config.cards.find((c) => c.key === selected) || config.cards[0];

  const pay = async () => {
    setBusy(true);
    setMessage('');
    track('purchase_started', { plan: card.key, channel: 'razorpay' });
    try {
      const outcome = await buyPass(card.key, session, { email: session?.user?.email });
      await refreshProStatus();
      setMessage(PASS_MESSAGES[outcome] || '');
    } catch (err) {
      await refreshProStatus();
      setMessage(friendlyError(err, "We couldn't complete that. If money left your account, Pro turns on once Razorpay confirms it; nothing is charged twice."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-7" aria-label="Plans">
      <div className="space-y-2" role="radiogroup">
        {config.cards.map((c) => (
          <button key={c.key} type="button" role="radio" aria-checked={card?.key === c.key} onClick={() => { setSelected(c.key); track('plan_selected', { plan: c.key }); }}
            className={`v-press flex w-full items-start gap-3 rounded-2xl border bg-surface p-4 text-left ${card?.key === c.key ? 'border-ink' : 'border-line'}`}>
            <span aria-hidden="true" className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${card?.key === c.key ? 'border-accent bg-accent text-on-fill' : 'border-line-strong'}`}>
              {card?.key === c.key && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-ink-2">{c.title}</span>
              <span className="mt-0.5 block font-display text-xl font-bold tabular-nums">{c.price}</span>
              <span className="mt-0.5 block text-xs text-ink-3">{c.terms}</span>
            </span>
          </button>
        ))}
      </div>
      {card && (
        <>
          <button type="button" disabled={busy} onClick={pay} className="v-press v-btn-primary mt-4 w-full disabled:opacity-60">
            {busy ? 'Opening Razorpay…' : `Pay ${card.price}`}
          </button>
          <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
            {card.terms} Paid securely through Razorpay (UPI, cards, net banking); Vittova never sees your card or bank details. Prices include all taxes. Refunds: see <Link to="/terms" className="underline">Terms</Link>.
          </p>
        </>
      )}
      {message && <p role="status" className="mt-4 text-center text-sm text-ink-soft">{message}</p>}
    </section>
  );
}

const PLANS_TIMEOUT_MS = 15000;

// Pro is built around decisions. Money Streak, Month Shape and Safe-to-Invest
// stay free for everyone. Kept to seven lines so the list can be read at a glance.
const INCLUDES = [
  { title: 'Unlimited Afford-It checks', desc: 'Free plan: 5 a day' },
  { title: 'Unlimited SIP stress tests and month checks' },
  { title: 'Subscription leak audit', desc: 'Every recurring payment and its yearly cost' },
  { title: 'Debit reminders and price-rise alerts', desc: 'The day before an expected debit' },
  { title: 'More Ask Vittova questions', desc: 'Free plan: 10 a day' },
  { title: 'More receipt scans and statement import' },
  { title: 'Advanced Save-to-Earn challenges', desc: 'Savings sprints, weekend and no-cab challenges, full history' },
  { title: 'Sponsored money challenges', desc: 'Optional, with fixed voucher rewards', sponsored: true },
];

export default function ProUpgrade() {
  const navigate = useNavigate();
  const { isPro, proStatus, limits, purchasesAvailable, paymentChannel, refreshProStatus, features } = usePro();
  const isPlay = paymentChannel === 'play';
  const { session } = useAuth();
  const [offer, setOffer] = useState(null); // { cards, obfuscatedAccountId }
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  // Loading the plans from Google Play: 'loading' | 'ready' | { failed: code }.
  // A failure used to be swallowed, which left the screen with no plans, no
  // button and no explanation.
  const [plans, setPlans] = useState('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { track('pro_paywall_viewed'); }, []);

  useEffect(() => {
    let cancelled = false;
    if (!purchasesAvailable || isPro || !isPlay) return undefined;
    setPlans('loading');
    // Google Play normally answers in a second or two; never wait for ever.
    const timer = setTimeout(() => { if (!cancelled) setPlans((s) => (s === 'loading' ? { failed: 'timeout' } : s)); }, PLANS_TIMEOUT_MS);
    loadPlans(session).then((p) => {
      if (cancelled) return;
      if (!p) { setPlans({ failed: 'off' }); return; }
      setOffer(p);
      setSelected(p.cards.find((c) => c.key === 'yearly')?.key || p.cards[0]?.key || null);
      setPlans('ready');
    }).catch((err) => {
      if (cancelled) return;
      setPlans({ failed: plansFailureCode(err) });
    }).finally(() => clearTimeout(timer));
    return () => { cancelled = true; clearTimeout(timer); };
  }, [purchasesAvailable, isPro, isPlay, session, attempt]);

  const card = offer?.cards.find((c) => c.key === selected) || null;

  const run = async (kind) => {
    setBusy(kind);
    setMessage('');
    try {
      if (kind === 'buy') track('purchase_started', { plan: card.key });
      const outcome = kind === 'buy' ? await subscribe(card, offer.obfuscatedAccountId, session) : await restorePurchases(session);
      await refreshProStatus();
      setMessage({
        active: 'Vittova Pro is active. Thank you!',
        pending: 'Your payment is pending with Google Play. Pro turns on once it completes.',
        cancelled: '',
        none: 'No Vittova Pro subscription was found on this Google account.',
        not_active: 'That subscription is not active right now.',
      }[outcome] || '');
    } catch (err) {
      setMessage(friendlyError(err, "We couldn't complete that. If you were charged, tap Restore purchases."));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="min-h-screen bg-bg p-4 pb-16 text-ink md:p-6">
      <button type="button" onClick={() => navigate(-1)} aria-label="Back" className="v-press -ml-2 mb-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-2">
        <ArrowLeft className="h-5 w-5" />
      </button>

      <div className="mx-auto max-w-lg">
        <div className="mb-7">
          <h1 className="text-[28px] font-bold leading-tight">Vittova Pro</h1>
          <p className="mt-1 text-[15px] text-ink-2">More clarity. Better decisions.</p>
          {isPro && <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-accent"><Check className="h-4 w-4" aria-hidden="true" /> Pro is active on your account.</p>}
          {!isPro && !purchasesAvailable && (
            <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-warn">
              <Clock className="h-4 w-4" aria-hidden="true" /> Coming soon: not available to buy yet
            </p>
          )}
        </div>

        {/* Plans are on their way, or could not be loaded: always say which. */}
        {purchasesAvailable && !isPro && isPlay && plans === 'loading' && (
          <p role="status" className="mb-7 text-sm text-ink-2">Loading plans from Google Play…</p>
        )}
        {purchasesAvailable && !isPro && isPlay && plans?.failed && (
          <div role="alert" className="v-block mb-7 p-4">
            <p className="text-sm text-ink-soft">{plansFailureMessage(plans.failed)}</p>
            <p className="mt-1 text-[11px] text-ink-3">Code: {plans.failed}</p>
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className="v-press v-btn-secondary mt-3">Try again</button>
          </div>
        )}

        {/* Plans: only real, currently available Google Play plans. */}
        {purchasesAvailable && !isPro && isPlay && offer && plans === 'ready' && (
          <section className="mb-7" aria-label="Plans">
            {offer.cards.length === 0 && <p className="text-sm text-ink-2">Plans are not available on this device right now.</p>}
            <div className="space-y-2" role="radiogroup">
              {offer.cards.map((c) => (
                <button key={c.key} type="button" role="radio" aria-checked={selected === c.key} onClick={() => { setSelected(c.key); track('plan_selected', { plan: c.key }); }}
                  className={`v-press flex w-full items-start gap-3 rounded-2xl border bg-surface p-4 text-left ${selected === c.key ? 'border-ink' : 'border-line'}`}>
                  <span aria-hidden="true" className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected === c.key ? 'border-accent bg-accent text-on-fill' : 'border-line-strong'}`}>
                    {selected === c.key && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-ink-2">{c.title}</span>
                    <span className="mt-0.5 block font-display text-xl font-bold tabular-nums">{c.price}</span>
                    <span className="mt-0.5 block text-xs text-ink-3">{c.renewal}</span>
                  </span>
                </button>
              ))}
            </div>
            {card && (
              <>
                <button type="button" disabled={!!busy} onClick={() => run('buy')}
                  className="v-press v-btn-primary mt-4 w-full disabled:opacity-60">
                  {busy === 'buy' ? 'Opening Google Play…' : 'Continue with Google Play'}
                </button>
                <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
                  {card.renewal} Billed by Google Play to your Google account. Cancel any time in Google Play → Payments &amp; subscriptions; Pro stays on until the end of the period you paid for. {card.key === 'limited_yearly' ? 'Offer eligibility is decided by Google Play. ' : ''}Refunds follow Google Play's policies.
                </p>
              </>
            )}
          </section>
        )}
        {purchasesAvailable && !isPro && paymentChannel === 'razorpay' && (
          <RazorpayPlans session={session} refreshProStatus={refreshProStatus} />
        )}
        {isPro && paymentChannel === 'razorpay' && proStatus?.expiresAt && (
          <p className="mb-7 text-sm text-ink-2">Pro is active until {new Date(proStatus.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}. Passes don't renew automatically.</p>
        )}

        <h2 className="v-label mb-2">{purchasesAvailable ? 'Pro includes' : 'Planned for Pro'}</h2>
        <ul className="v-block v-rows mb-3 px-4">
          {INCLUDES.filter((f) => !f.sponsored || features.sponsoredChallengesEnabled).map((feat) => (
            <li key={feat.title} className="flex min-h-[48px] items-start gap-3 py-3">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-ink-2" aria-hidden="true" />
              <span><span className="block text-sm font-medium text-ink">{feat.title}</span>{feat.desc && <span className="block text-xs text-ink-3">{feat.desc}</span>}</span>
            </li>
          ))}
        </ul>
        <p className="mb-7 text-xs leading-relaxed text-ink-3">Identify potential spending leaks and make more informed decisions. Results depend on your own choices; no savings are guaranteed.</p>

        {!isPro && limits && (
          <>
            <h2 className="v-label mb-2">Your free plan today</h2>
            <ul className="v-block v-rows px-4 text-sm text-ink-2">
              <li className="flex items-center justify-between gap-3 py-3"><span>Receipt scans this month</span><span className="tabular-nums text-ink">{limits.receiptScansUsed} of {limits.receiptScansLimit}</span></li>
              <li className="flex items-center justify-between gap-3 py-3"><span>Ask Vittova questions today</span><span className="tabular-nums text-ink">{limits.chatMessagesUsed} of {limits.chatMessagesLimit}</span></li>
              <li className="flex items-center justify-between gap-3 py-3"><span>Expenses today</span><span className="tabular-nums text-ink">{limits.expensesToday} of {limits.expensesLimit}</span></li>
              {limits.moneyChecksLimit != null && <li className="flex items-center justify-between gap-3 py-3"><span>Money checks today</span><span className="tabular-nums text-ink">{limits.moneyChecksUsed ?? 0} of {limits.moneyChecksLimit}</span></li>}
            </ul>
          </>
        )}

        <div className="mt-6 flex flex-col items-center gap-2 text-xs">
          {purchasesAvailable && isPlay && (
            <button type="button" disabled={!!busy} onClick={() => run('restore')} className="v-press v-btn-text disabled:opacity-60">
              {busy === 'restore' ? 'Checking…' : 'Restore purchases'}
            </button>
          )}
          {isPro && isPlay && <a href={MANAGE_SUBSCRIPTIONS_URL} target="_blank" rel="noopener noreferrer" className="text-ink-2 underline">Manage subscription in Google Play</a>}
          <p className="text-ink-3"><Link to="/terms" className="inline-flex min-h-[44px] items-center px-2 underline">Terms</Link> · <Link to="/privacy" className="inline-flex min-h-[44px] items-center px-2 underline">Privacy</Link></p>
        </div>

        {message && <p role="status" className="mt-4 text-center text-sm text-ink-soft">{message}</p>}

        {!purchasesAvailable && (
          <p className="mt-6 text-center text-xs text-ink-3">
            Nothing is charged and no subscription exists. We'll show pricing here only when Pro can actually be purchased.
          </p>
        )}
        <p className="mt-4 flex items-center justify-center gap-1 text-[11px] text-ink-3"><FileText className="h-3 w-3" /> Vittova is a budgeting tool, not investment advice.</p>
      </div>
    </div>
  );
}
