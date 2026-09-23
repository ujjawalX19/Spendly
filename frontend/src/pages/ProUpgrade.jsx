/**
 * ProUpgrade.jsx — Vittova Pro: what it includes and, when Google Play
 * Billing is switched on, how to subscribe.
 *
 * The purchase flow is:
 *   Google Play purchase -> app sends the purchase token -> backend verifies it
 *   with Google -> backend stores the entitlement -> app reads /api/pro/status.
 * Never: button tap -> is_pro = true. Prices come from Google Play; the page
 * shows no price and no button while `purchasesAvailable` is false.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Zap, FileText, MessageCircle, ArrowLeft, Clock, ShoppingBag, Gauge } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePro } from '../contexts/ProContext';
import { useAuth } from '../contexts/AuthContext';
import { friendlyError } from '../lib/errors';
import { isAndroidApp, loadPlan, subscribe, restorePurchases, MANAGE_SUBSCRIPTIONS_URL } from '../lib/billing';

// Pro is built around decisions: "Before you spend, know if you can afford it."
// Money Streak, Month Shape and Safe-to-Invest stay free for everyone.
const PLANNED = [
  { icon: ShoppingBag, title: 'Unlimited Afford-It checks', desc: 'Check any purchase against your month, as often as you like (free: 5 a day).' },
  { icon: Gauge, title: 'Unlimited SIP stress tests', desc: 'Try different monthly amounts to see what your cash flow can carry.' },
  { icon: MessageCircle, title: 'More Vittova AI questions', desc: 'Ask your money mentor more than 10 questions a day.' },
  { icon: Zap, title: 'More receipt scans', desc: 'Scan more than 3 receipts a month.' },
  { icon: FileText, title: 'Bank statement import', desc: 'Import a bank statement PDF instead of adding past expenses one by one.' },
];

export default function ProUpgrade() {
  const navigate = useNavigate();
  const { isPro, limits, purchasesAvailable, refreshProStatus } = usePro();
  const { session } = useAuth();
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!purchasesAvailable || isPro || !isAndroidApp()) return undefined;
    loadPlan(session).then((p) => { if (!cancelled) setPlan(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [purchasesAvailable, isPro, session]);

  const run = async (kind) => {
    setBusy(kind);
    setMessage('');
    try {
      const outcome = kind === 'buy' ? await subscribe(plan, session) : await restorePurchases(session);
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
    <div className="min-h-screen bg-black text-white p-4 md:p-6 pb-16">
      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label="Back"
        className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center mb-6"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>

      <div className="mx-auto max-w-lg">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-black mb-2">Vittova Pro</h1>
          <p className="mb-3 text-sm font-semibold text-zinc-300">Before you spend, know if you can afford it.</p>
          {isPro ? (
            <p className="text-zinc-400">Pro features are active on your account.</p>
          ) : !purchasesAvailable ? (
            <p className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-sm font-bold text-amber-300">
              <Clock className="h-4 w-4" /> Coming soon: not available to buy yet
            </p>
          ) : null}
        </div>

        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-500">{purchasesAvailable ? 'Included in Pro' : 'Planned for Pro'}</h2>
        <div className="space-y-3 mb-8">
          {PLANNED.map((feat, idx) => (
            <motion.div
              key={feat.title}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.08 }}
              className="flex items-start gap-4 p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                <feat.icon className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="font-bold">{feat.title}</p>
                <p className="text-sm text-zinc-500 mt-1">{feat.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

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

        {purchasesAvailable && !isPro && plan && (
          <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4">
            <p className="text-lg font-black">{plan.price}{plan.period ? <span className="text-sm font-bold text-zinc-400"> / {plan.period}</span> : null}</p>
            <button type="button" disabled={!!busy} onClick={() => run('buy')}
              className="mt-3 w-full rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 py-3.5 text-sm font-black text-black disabled:opacity-60">
              {busy === 'buy' ? 'Opening Google Play…' : 'Subscribe with Google Play'}
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
              Billed by Google Play. Renews automatically until you cancel; cancel any time in Google Play → Payments &amp; subscriptions. Refunds follow Google Play's policies.
            </p>
          </div>
        )}

        {purchasesAvailable && !isPro && !isAndroidApp() && (
          <p className="mt-6 text-center text-sm text-zinc-400">Vittova Pro can be bought in the Vittova Android app.</p>
        )}

        {purchasesAvailable && isAndroidApp() && (
          <div className="mt-4 flex flex-col items-center gap-2 text-xs">
            <button type="button" disabled={!!busy} onClick={() => run('restore')} className="font-bold text-zinc-300 underline disabled:opacity-60">
              {busy === 'restore' ? 'Checking…' : 'Restore purchases'}
            </button>
            {isPro && <a href={MANAGE_SUBSCRIPTIONS_URL} target="_blank" rel="noopener noreferrer" className="text-zinc-400 underline">Manage subscription in Google Play</a>}
          </div>
        )}

        {message && <p role="status" className="mt-4 text-center text-sm text-zinc-200">{message}</p>}

        {!purchasesAvailable && (
          <p className="mt-6 text-center text-xs text-zinc-600">
            Nothing is charged and no subscription exists. We'll show pricing here only when Pro can actually be purchased through Google Play.
          </p>
        )}
      </div>
    </div>
  );
}
