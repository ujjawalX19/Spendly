/**
 * ProUpgrade.jsx — the Vittova Pro paywall.
 *
 * The purchase flow is:
 *   Google Play purchase -> app sends the purchase token -> backend verifies it
 *   with Google -> backend stores the entitlement -> app reads /api/pro/status.
 * Never: button tap -> is_pro = true.
 *
 * Plans and prices come from Google Play (lib/billing.loadPlans): a card is
 * shown only if the server allows the plan AND Google returned it for this
 * user, with Google's own price and renewal terms. No countdowns, no invented
 * discounts, no "X people bought this". While purchases are off, the page
 * shows what Pro includes and no price or button.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Sparkles, FileText, Check } from 'lucide-react';
import { usePro } from '../contexts/ProContext';
import { useAuth } from '../contexts/AuthContext';
import { friendlyError } from '../lib/errors';
import { track } from '../lib/telemetry';
import { isAndroidApp, loadPlans, subscribe, restorePurchases, MANAGE_SUBSCRIPTIONS_URL } from '../lib/billing';

// Pro is built around decisions. Money Streak, Month Shape and Safe-to-Invest
// stay free for everyone. Kept to seven lines so the list can be read at a glance.
const INCLUDES = [
  { title: 'Unlimited Afford-It checks', desc: 'Free plan: 5 a day' },
  { title: 'Unlimited SIP stress tests and month checks' },
  { title: 'Subscription leak audit', desc: 'Every recurring payment and its yearly cost' },
  { title: 'Debit reminders and price-rise alerts', desc: 'The day before an expected debit' },
  { title: 'More Ask Vittova questions', desc: 'Free plan: 10 a day' },
  { title: 'More receipt scans and statement import' },
  { title: 'Sponsored money challenges', desc: 'Optional, with fixed voucher rewards', sponsored: true },
];

export default function ProUpgrade() {
  const navigate = useNavigate();
  const { isPro, limits, purchasesAvailable, refreshProStatus, features } = usePro();
  const { session } = useAuth();
  const [offer, setOffer] = useState(null); // { cards, obfuscatedAccountId }
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { track('pro_paywall_viewed'); }, []);

  useEffect(() => {
    let cancelled = false;
    if (!purchasesAvailable || isPro || !isAndroidApp()) return undefined;
    loadPlans(session).then((p) => {
      if (cancelled || !p) return;
      setOffer(p);
      setSelected(p.cards.find((c) => c.key === 'yearly')?.key || p.cards[0]?.key || null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [purchasesAvailable, isPro, session]);

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
    <div className="min-h-screen bg-black p-4 pb-16 text-white md:p-6">
      <button type="button" onClick={() => navigate(-1)} aria-label="Back" className="v-press mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-zinc-900">
        <ArrowLeft className="h-5 w-5" />
      </button>

      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500">
            <Sparkles className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-black">Vittova Pro</h1>
          <p className="mt-1 text-base font-bold text-zinc-200">Save smarter. Decide better.</p>
          {isPro && <p className="mt-3 text-sm text-lime-300">Pro is active on your account.</p>}
          {!isPro && !purchasesAvailable && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-sm font-bold text-amber-300">
              <Clock className="h-4 w-4" /> Coming soon: not available to buy yet
            </p>
          )}
        </div>

        {/* Plans: only real, currently available Google Play plans. */}
        {purchasesAvailable && !isPro && isAndroidApp() && offer && (
          <section className="mb-6" aria-label="Plans">
            {offer.cards.length === 0 && <p className="text-center text-sm text-zinc-400">Plans are not available on this device right now.</p>}
            <div className="space-y-2" role="radiogroup">
              {offer.cards.map((c) => (
                <button key={c.key} type="button" role="radio" aria-checked={selected === c.key} onClick={() => { setSelected(c.key); track('plan_selected', { plan: c.key }); }}
                  className={`v-press flex w-full items-start justify-between gap-3 rounded-2xl border p-4 text-left ${selected === c.key ? 'border-amber-400 bg-amber-400/10' : 'border-zinc-800 bg-zinc-900'}`}>
                  <span>
                    <span className="block text-xs font-black uppercase tracking-wider text-zinc-400">{c.title}</span>
                    <span className="mt-1 block text-lg font-black">{c.price}</span>
                    <span className="mt-0.5 block text-xs text-zinc-400">{c.renewal}</span>
                  </span>
                  {selected === c.key && <Check className="mt-1 h-5 w-5 shrink-0 text-amber-300" />}
                </button>
              ))}
            </div>
            {card && (
              <>
                <button type="button" disabled={!!busy} onClick={() => run('buy')}
                  className="v-press mt-4 h-12 w-full rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 text-sm font-black text-black disabled:opacity-60">
                  {busy === 'buy' ? 'Opening Google Play…' : 'Continue with Google Play'}
                </button>
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                  {card.renewal} Billed by Google Play to your Google account. Cancel any time in Google Play → Payments &amp; subscriptions; Pro stays on until the end of the period you paid for. {card.key === 'limited_yearly' ? 'Offer eligibility is decided by Google Play. ' : ''}Refunds follow Google Play's policies.
                </p>
              </>
            )}
          </section>
        )}
        {purchasesAvailable && !isPro && !isAndroidApp() && (
          <p className="mb-6 text-center text-sm text-zinc-400">Vittova Pro can be bought in the Vittova Android app.</p>
        )}

        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-500">{purchasesAvailable ? 'Pro includes' : 'Planned for Pro'}</h2>
        <ul className="mb-4 divide-y divide-white/[0.06] rounded-[20px] border border-white/[0.06] bg-[#111113] px-4">
          {INCLUDES.filter((f) => !f.sponsored || features.sponsoredChallengesEnabled).map((feat) => (
            <li key={feat.title} className="flex min-h-[48px] items-start gap-3 py-3">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
              <span><span className="block text-sm font-semibold text-white">{feat.title}</span>{feat.desc && <span className="block text-xs text-zinc-500">{feat.desc}</span>}</span>
            </li>
          ))}
        </ul>
        <p className="mb-6 text-center text-xs text-zinc-500">Identify potential spending leaks and make more informed decisions. Results depend on your own choices; no savings are guaranteed.</p>

        {!isPro && limits && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">
            <p className="mb-2 font-bold text-zinc-200">Your free plan today</p>
            <ul className="space-y-1">
              <li>Receipt scans this month: {limits.receiptScansUsed} of {limits.receiptScansLimit}</li>
              <li>Coach questions today: {limits.chatMessagesUsed} of {limits.chatMessagesLimit}</li>
              <li>Expenses today: {limits.expensesToday} of {limits.expensesLimit}</li>
              {limits.moneyChecksLimit != null && <li>Money checks today: {limits.moneyChecksUsed ?? 0} of {limits.moneyChecksLimit}</li>}
            </ul>
          </div>
        )}

        <div className="mt-6 flex flex-col items-center gap-2 text-xs">
          {purchasesAvailable && isAndroidApp() && (
            <button type="button" disabled={!!busy} onClick={() => run('restore')} className="min-h-[44px] px-3 font-bold text-zinc-300 underline disabled:opacity-60">
              {busy === 'restore' ? 'Checking…' : 'Restore purchases'}
            </button>
          )}
          {isPro && isAndroidApp() && <a href={MANAGE_SUBSCRIPTIONS_URL} target="_blank" rel="noopener noreferrer" className="text-zinc-400 underline">Manage subscription in Google Play</a>}
          <p className="text-zinc-500"><Link to="/terms" className="inline-flex min-h-[44px] items-center px-2 underline">Terms</Link> · <Link to="/privacy" className="inline-flex min-h-[44px] items-center px-2 underline">Privacy</Link></p>
        </div>

        {message && <p role="status" className="mt-4 text-center text-sm text-zinc-200">{message}</p>}

        {!purchasesAvailable && (
          <p className="mt-6 text-center text-xs text-zinc-600">
            Nothing is charged and no subscription exists. We'll show pricing here only when Pro can actually be purchased through Google Play.
          </p>
        )}
        <p className="mt-4 flex items-center justify-center gap-1 text-[11px] text-zinc-600"><FileText className="h-3 w-3" /> Vittova is a budgeting tool, not investment advice.</p>
      </div>
    </div>
  );
}
