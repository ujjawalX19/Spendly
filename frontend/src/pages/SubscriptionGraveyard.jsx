/**
 * Recurring charges — subscription intelligence.
 *
 * From payment data Vittova can tell whether a recurring charge is still
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
import { Repeat, AlertCircle, Loader2, ChevronDown, ExternalLink, Undo2 } from 'lucide-react';
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

// The status is plain coloured text under the name, not an icon tile.
const STATUS = {
  charged_after_cancel: { label: 'Charged after you cancelled', tone: 'text-danger' },
  active: { label: 'Still charging', tone: 'text-warn' },
  lapsed: { label: 'Stopped: looks cancelled or expired', tone: 'text-ink-3' },
  cancelled: { label: 'You marked this cancelled', tone: 'text-accent' },
};

function ChargeCard({ sub, busy, onCancel, onUndo }) {
  const [open, setOpen] = useState(sub.status === 'charged_after_cancel');
  const s = STATUS[sub.status] || STATUS.active;
  const guide = sub.cancellation;

  return (
    <li className="v-block p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-ink">{guide?.matched ? guide.service : sub.merchant}</p>
          <p className={`mt-0.5 text-xs font-semibold ${s.tone}`}>{s.label}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-lg font-bold tabular-nums text-ink">{inr(sub.monthlyAmount)}<span className="text-xs font-normal text-ink-3">/mo</span></p>
          <p className="text-[11px] text-ink-3">{inr(sub.annualAmount)} a year</p>
        </div>
      </div>

      {sub.paymentsDetected > 0 && (
        <p className="mt-2 text-xs text-ink-3">
          {sub.paymentsDetected} payments · last {shortDate(sub.lastPayment)}
          {sub.status === 'active' && sub.nextExpected ? ` · next around ${shortDate(sub.nextExpected)}` : ''}
          {sub.cancelledAt ? ` · marked cancelled ${shortDate(sub.cancelledAt)}` : ''}
        </p>
      )}

      {(sub.status === 'active' || sub.status === 'charged_after_cancel') && guide && (
        <div className="mt-3 border-t border-line">
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-[44px] w-full items-center justify-between text-[13px] font-medium text-ink-soft">
            How to cancel <ChevronDown className={`h-4 w-4 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {open && (
            <div className="space-y-2 pb-1 text-xs text-ink-2">
              <ol className="list-decimal space-y-1 pl-4">{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol>
              {guide.note && <p className="text-ink-3">{guide.note}</p>}
              {guide.url && (
                <button type="button" onClick={() => openExternal(guide.url)} className="inline-flex min-h-[32px] items-center gap-1 font-semibold text-ink underline">
                  Open {guide.service} account page <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {sub.status !== 'lapsed' && (
        <div className="mt-3">
          {sub.status === 'cancelled' ? (
            <button type="button" disabled={busy} onClick={() => onUndo(sub)} className="v-press v-btn-secondary">
              <Undo2 className="h-4 w-4" aria-hidden="true" /> Undo
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={() => onCancel(sub)} className="v-press v-btn-secondary">
              {sub.status === 'charged_after_cancel' ? 'Mark cancelled again' : 'I cancelled this'}
            </button>
          )}
        </div>
      )}
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
          <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-ink-2" />
          <p className="text-sm text-ink-3">{waking ? 'Waking the server up…' : 'Looking for recurring charges…'}</p>
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
    <motion.div className="space-y-6 pb-6 text-ink" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      <header>
        <h1 className="text-2xl font-bold">Recurring charges</h1>
        <p className="mt-1 text-sm text-ink-2">Payments to the same payee, of a similar amount, about a month apart, from your last four months of expenses.</p>
      </header>

      {error && (
        <p role="alert" className="v-error flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> {error}</p>
      )}

      {subs.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <Repeat className="mx-auto mb-3 h-6 w-6 text-ink-3" aria-hidden="true" />
          <p className="text-base font-semibold">No recurring charges found</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-ink-2">Keep logging expenses (or turn on UPI detection) and check back later.</p>
        </div>
      ) : (
        <div className="flex gap-8">
          <div>
            <p className="text-[13px] text-ink-2">Still charging you</p>
            <p className="mt-1 font-display text-[34px] font-bold leading-none tabular-nums">{inr(data.activeMonthlyTotal)}<span className="text-sm font-normal text-ink-3">/mo</span></p>
            <p className="mt-1.5 text-xs text-ink-3">{inr(data.activeAnnualTotal)} a year</p>
          </div>
          <div>
            <p className="text-[13px] text-ink-2">Stopped by cancelling</p>
            <p className="mt-1 font-display text-xl font-bold leading-none tabular-nums text-accent">{inr(data.cancelledMonthlySavings)}<span className="text-xs font-normal text-ink-3">/mo</span></p>
            <p className="mt-1.5 text-xs text-ink-3">{data.cancelledCount} cancelled</p>
          </div>
        </div>
      )}

      {groups.map(([title, list]) => (
        <section key={title}>
          <h2 className="v-label mb-2">{title}</h2>
          <ul className="space-y-2">
            {list.map((sub) => (
              <ChargeCard key={sub.normalizedName} sub={sub} busy={busy === sub.normalizedName} onCancel={(s) => act(s, 'cancel')} onUndo={(s) => act(s, 'undo')} />
            ))}
          </ul>
        </section>
      ))}

      <p className="text-[11px] leading-relaxed text-ink-3">
        Marking a charge cancelled only updates Vittova. Cancel with the service itself, and revoke any UPI AutoPay mandate in your UPI app.
      </p>
    </motion.div>
  );
}
