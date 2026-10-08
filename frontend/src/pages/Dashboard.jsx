/**
 * Dashboard.jsx — Vittova Home.
 *
 * Answers four questions in about three seconds, in this order:
 *   1. How much can I spend?          MoneyStatus
 *   2. Can I afford this?             AffordItCard (the main action)
 *   3. What needs my attention?       MoneyHealth + one InsightCard
 *   4. Am I keeping my habit?         MoneyStreakCard (compact)
 * Everything else moved one tap deeper (Activity, Wealth, Profile) — nothing
 * was removed. Adding an expense (with receipt scan) stays on the + button;
 * payment-notification prompts stay here.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Camera, Zap, AlertCircle, Plus, X, Check, CheckCircle } from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';
import { useExpenses } from '../hooks/useExpenses';
import { usePaymentNotifications } from '../hooks/usePaymentNotifications';
import { usePaymentTracking } from '../contexts/PaymentTrackingContext';
import PermissionBanner from '../components/PermissionBanner';
import SmsAccessSheet from '../components/SmsAccessSheet';
import AffordItCard from '../components/AffordItCard';
import MoneyStreakCard from '../components/MoneyStreakCard';
import { MoneyStatus, InsightRow, MonthRows, RecentActivity, AskRow } from '../components/HomeCards';
import { API_URL, apiFetch } from '../lib/apiConfig';
import { prepareReceiptImage } from '../lib/receiptImage';
import { expenseMeta, expenseTitle } from '../lib/expenseDisplay';

// ─── ADD EXPENSE MODAL ────────────────────────────────────────
// Must match the backend's expense categories (routes/expenses.js). 'Grocery'
// was offered here but rejected by the API, so those expenses silently failed.
const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Recharge', 'Entertainment', 'Rent', 'Other'];

function AddExpenseModal({ onClose, onAdd, loading, onScan, scanLoading }) {
  const [form, setForm] = useState({ desc: '', amount: '', category: 'Food' });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.desc || !form.amount) return;
    setError('');
    const result = await onAdd(parseFloat(form.amount), form.category, form.desc);
    // Keep the form open with the reason if the expense was not saved.
    if (result?.success) onClose();
    else setError(result?.message || "We couldn't save that expense. Please try again.");
  };

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="v-scrim absolute inset-0"
        onClick={onClose}
      />
      <motion.div
        className="v-sheet relative w-full max-w-md p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] z-10"
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'tween', duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="w-9 h-1 bg-surface-3 rounded-full mx-auto mb-4 sm:hidden" />
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-ink">Add expense</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="v-press flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-ink-2">
            <X className="w-4 h-4" />
          </button>
        </div>
        <button type="button" onClick={onScan} disabled={scanLoading}
          className="v-press mb-4 flex min-h-[52px] w-full items-center gap-3 rounded-xl bg-surface-2 px-4 text-left disabled:opacity-60">
          {scanLoading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-ink-2 border-t-transparent" /> : <Camera className="h-5 w-5 text-ink-2" aria-hidden="true" />}
          <span className="flex-1">
            <span className="block text-[15px] font-semibold text-ink">{scanLoading ? 'Reading your receipt…' : 'Scan a receipt'}</span>
            <span className="block text-xs text-ink-3">We fill in the amount for you</span>
          </span>
        </button>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="expense-desc" className="v-field-label">
              What did you spend on?
            </label>
            <input
              id="expense-desc" autoFocus type="text" placeholder="Zomato, Netflix, Swiggy..."
              value={form.desc}
              onChange={e => setForm({ ...form, desc: e.target.value })}
              className="v-input"
              required />
          </div>
          <div>
            <label htmlFor="expense-amount" className="v-field-label">
              Amount
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-2 font-semibold text-base">{'\u20b9'}</span>
              <input
                id="expense-amount" type="number" placeholder="0" value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                className="v-input pl-8 font-mono-finance"
                min="1" step="0.01" required />
            </div>
          </div>
          <div>
            <p className="v-field-label" id="expense-category-label">
              Category
            </p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby="expense-category-label">
              {CATEGORIES.map(cat => (
                <button key={cat} type="button"
                  onClick={() => setForm({ ...form, category: cat })}
                  aria-pressed={form.category === cat}
                  className={`v-press min-h-[40px] px-3 rounded-lg text-sm font-semibold transition-colors ${
                    form.category === cat
                      ? 'bg-ink text-bg'
                      : 'bg-surface-2 text-ink-2'
                  }`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>
          {error && <p role="alert" className="v-error">{error}</p>}
          <button type="submit" disabled={loading}
            className="v-press v-btn-primary w-full disabled:cursor-wait">
            {loading
              ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              : <><Check className="w-4 h-4" /> Add expense</>}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ─── UPI TOAST ────────────────────────────────────────────────
// Copy that matches what actually happened. The native parser classifies
// each notification, so money received must never be announced as spending.
const PAYMENT_COPY = {
  EXPENSE: { title: 'Payment detected', action: 'Log it', verb: 'spent' },
  INCOME: { title: 'Money received', action: 'Log it', verb: 'received' },
  REFUND: { title: 'Refund received', action: 'Log it', verb: 'refunded' },
};

function PaymentToast({ payment, queued, onAdd, onDismiss, saving }) {
  const copy = PAYMENT_COPY[payment.kind] || PAYMENT_COPY.EXPENSE;
  const uncertain = payment.needsConfirmation;
  const [amount, setAmount] = useState(String(payment.amount));
  const isExpense = payment.kind === 'EXPENSE';
  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= 10000000;
  const when = new Date(payment.timestamp);

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ type: 'tween', duration: 0.2, ease: 'easeOut' }}
      className="fixed top-[calc(1rem+env(safe-area-inset-top))] inset-x-4 z-[300] max-w-sm mx-auto
                 bg-surface-2 rounded-2xl p-4 shadow-[var(--v-shadow-pop)]"
      role="dialog"
      aria-label={copy.title}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-surface-3 text-ink-2 flex items-center justify-center shrink-0 mt-0.5">
          <Zap className="w-[18px] h-[18px]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-zinc-100">
            {uncertain ? `${copy.title}: please check` : copy.title}
            {queued > 1 && <span className="ml-2 text-[11px] font-semibold text-zinc-500">1 of {queued}</span>}
          </p>
          <p className="text-xs text-zinc-400 mt-0.5 truncate">
            {payment.merchant && payment.merchant !== 'Unknown' ? payment.merchant : 'Unknown payee'}
            {payment.app ? ` · ${payment.app}` : ''} · {when.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
          </p>
          {isExpense ? (
            <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
              Amount
              <span className="relative flex-1">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500">{'\u20b9'}</span>
                <input
                  type="number" inputMode="decimal" min="0.01" step="0.01" value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-lg border border-transparent bg-surface-3 py-1.5 pl-6 pr-2 font-mono text-ink outline-none focus:border-accent"
                />
              </span>
            </label>
          ) : (
            <p className="text-xs text-zinc-400 mt-1">{'\u20b9'}{Number(payment.amount).toLocaleString('en-IN')} {copy.verb}. Income isn't tracked yet, so this won't be added.</p>
          )}
          {uncertain && isExpense && (
            <p className="text-[11px] text-amber-400/90 mt-1">We couldn't read this one confidently. Check the amount before saving.</p>
          )}
        </div>
        <button onClick={onDismiss} aria-label="Dismiss" className="text-zinc-600 hover:text-zinc-400 p-1 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex gap-2 mt-3">
        {isExpense && (
          <button type="button" onClick={() => valid && onAdd(parsed)} disabled={!valid || saving}
            className="v-press v-btn-primary min-h-[44px] flex-1 px-3 text-sm">
            {saving ? 'Saving…' : 'Add expense'}
          </button>
        )}
        <button type="button" onClick={onDismiss}
          className="v-press flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-surface-3 px-3 text-sm font-semibold text-ink">
          {isExpense ? 'Not an expense' : 'OK'}
        </button>
      </div>
    </motion.div>
  );
}

// ─── GREETING ─────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ═══════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════
export default function Dashboard() {
  const { user, session } = useAuth();
  const { expenses, loading, error: expensesError, refetch: refetchExpenses, totalSpent, addExpense, addScannedExpense } = useExpenses();
  // The expenses could not be loaded: figures built from an empty list ("₹0
  // spent") would be false, so those cards stay as placeholders. The main
  // card shows the message and the retry.
  const expensesUnavailable = Boolean(expensesError) && expenses.length === 0;

  const [showAddModal, setShowAddModal]     = useState(false);
  const [addLoading, setAddLoading]         = useState(false);
  const [scanLoading, setScanLoading]       = useState(false);
  const [safeToSpend, setSafeToSpend]       = useState(null);
  const [safeError, setSafeError]           = useState(false);
  const [reloadKey, setReloadKey]           = useState(0);
  const [burnRate, setBurnRate]             = useState(null);
  const [moneyStreak, setMoneyStreak]       = useState(null);
  const [scanToast, setScanToast]           = useState(null); // { type: 'success'|'error', message: string }
  const fileInputRef = useRef(null);


  // ── UPI Notifications ──────────────────────────────────────
  // Android Notification Access is only ever requested from an explicit tap on
  // "Enable". The dashboard must never send the user to Settings on its own.
  const {
    isSupported, permissionChecked, pending, resolvePayment, confirmPayment, openAppSettings,
  } = usePaymentNotifications();
  const tracking = usePaymentTracking();
  const [showAccessSheet, setShowAccessSheet] = useState(false);
  const pendingPayment = pending[0] || null;
  const [savingPayment, setSavingPayment] = useState(false);

  // ── Fetch v1 feature data ──────────────────────────────────
  // Server-calculated cards depend on this month's expenses. They were fetched
  // once per sign-in, so after adding an expense the budget card changed but
  // Safe-to-Spend and the forecast kept showing the old figures. Re-fetch
  // whenever the loaded expenses change.
  const token = session?.access_token;
  const expensesVersion = loading ? null : `${expenses.length}:${Math.round(totalSpent * 100)}`;
  useEffect(() => {
    if (!token || expensesVersion === null) return undefined;
    let cancelled = false;
    const headers = { Authorization: `Bearer ${token}` };
    const load = (path, apply, onFail) => apiFetch(`${API_URL}${path}`, { headers })
      .then((response) => {
        if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
        return response.json();
      })
      .then((d) => { if (!cancelled && d.success) apply(d); })
      .catch(() => { if (!cancelled && onFail) onFail(); });

    setSafeError(false);
    load('/safe-to-spend', (d) => setSafeToSpend(d.safeToSpend), () => setSafeError(true));
    load('/burn-rate', (d) => setBurnRate(d.burnRate));
    load('/money-streak', (d) => setMoneyStreak(d.moneyStreak));
    return () => { cancelled = true; };
  }, [token, expensesVersion, reloadKey]);

  // After marking a no-spend day, refresh the streak on its own.
  const reloadMoneyStreak = useCallback(async () => {
    if (!token) return;
    const response = await apiFetch(`${API_URL}/money-streak`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await response.json().catch(() => ({}));
    if (response.ok && d.success) setMoneyStreak(d.moneyStreak);
  }, [token]);

  // Record the streak check-in for viewing Safe-to-Spend, once per session.
  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/streaks/check-in`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity: 'check_safe_to_spend' }),
    }).catch(() => {});
  }, [token]);

  // ── Derived Values ─────────────────────────────────────────
  const navigate = useNavigate();
  const monthlyBudget = user?.monthly_budget || 5000;

  // This month's spending by category, from the user's own rows (display only).
  const { categories, foodThisMonth, recent } = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const rows = expenses.filter((e) => new Date(e.occurred_at || e.created_at) >= monthStart);
    const byCat = {};
    for (const e of rows) byCat[e.category || 'Other'] = (byCat[e.category || 'Other'] || 0) + (Number(e.amount) || 0);
    const total = Object.values(byCat).reduce((a, b) => a + b, 0);
    return {
      categories: Object.entries(byCat).map(([category, amount]) => ({ category, amount, share: total ? Math.round((amount / total) * 100) : 0 }))
        .sort((a, b) => b.amount - a.amount),
      foodThisMonth: byCat.Food || 0,
      // The newest three, worded the way Activity words them.
      recent: expenses.slice(0, 3).map((e) => ({
        id: e.id, title: expenseTitle(e), category: e.category || 'Other', amount: Number(e.amount) || 0,
        meta: `${expenseMeta(e)} · ${new Date(e.occurred_at || e.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
      })),
    };
  }, [expenses]);

  // ── Handlers ───────────────────────────────────────────────
  const handleAddExpense = async (amount, category, description) => {
    setAddLoading(true);
    try { return await addExpense(amount, category, description); }
    finally { setAddLoading(false); }
  };

  // The toast goes away by itself; an error stays long enough to be read.
  useEffect(() => {
    if (!scanToast) return;
    const t = setTimeout(() => setScanToast(null), scanToast.type === 'error' ? 8000 : 5000);
    return () => clearTimeout(t);
  }, [scanToast]);

  const handleScanFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanLoading(true);
    try {
      // Shrunk first: a full-size camera photo is larger than the server accepts.
      const imageBase64 = await prepareReceiptImage(file);
      const result = await addScannedExpense({ imageBase64 });
      if (result?.success) {
        setShowAddModal(false);
        // Says what was saved, so a wrong amount is noticed (it can be edited in Activity).
        const amount = Number(result.expense?.amount);
        const from = String(result.expense?.description || '').replace(/^Receipt from /, '');
        setScanToast({
          type: 'success',
          message: Number.isFinite(amount)
            ? `Added \u20b9${amount.toLocaleString('en-IN')}${from && from !== 'Unknown' ? ` from ${from}` : ''}. Edit it in Activity if it's wrong.`
            : 'Receipt scanned and added.',
        });
      } else {
        setScanToast({ type: 'error', message: result?.message || "We couldn't read that receipt. Try a clearer photo, or add it manually." });
      }
    } catch (err) {
      // prepareReceiptImage's own messages are written for people; anything else is generic.
      const known = err?.code === 'IMAGE_TOO_LARGE' || err?.code === 'IMAGE_UNREADABLE';
      setScanToast({ type: 'error', message: known ? err.message : "We couldn't scan that. Please try again." });
    } finally {
      setScanLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [addScannedExpense]);

  const handleLogUpiPayment = async (confirmedAmount) => {
    if (!pendingPayment || savingPayment) return;
    const payment = pendingPayment;

    // Income and refunds are never recorded as spending.
    if (payment.kind !== 'EXPENSE') {
      await resolvePayment(payment.fingerprint);
      return;
    }

    // Saved with the phone's id for this payment, so a retry cannot add it twice.
    setSavingPayment(true);
    const result = await confirmPayment(payment.fingerprint, confirmedAmount);
    setSavingPayment(false);

    if (!result.success) {
      // Kept on the phone so the user can retry.
      setScanToast({ type: 'error', message: result.message || 'Could not save that payment.' });
    }
  };

  const firstName = String(user?.full_name || user?.name || '').trim().split(/\s+/)[0] || 'there';
  const initials = String(user?.full_name || user?.name || 'V').split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  // ── RENDER ─────────────────────────────────────────────────
  return (
    <div className="pb-4 text-ink">

      {/* UPI Toast */}
      <AnimatePresence>
        {pendingPayment && (
          <PaymentToast
            key={pendingPayment.fingerprint}
            payment={pendingPayment}
            queued={pending.length}
            saving={savingPayment}
            onAdd={handleLogUpiPayment}
            onDismiss={() => resolvePayment(pendingPayment.fingerprint)}
          />
        )}
      </AnimatePresence>

      {/* Scan Toast */}
      <AnimatePresence>
        {scanToast && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ type: 'tween', duration: 0.2, ease: 'easeOut' }}
            role="status"
            className="fixed top-[calc(1rem+env(safe-area-inset-top))] inset-x-4 z-[300] max-w-sm mx-auto
                       rounded-2xl bg-surface-2 p-4 shadow-[var(--v-shadow-pop)]"
          >
            {/* The icon carries the outcome; the message stays in plain ink. */}
            <div className="flex items-center gap-3">
              {scanToast.type === 'success'
                ? <CheckCircle className="w-5 h-5 shrink-0 text-accent" aria-hidden="true" />
                : <AlertCircle className="w-5 h-5 shrink-0 text-danger" aria-hidden="true" />}
              <p className="text-sm font-semibold text-ink">{scanToast.message}</p>
              <button type="button" onClick={() => setScanToast(null)} aria-label="Dismiss" className="ml-auto text-ink-3 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bank SMS: the explanation, then Android's permission dialog on a tap */}
      <AnimatePresence>
        {showAccessSheet && (
          <SmsAccessSheet
            smsGranted={tracking.smsGranted}
            smsPermission={tracking.smsPermission}
            requestSms={tracking.requestSms}
            openAppSettings={openAppSettings}
            onClose={() => setShowAccessSheet(false)}
          />
        )}
      </AnimatePresence>

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <AddExpenseModal
            onClose={() => setShowAddModal(false)}
            onAdd={handleAddExpense}
            loading={addLoading}
            onScan={() => fileInputRef.current?.click()}
            scanLoading={scanLoading}
          />
        )}
      </AnimatePresence>

      {/* ─── MAIN CONTENT ─── */}
      <div className="mx-auto max-w-lg space-y-6">
        {/* HEADER */}
        <header className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm text-ink-2">{getGreeting()}</p>
            <h1 className="truncate text-xl font-bold tracking-tight text-ink">{firstName}</h1>
          </div>
          <button type="button" onClick={() => navigate('/settings')} aria-label="Profile"
            className="v-press flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold text-ink">
            {initials}
          </button>
        </header>

        {/* Tracking was turned on under "ask before adding": ask once how to continue. */}
        {tracking.needsChoice && (
          <section className="v-block p-4" aria-labelledby="auto-add-title">
            <h2 id="auto-add-title" className="text-[15px] font-semibold text-ink">Add detected payments automatically?</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-2">
              Vittova can now add clear payments to your expenses by itself, even when the app is closed.
              Unclear ones still wait for you. You can change this in Profile.
            </p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => tracking.setMode('auto')} className="v-press v-btn-primary min-h-[44px] px-4 text-sm">Add automatically</button>
              <button type="button" onClick={() => tracking.setMode('review')} className="v-press v-btn-secondary">Keep asking me</button>
            </div>
          </section>
        )}

        {/* Automatic tracking from bank SMS (Android) */}
        <PermissionBanner
          isSupported={isSupported}
          smsGranted={tracking.smsGranted}
          permissionChecked={permissionChecked}
          onEnable={() => setShowAccessSheet(true)}
        />

        {/* 1. Where do I stand? The one figure, then per day and spent so far. */}
        <MoneyStatus safe={safeToSpend} error={safeError} onRetry={() => { setReloadKey((k) => k + 1); refetchExpenses(); }}
          loading={loading || expensesUnavailable} totalSpent={totalSpent} monthlyBudget={monthlyBudget} burn={burnRate} />

        {/* 2. Can I afford this? — the main action */}
        <AffordItCard />

        {/* 3. The one thing that needs attention, if there is one */}
        <InsightRow burn={burnRate} foodThisMonth={foodThisMonth} />

        {/* 4. Still to come this month */}
        <MonthRows safe={safeToSpend} categories={expensesUnavailable ? [] : categories} />

        {/* 5. What just happened */}
        <RecentActivity items={expensesUnavailable ? [] : recent} loading={loading} />

        {/* 6. Everything else, one row each */}
        <section className="v-rows border-t border-line" aria-label="More">
          <MoneyStreakCard streak={moneyStreak} onChanged={reloadMoneyStreak} />
          <AskRow />
        </section>

        <input type="file" accept="image/*" capture="environment" className="hidden" ref={fileInputRef} onChange={handleScanFile} />
        {/* Room for the + button so it never covers the last row */}
        <div className="h-16" />
      </div>

      {/* Add expense */}
      <button
        type="button"
        onClick={() => setShowAddModal(true)}
        className="v-press fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-[100] flex h-14 w-14 items-center justify-center rounded-full bg-ink text-bg shadow-[var(--v-shadow-pop)]"
        aria-label="Add expense"
      >
        <Plus className="h-6 w-6" strokeWidth={2.25} />
      </button>

    </div>
  );
}
