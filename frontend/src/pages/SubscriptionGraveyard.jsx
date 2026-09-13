/**
 * Recurring charges — subscription intelligence.
 *
 * From payment data Spendly can tell whether a recurring charge is still
 * happening, not whether the service is still used:
 *   active                — still charging: worth reviewing
 *   charged_after_cancel  — marked cancelled, but charged again (revoke the mandate)
 *   lapsed                — the expected charge stopped appearing
 *   cancelled             — the user marked it cancelled
 *
 * Cancellation links go only to a service's own account/cancellation page.
 */

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Repeat, AlertCircle, Loader2, CheckCircle, PauseCircle, AlertTriangle, ChevronDown, ExternalLink, Undo2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../contexts/AuthContext';
import { apiJson } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';

const inr = (v) => `₹${Math.round(Number(v) || 0).toLocaleString('en-IN')}`;
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—');

async function openExternal(url) {
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

const STATUS = {
  charged_after_cancel: { label: 'Charged after you cancelled', tone: 'text-rose-300', icon: AlertTriangle, iconBg: 'bg-rose-500/15', iconColor: 'text-rose-400' },
  active: { label: 'Still charging', tone: 'text-amber-300', icon: Repeat, iconBg: 'bg-amber-500/10', iconColor: 'text-amber-400' },
  lapsed: { label: 'Stopped: looks cancelled or expired', tone: 'text-zinc-400', icon: PauseCircle, iconBg: 'bg-zinc-800', iconColor: 'text-zinc-500' },
  cancelled: { label: 'You marked this cancelled', tone: 'text-lime-300', icon: CheckCircle, iconBg: 'bg-lime-400/10', iconColor: 'text-lime-400' },
};

function ChargeCard({ sub, busy, onCancel, onUndo }) {
  const [open, setOpen] = useState(sub.status === 'charged_after_cancel');
  const s = STATUS[sub.status] || STATUS.active;
  const Icon = s.icon;
  const guide = sub.cancellation;

  return (
    <li className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${s.iconBg}`}><Icon className={`h-5 w-5 ${s.iconColor}`} /></div>
          <div className="min-w-0">
            <p className="truncate font-bold text-white">{guide?.matched ? guide.service : sub.merchant}</p>
            <p className={`text-xs font-semibold ${s.tone}`}>{s.label}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-lg font-black text-white">{inr(sub.monthlyAmount)}<span className="text-xs text-zinc-500">/mo</span></p>
          <p className="text-[11px] text-zinc-500">{inr(sub.annualAmount)} a year</p>
        </div>
      </div>

      {sub.paymentsDetected > 0 && (
        <p className="mt-2 text-xs text-zinc-500">
          {sub.paymentsDetected} payments · last {shortDate(sub.lastPayment)}
          {sub.status === 'active' && sub.nextExpected ? ` · next around ${shortDate(sub.nextExpected)}` : ''}
          {sub.cancelledAt ? ` · marked cancelled ${shortDate(sub.cancelledAt)}` : ''}
        </p>
      )}

      {(sub.status === 'active' || sub.status === 'charged_after_cancel') && guide && (
        <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950">
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between px-3 py-2 text-xs font-bold text-zinc-300">
            How to cancel <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <div className="space-y-2 px-3 pb-3 text-xs text-zinc-400">
              <ol className="list-decimal space-y-1 pl-4">{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol>
              {guide.note && <p className="text-zinc-500">{guide.note}</p>}
              {guide.url && (
                <button type="button" onClick={() => openExternal(guide.url)} className="inline-flex items-center gap-1 font-bold text-lime-400">
                  Open {guide.service} account page <ExternalLink className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex justify-end">
        {sub.status === 'cancelled' ? (
          <button type="button" disabled={busy} onClick={() => onUndo(sub)} className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-300 disabled:opacity-50">
            <Undo2 className="h-3.5 w-3.5" /> Undo
          </button>
        ) : sub.status !== 'lapsed' && (
          <button type="button" disabled={busy} onClick={() => onCancel(sub)} className="rounded-xl bg-lime-400 px-3 py-1.5 text-xs font-black text-black disabled:opacity-50">
            {sub.status === 'charged_after_cancel' ? 'Mark cancelled again' : 'I cancelled this'}
          </button>
        )}
      </div>
    </li>
  );
}

export default function SubscriptionGraveyard() {
  const { session } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [waking, setWaking] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const json = await apiJson('/subscriptions/detect', { session, onRetry: () => setWaking(true) });
      setData(json);
      setError('');
    } catch (err) {
      setError(friendlyError(err, "We couldn't check for recurring charges right now."));
      setData((d) => d || { subscriptions: [] });
    } finally {
      setWaking(false);
    }
  }, [session]);

  useEffect(() => { load(); }, [load]);

  const act = async (sub, method) => {
    setBusy(sub.normalizedName);
    try {
      if (method === 'cancel') {
        await apiJson('/subscriptions/cancelled', { session, method: 'POST', body: { normalizedName: sub.normalizedName } });
      } else {
        await apiJson(`/subscriptions/cancelled/${encodeURIComponent(sub.normalizedName)}`, { session, method: 'DELETE' });
      }
      await load();
    } catch (err) {
      setError(friendlyError(err, "Couldn't update that subscription."));
    } finally {
      setBusy(null);
    }
  };

  if (!data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" role="status">
        <div className="text-center">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-amber-400" />
          <p className="text-sm text-zinc-500">{waking ? 'Waking the server up…' : 'Looking for recurring charges…'}</p>
        </div>
      </div>
    );
  }

  const subs = data.subscriptions || [];
  const groups = [
    ['Needs attention', subs.filter((s) => s.status === 'charged_after_cancel')],
    ['Still charging', subs.filter((s) => s.status === 'active')],
    ['Cancelled', subs.filter((s) => s.status === 'cancelled')],
    ['Stopped', subs.filter((s) => s.status === 'lapsed')],
  ].filter(([, list]) => list.length);

  return (
    <motion.div className="space-y-5 pb-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <header>
        <h1 className="text-2xl font-black text-white">Recurring charges</h1>
        <p className="mt-1 text-sm text-zinc-500">Payments to the same payee, of a similar amount, about a month apart, from your last four months of expenses.</p>
      </header>

      {error && (
        <p role="alert" className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300"><AlertCircle className="h-4 w-4 shrink-0" /> {error}</p>
      )}

      {subs.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <CheckCircle className="mx-auto mb-3 h-10 w-10 text-lime-400" />
          <p className="text-lg font-bold text-white">No recurring charges found</p>
          <p className="mt-1 text-sm text-zinc-500">Keep logging expenses (or turn on UPI detection) and check back later.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-xs text-zinc-400">Still charging you</p>
            <p className="font-mono text-2xl font-black text-amber-300">{inr(data.activeMonthlyTotal)}<span className="text-xs text-zinc-500">/mo</span></p>
            <p className="text-xs text-zinc-500">{inr(data.activeAnnualTotal)} a year</p>
          </div>
          <div className="rounded-2xl border border-lime-500/20 bg-lime-500/5 p-4">
            <p className="text-xs text-zinc-400">Stopped by cancelling</p>
            <p className="font-mono text-2xl font-black text-lime-300">{inr(data.cancelledMonthlySavings)}<span className="text-xs text-zinc-500">/mo</span></p>
            <p className="text-xs text-zinc-500">{data.cancelledCount} cancelled</p>
          </div>
        </div>
      )}

      {groups.map(([title, list]) => (
        <section key={title}>
          <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-zinc-500">{title}</h2>
          <ul className="space-y-3">
            {list.map((sub) => (
              <ChargeCard key={sub.normalizedName} sub={sub} busy={busy === sub.normalizedName} onCancel={(s) => act(s, 'cancel')} onUndo={(s) => act(s, 'undo')} />
            ))}
          </ul>
        </section>
      ))}

      <p className="px-1 text-[11px] text-zinc-600">
        Marking a charge cancelled only updates Spendly. Cancel with the service itself, and revoke any UPI AutoPay mandate in your UPI app.
      </p>
    </motion.div>
  );
}
