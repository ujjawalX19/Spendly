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
import { ArrowLeft, Bell, BellOff, ChevronDown, ExternalLink, Loader2, Repeat, TrendingUp } from 'lucide-react';
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
    <li className="v-block p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-ink">{item.merchant}</p>
          <p className="mt-0.5 text-xs text-ink-2">{item.frequencyLabel}{item.frequency !== 'monthly' ? ` · ${inr(item.monthlyEquivalent)}/month` : ''} · <span className={conf.className}>{conf.label}</span></p>
        </div>
        <p className="shrink-0 font-display text-lg font-bold tabular-nums text-ink">{inr(item.amount)}</p>
      </div>

      {item.priceChange?.direction === 'increase' && (
        <p className="mt-3 flex items-start gap-2 text-xs text-warn">
          <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> <span><strong className="font-semibold">Recurring price changed.</strong> {item.priceChange.message}</span>
        </p>
      )}
      {item.chargedAfterCancel && <p className="mt-2 text-xs text-danger">You marked this cancelled, but a payment appeared afterwards. Check for an active AutoPay mandate.</p>}

      <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 text-xs">
        <div><dt className="text-ink-3">Last debit</dt><dd className="mt-0.5 text-ink-soft">{formatDay(item.lastDebit.dateKey)} · {inr(item.lastDebit.amount)}</dd></div>
        <div><dt className="text-ink-3">Next</dt><dd className="mt-0.5 text-ink-soft">{item.nextExpected ? dueLabel(item.nextExpected.dateKey, today) : 'Not expected (stopped?)'}</dd></div>
      </dl>

      {item.decision ? (
        <p className="mt-3 flex items-center justify-between text-xs">
          <span className="font-semibold text-ink-soft">{DECISION_BADGE[item.decision]}</span>
          <button type="button" disabled={busy} onClick={() => onDecide(item, 'cleared')} className="-my-3 min-h-[44px] text-ink-2 underline">Change</button>
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {DECISIONS.map((d) => (
            <button key={d.value} type="button" disabled={busy} onClick={() => onDecide(item, d.value)}
              className="v-press v-btn-secondary px-3 text-xs">{d.label}</button>
          ))}
        </div>
      )}

      <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 flex min-h-[44px] items-center gap-1 text-xs font-medium text-ink-2" aria-expanded={open}>
        History and how to stop it <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="space-y-3 text-xs text-ink-2">
          <ul className="space-y-1">{item.history.slice(0, 12).map((h) => <li key={h.dateKey} className="flex justify-between"><span>{formatDay(h.dateKey)}</span><span className="font-mono tabular-nums text-ink-soft">{inr(h.amount)}</span></li>)}</ul>
          {item.guide && (
            <div className="border-t border-line pt-3">
              <p className="mb-1 font-semibold text-ink-soft">If you want to stop it</p>
              <ol className="list-decimal space-y-0.5 pl-4">{item.guide.steps.map((s) => <li key={s}>{s}</li>)}</ol>
              {item.guide.url && (
                <a href={item.guide.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-[32px] items-center gap-1 font-semibold text-ink underline">
                  {item.guide.name}: official page <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              )}
              <p className="mt-2 text-ink-3">Vittova never cancels anything for you and never asks for an OTP.</p>
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
      <div className="mx-auto max-w-lg space-y-4 text-ink">
        <Link to="/settings" className="-ml-1 inline-flex min-h-[44px] items-center gap-1 px-1 text-sm text-ink-2"><ArrowLeft className="h-4 w-4" /> Back</Link>
        <div>
          <p className="v-label">Vittova Pro</p>
          <h1 className="mt-1 text-2xl font-bold">Subscription leak audit</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">Find recurring payments, see price rises, and get a reminder the day before an expected debit. Part of Vittova Pro.</p>
          {/* Stacked: side by side, both labels wrapped onto two lines on a phone. */}
          <div className="mt-5 flex flex-col gap-2">
            <Link to="/pro" className="v-press v-btn-primary w-full">See what Pro includes</Link>
            <Link to="/graveyard" className="v-press v-btn-secondary min-h-12 w-full">View recurring charges (free)</Link>
          </div>
        </div>
      </div>
    );
  }

  const audit = data?.audit;
  const groups = groupItems(audit?.items || []);

  return (
    <div className="mx-auto max-w-lg space-y-6 pb-6 text-ink">
      <div>
        <Link to="/settings" className="-ml-1 inline-flex min-h-[44px] items-center gap-1 px-1 text-sm text-ink-2"><ArrowLeft className="h-4 w-4" /> Back</Link>
        <header>
          <h1 className="text-2xl font-bold">Recurring payments</h1>
          <p className="mt-1 text-sm text-ink-2">Identify potential spending leaks and decide what to keep.</p>
        </header>
      </div>

      {error && <p role="alert" className="v-error">{error}</p>}
      {!data && !error && <div className="flex justify-center py-10" role="status"><Loader2 className="h-6 w-6 animate-spin text-ink-2" /></div>}

      {audit && (
        <>
          <section className="v-block p-4">
            <div className="grid grid-cols-2 gap-4">
              <div><p className="text-xs text-ink-2">A month</p><p className="mt-1.5 text-[26px] font-semibold leading-none tabular-nums">{inr(audit.totals.monthly)}</p></div>
              <div><p className="text-xs text-ink-2">A year</p><p className="mt-1.5 text-[26px] font-semibold leading-none tabular-nums">{inr(audit.totals.yearly)}</p></div>
            </div>
            {audit.totals.priceIncreasesPerYear > 0 && <p className="mt-3 text-xs text-warn">Price rises add about {inr(audit.totals.priceIncreasesPerYear)} a year if they continue.</p>}
            {audit.totals.unwantedMonthly > 0 && <p className="mt-1 text-xs text-ink-2">Marked unwanted: {inr(audit.totals.unwantedMonthly)} a month.</p>}
          </section>

          <div>
            <section className="v-block flex items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 gap-3">
                {reminders ? <Bell className="mt-0.5 h-5 w-5 shrink-0 text-ink-2" aria-hidden="true" /> : <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-ink-3" aria-hidden="true" />}
                <div className="min-w-0">
                  <p className="text-sm font-medium">Remind me the day before</p>
                  <p className="mt-0.5 text-xs text-ink-3">For confirmed and high-confidence payments. {remindersSupported() ? 'Shown on this phone only.' : 'Android app only.'}</p>
                </div>
              </div>
              <button type="button" role="switch" aria-checked={reminders} aria-label="Debit reminders" onClick={toggleReminders}
                className="v-press flex min-h-[44px] shrink-0 items-center">
                <span className={`relative h-7 w-12 rounded-full transition-colors ${reminders ? 'bg-accent' : 'bg-surface-3'}`}>
                  <span className={`absolute left-0 top-1 block h-5 w-5 rounded-full bg-knob shadow transition-transform ${reminders ? 'translate-x-6' : 'translate-x-1'}`} />
                </span>
              </button>
            </section>
            {reminderNote && <p className="mt-2 text-xs text-warn">{reminderNote}</p>}
          </div>

          {!audit.items.length && (
            <div className="px-4 py-8 text-center">
              <Repeat className="mx-auto mb-3 h-6 w-6 text-ink-3" aria-hidden="true" />
              <p className="text-base font-semibold">No recurring payments found yet</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-ink-2">They appear after two or more regular payments to the same merchant.</p>
            </div>
          )}
          {groups.review.length > 0 && (
            <section><h2 className="v-label mb-2">Is this recurring?</h2>
              <ul className="space-y-2">{groups.review.map((i) => <Item key={i.merchantKey} item={i} today={today} onDecide={decide} busy={busy} />)}</ul></section>
          )}
          {groups.counted.length > 0 && (
            <section><h2 className="v-label mb-2">Recurring payments</h2>
              <ul className="space-y-2">{groups.counted.map((i) => <Item key={i.merchantKey} item={i} today={today} onDecide={decide} busy={busy} />)}</ul></section>
          )}
          {data.verification.length > 0 && (
            <section>
              <h2 className="v-label mb-2">Expected debits</h2>
              <ul className="v-block v-rows px-4 text-sm">
                {data.verification.map((v) => (
                  <li key={`${v.merchantKey}-${v.expectedDate}`} className="flex min-h-[44px] items-center justify-between gap-3 py-2">
                    <span className="truncate text-ink-soft">{v.merchant} <span className="text-ink-3">· {formatDay(v.expectedDate)}</span></span>
                    <span className={`shrink-0 text-xs font-semibold ${VERIFY_LABEL[v.status]?.className || ''}`}>{VERIFY_LABEL[v.status]?.label}{v.status === 'matched' && v.matchedAmount !== v.expectedAmount ? ` (${inr(v.matchedAmount)})` : ''}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {groups.other.length > 0 && (
            <section><h2 className="v-label mb-2">Stopped or set aside</h2>
              <ul className="space-y-2 opacity-80">{groups.other.map((i) => <Item key={i.merchantKey} item={i} today={today} onDecide={decide} busy={busy} />)}</ul></section>
          )}
          <p className="text-[11px] leading-relaxed text-ink-3">{audit.note}</p>
        </>
      )}
    </div>
  );
}
