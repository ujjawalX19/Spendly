/**
 * SubscriptionGraveyard.jsx — recurring monthly charges found in your expenses.
 *
 * Based only on payment data, Spendly can tell whether a recurring charge is
 * still happening, not whether you still use the service:
 *   active — the next charge is not overdue yet: worth reviewing
 *   lapsed — the expected charge has not appeared: probably cancelled or expired
 *
 * (The earlier "zombie" screen labelled lapsed charges as money being wasted,
 * which was the opposite of the truth.)
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Repeat, AlertCircle, Loader2, CheckCircle, PauseCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { API_URL, apiFetch } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';

const money = (v) => `₹${Math.round(Number(v) || 0).toLocaleString('en-IN')}`;
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—');

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 280, damping: 22 } },
};

function ChargeCard({ sub }) {
  const active = sub.status === 'active';
  return (
    <motion.div variants={cardVariants} className={`rounded-2xl p-5 border ${active ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-900/40 border-zinc-800/60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${active ? 'bg-amber-500/10' : 'bg-zinc-800'}`}>
            {active ? <Repeat className="w-6 h-6 text-amber-400" /> : <PauseCircle className="w-6 h-6 text-zinc-500" />}
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-white truncate">{sub.merchant}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{sub.category} · about every {sub.avgInterval} days</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-lg font-black font-mono tabular-nums ${active ? 'text-white' : 'text-zinc-500'}`}>{money(sub.monthlyAmount)}</p>
          <p className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">/month</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
        <span>{sub.paymentsDetected} payments · {money(sub.totalSpent)} total</span>
        <span>
          Last {shortDate(sub.lastPayment)}
          {active && sub.nextExpected ? ` · next around ${shortDate(sub.nextExpected)}` : ''}
        </span>
      </div>
      {!active && (
        <p className="mt-2 text-xs text-zinc-500">No charge since {shortDate(sub.lastPayment)}. It looks cancelled or expired.</p>
      )}
    </motion.div>
  );
}

export default function SubscriptionGraveyard() {
  const { session } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`${API_URL}/subscriptions/detect`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) throw Object.assign(new Error(json.message || `HTTP ${res.status}`), { status: res.status, data: json });
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(friendlyError(err, "We couldn't check for recurring charges right now. Please try again."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center" role="status">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto mb-3" />
          <p className="text-zinc-500 text-sm font-bold">Looking for recurring charges…</p>
        </div>
      </div>
    );
  }

  const subs = data?.subscriptions || [];
  const active = subs.filter((s) => s.status === 'active');
  const lapsed = subs.filter((s) => s.status !== 'active');

  return (
    <motion.div className="space-y-5 pb-6" initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.06 } } }}>
      <motion.header variants={cardVariants}>
        <h1 className="text-2xl font-black text-white">Recurring charges</h1>
        <p className="text-sm text-zinc-500 mt-1">Monthly payments found in your last four months of expenses.</p>
      </motion.header>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 text-sm flex items-center gap-2" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {data && subs.length === 0 && (
        <motion.div variants={cardVariants} className="rounded-2xl bg-zinc-900 border border-zinc-800 p-8 text-center">
          <CheckCircle className="w-10 h-10 text-lime-400 mx-auto mb-3" />
          <p className="text-lg font-bold text-white">No recurring charges found</p>
          <p className="text-sm text-zinc-500 mt-1">We look for payments to the same payee, of a similar amount, about a month apart. Keep logging and check back later.</p>
        </motion.div>
      )}

      {active.length > 0 && (
        <section className="space-y-3">
          <motion.div variants={cardVariants} className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
            <p className="text-sm text-zinc-400">Still charging you</p>
            <p className="text-3xl font-black text-amber-300 font-mono tabular-nums">{money(data.activeMonthlyTotal)}<span className="text-sm text-zinc-500"> / month</span></p>
            <p className="text-xs text-zinc-500 mt-1">Review these. If you no longer use one, cancel it with the provider or revoke the UPI AutoPay mandate in your UPI app.</p>
          </motion.div>
          {active.map((sub) => <ChargeCard key={sub.normalizedName} sub={sub} />)}
        </section>
      )}

      {lapsed.length > 0 && (
        <section className="space-y-3">
          <p className="text-xs uppercase font-bold text-zinc-500 tracking-wider px-1">Stopped</p>
          {lapsed.map((sub) => <ChargeCard key={sub.normalizedName} sub={sub} />)}
        </section>
      )}
    </motion.div>
  );
}
