/**
 * Subscription & Recurring Expense Audit (Vittova Pro).
 *
 * Shows recurring payments found in the user's own records, what they cost a
 * month and a year, price changes, the next expected debit, and whether past
 * expected debits were seen. The user confirms or dismisses each one; Vittova
 * never cancels anything. Data: GET /api/subscription-audit.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bell, BellOff, ChevronDown, ExternalLink, Loader2, Repeat, TrendingUp, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePro } from '../contexts/ProContext';
import { apiJson } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';
import { track } from '../lib/telemetry';
import { localDateKey } from '../lib/dates';
import { CONFIDENCE, DECISIONS, DECISION_BADGE, VERIFY_LABEL, dueLabel, formatDay, groupItems } from '../lib/auditDisplay';
import { remindersSupported, remindersWanted, scheduleReminders, turnRemindersOff, turnRemindersOn } from '../lib/debitReminders';

const inr = (v) => `₹${Math.round(Number(v) || 0).toLocaleString('en-IN')}`;

function Item({ item, today, onDecide, busy }) {
  const [open, setOpen] = useState(false);
  const conf = CONFIDENCE[item.confidence] || CONFIDENCE.possible;
  return (
    <li className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-bold text-white">{item.merchant}</p>
          <p className="text-xs text-zinc-400">{item.frequencyLabel} · {inr(item.amount)}{item.frequency !== 'monthly' ? ` (${inr(item.monthlyEquivalent)}/month)` : ''}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${conf.className}`}>{conf.label}</span>
      </div>

      {item.priceChange?.direction === 'increase' && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span><strong>Recurring price changed.</strong> {item.priceChange.message}</span>
        </p>
      )}
      {item.chargedAfterCancel && <p className="mt-2 text-xs text-rose-300">You marked this cancelled, but a payment appeared afterwards. Check for an active AutoPay mandate.</p>}

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div><dt className="text-zinc-500">Last debit</dt><dd className="text-zinc-200">{formatDay(item.lastDebit.dateKey)} · {inr(item.lastDebit.amount)}</dd></div>
        <div><dt className="text-zinc-500">Next</dt><dd className="text-zinc-200">{item.nextExpected ? dueLabel(item.nextExpected.dateKey, today) : 'Not expected (stopped?)'}</dd></div>
      </dl>

      {item.decision ? (
        <p className="mt-3 flex items-center justify-between text-xs">
          <span className="font-bold text-zinc-300">{DECISION_BADGE[item.decision]}</span>
          <button type="button" disabled={busy} onClick={() => onDecide(item, 'cleared')} className="text-zinc-400 underline">Change</button>
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {DECISIONS.map((d) => (
            <button key={d.value} type="button" disabled={busy} onClick={() => onDecide(item, d.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-[11px] font-bold text-zinc-200 disabled:opacity-50">{d.label}</button>
          ))}
        </div>
      )}

      <button type="button" onClick={() => setOpen((v) => !v)} className="mt-3 flex items-center gap-1 text-xs font-semibold text-zinc-400" aria-expanded={open}>
        History and how to stop it <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2 space-y-3 text-xs text-zinc-400">
          <ul className="space-y-1">{item.history.slice(0, 12).map((h) => <li key={h.dateKey} className="flex justify-between"><span>{formatDay(h.dateKey)}</span><span className="font-mono text-zinc-300">{inr(h.amount)}</span></li>)}</ul>
          {item.guide && (
            <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
              <p className="mb-1 font-bold text-zinc-300">If you want to stop it</p>
              <ol className="list-decimal space-y-0.5 pl-4">{item.guide.steps.map((s) => <li key={s}>{s}</li>)}</ol>
              {item.guide.url && (
                <a href={item.guide.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-lime-300 underline">
                  {item.guide.name}: official page <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <p className="mt-2 text-zinc-500">Vittova never cancels anything for you and never asks for an OTP.</p>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export default function SubscriptionAudit() {
  const { session } = useAuth();
  const { isPro, features } = usePro();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reminders, setReminders] = useState(remindersWanted());
  const [reminderNote, setReminderNote] = useState('');
  const today = localDateKey(new Date());

  const load = useCallback(async () => {
    setError('');
    try {
      const d = await apiJson('/subscription-audit', { session });
      setData(d);
      if (remindersWanted()) scheduleReminders(d.reminders).catch(() => {});
    } catch (err) {
      setError(friendlyError(err, "We couldn't load your recurring payments."));
    }
  }, [session]);

  useEffect(() => {
    track('subscription_audit_opened');
    if (isPro && features.subscriptionAuditEnabled !== false) load();
  }, [isPro, features.subscriptionAuditEnabled, load]);

  const decide = async (item, decision) => {
    setBusy(true);
    try {
      await apiJson('/subscription-audit/decision', { session, method: 'POST', body: { merchantKey: item.merchantKey, decision } });
      await load();
    } catch (err) {
      setError(friendlyError(err, "We couldn't save that."));
    } finally {
      setBusy(false);
    }
  };

  const toggleReminders = async () => {
    setReminderNote('');
    if (reminders) {
      await turnRemindersOff();
      setReminders(false);
      return;
    }
    const outcome = await turnRemindersOn(data?.reminders || []);
    if (outcome === 'on') setReminders(true);
    else if (outcome === 'denied') setReminderNote('Notifications are off for Vittova. Turn them on in Android settings to get reminders.');
    else setReminderNote('Reminders work in the Vittova Android app.');
  };

  if (!isPro) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-1 text-white">
        <Link to="/settings" className="inline-flex items-center gap-1 text-sm text-zinc-400"><ArrowLeft className="h-4 w-4" /> Back</Link>
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5">
          <Sparkles className="h-6 w-6 text-amber-300" />
          <h1 className="mt-2 text-xl font-black">Subscription leak audit</h1>
          <p className="mt-1 text-sm text-zinc-300">Find recurring payments, see price rises, and get a reminder the day before an expected debit. Part of Vittova Pro.</p>
          <div className="mt-4 flex gap-2">
            <Link to="/pro" className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-black text-black">See Vittova Pro</Link>
            <Link to="/graveyard" className="rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-bold text-zinc-200">Free recurring charges</Link>
          </div>
        </div>
      </div>
    );
  }

  const audit = data?.audit;
  const groups = groupItems(audit?.items || []);

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-6 text-white">
      <Link to="/settings" className="inline-flex items-center gap-1 text-sm text-zinc-400"><ArrowLeft className="h-4 w-4" /> Back</Link>
      <header>
        <p className="text-xs font-bold uppercase tracking-widest text-lime-400">Pro · Subscription audit</p>
        <h1 className="mt-1 text-2xl font-black">Recurring payments</h1>
        <p className="mt-1 text-sm text-zinc-400">Identify potential spending leaks and decide what to keep.</p>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
      {!data && !error && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-lime-400" /></div>}

      {audit && (
        <>
          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"><p className="text-xs text-zinc-500">A month</p><p className="text-2xl font-black">{inr(audit.totals.monthly)}</p></div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"><p className="text-xs text-zinc-500">A year</p><p className="text-2xl font-black">{inr(audit.totals.yearly)}</p></div>
            {audit.totals.priceIncreasesPerYear > 0 && <p className="col-span-2 text-xs text-amber-200">Price rises add about {inr(audit.totals.priceIncreasesPerYear)} a year if they continue.</p>}
            {audit.totals.unwantedMonthly > 0 && <p className="col-span-2 text-xs text-zinc-400">Marked unwanted: {inr(audit.totals.unwantedMonthly)} a month.</p>}
          </section>

          <section className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold">{reminders ? <Bell className="h-4 w-4 text-lime-400" /> : <BellOff className="h-4 w-4 text-zinc-500" />} Remind me the day before</p>
              <p className="text-xs text-zinc-500">For confirmed and high-confidence payments. {remindersSupported() ? 'Shown on this phone only.' : 'Android app only.'}</p>
            </div>
            <button type="button" role="switch" aria-checked={reminders} onClick={toggleReminders}
              className={`h-7 w-12 rounded-full p-1 transition-colors ${reminders ? 'bg-lime-400' : 'bg-zinc-700'}`}>
              <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${reminders ? 'translate-x-5' : ''}`} />
            </button>
          </section>
          {reminderNote && <p className="text-xs text-amber-200">{reminderNote}</p>}

          {!audit.items.length && (
            <p className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400"><Repeat className="mb-2 h-5 w-5" /> No recurring payments found yet. They appear after two or more regular payments to the same merchant.</p>
          )}
          {groups.review.length > 0 && (
            <section><h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">Is this recurring?</h2>
              <ul className="space-y-3">{groups.review.map((i) => <Item key={i.merchantKey} item={i} today={today} onDecide={decide} busy={busy} />)}</ul></section>
          )}
          {groups.counted.length > 0 && (
            <section><h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">Recurring payments</h2>
              <ul className="space-y-3">{groups.counted.map((i) => <Item key={i.merchantKey} item={i} today={today} onDecide={decide} busy={busy} />)}</ul></section>
          )}
          {data.verification.length > 0 && (
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">Expected debits</h2>
              <ul className="space-y-1.5 text-xs">
                {data.verification.map((v) => (
                  <li key={`${v.merchantKey}-${v.expectedDate}`} className="flex justify-between gap-2">
                    <span className="truncate text-zinc-300">{v.merchant} · {formatDay(v.expectedDate)}</span>
                    <span className={VERIFY_LABEL[v.status]?.className}>{VERIFY_LABEL[v.status]?.label}{v.status === 'matched' && v.matchedAmount !== v.expectedAmount ? ` (${inr(v.matchedAmount)})` : ''}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {groups.other.length > 0 && (
            <section><h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">Stopped or set aside</h2>
              <ul className="space-y-3 opacity-80">{groups.other.map((i) => <Item key={i.merchantKey} item={i} today={today} onDecide={decide} busy={busy} />)}</ul></section>
          )}
          <p className="text-[11px] leading-relaxed text-zinc-500">{audit.note}</p>
        </>
      )}
    </div>
  );
}
