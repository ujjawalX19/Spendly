/**
 * ProUpgrade.jsx — what Vittova Pro will include.
 *
 * There is NO purchase flow. Google Play Billing and server-side purchase
 * verification are not implemented (see BILLING_ARCHITECTURE.md), so this page
 * must not show a price button, simulate a purchase, or suggest a subscription
 * exists. It only lists the planned features and the current free-plan limits.
 *
 * When billing ships, the flow must be:
 *   Google Play purchase -> backend verifies with Google -> backend stores the
 *   entitlement -> app reads it from /api/pro/status.
 * Never: button tap -> is_pro = true.
 */

import { motion } from 'framer-motion';
import { Sparkles, Zap, FileText, MessageCircle, ArrowLeft, Clock, ShoppingBag, Gauge } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePro } from '../contexts/ProContext';

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
  const { isPro, limits, purchasesAvailable } = usePro();

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
          ) : (
            <p className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-sm font-bold text-amber-300">
              <Clock className="h-4 w-4" /> Coming soon: not available to buy yet
            </p>
          )}
        </div>

        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-500">Planned for Pro</h2>
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

        {!purchasesAvailable && (
          <p className="mt-6 text-center text-xs text-zinc-600">
            Nothing is charged and no subscription exists. We'll show pricing here only when Pro can actually be purchased through Google Play.
          </p>
        )}
      </div>
    </div>
  );
}
