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
import PermissionBanner from '../components/PermissionBanner';
import NotificationAccessSheet from '../components/NotificationAccessSheet';
import AffordItCard from '../components/AffordItCard';
import MoneyStreakCard from '../components/MoneyStreakCard';
import { MoneyStatus, MoneyHealth, InsightCard } from '../components/HomeCards';
import { API_URL, apiFetch } from '../lib/apiConfig';

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
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-6 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-2xl z-10"
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
      >
        <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-5 sm:hidden" />
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-zinc-100">Add expense</h2>
          <motion.button onClick={onClose} whileTap={{ scale: 0.9 }}
            className="p-2 rounded-xl bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors">
            <X className="w-4 h-4" />
          </motion.button>
        </div>
        <button type="button" onClick={onScan} disabled={scanLoading}
          className="v-press mb-4 flex min-h-[48px] w-full items-center gap-3 rounded-2xl border border-white/10 bg-zinc-800/70 px-4 text-left disabled:opacity-60">
          {scanLoading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-lime-400 border-t-transparent" /> : <Camera className="h-5 w-5 text-lime-300" aria-hidden="true" />}
          <span className="flex-1">
            <span className="block text-sm font-bold text-zinc-100">{scanLoading ? 'Reading your receipt…' : 'Scan a receipt'}</span>
            <span className="block text-xs text-zinc-500">We fill in the amount for you</span>
          </span>
        </button>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-1.5 block">
              What did you spend on?
            </label>
            <input
              autoFocus type="text" placeholder="Zomato, Netflix, Swiggy..."
              value={form.desc}
              onChange={e => setForm({ ...form, desc: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-sm
                         text-zinc-100 placeholder:text-zinc-600 outline-none
                         focus:border-lime-500/60 focus:ring-2 focus:ring-lime-500/15 transition-all"
              required />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-1.5 block">
              Amount
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-sm">{'\u20b9'}</span>
              <input
                type="number" placeholder="0" value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl pl-8 pr-4 py-3 text-sm
                           text-zinc-100 placeholder:text-zinc-600 outline-none font-mono-finance
                           focus:border-lime-500/60 focus:ring-2 focus:ring-lime-500/15 transition-all"
                min="1" step="0.01" required />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2 block">
              Category
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <motion.button key={cat} type="button" whileTap={{ scale: 0.92 }}
                  onClick={() => setForm({ ...form, category: cat })}
                  aria-pressed={form.category === cat}
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                    form.category === cat
                      ? 'bg-lime-400 text-black border-lime-400 shadow-[0_0_10px_rgba(57,255,20,0.3)]'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600'
                  }`}>
                  {cat}
                </motion.button>
              ))}
            </div>
          </div>
          {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
          <motion.button type="submit" disabled={loading}
            whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.01 }}
            className="w-full bg-lime-400 hover:bg-lime-300 text-black font-black py-3.5 rounded-2xl
                       text-sm tracking-wide transition-all shadow-[0_0_20px_rgba(57,255,20,0.25)]
                       disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-2">
            {loading
              ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              : <><Check className="w-4 h-4" /> Add Expense</>}
          </motion.button>
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
      initial={{ opacity: 0, y: -60, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -40, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
      className="fixed top-[calc(1rem+env(safe-area-inset-top))] inset-x-4 z-[300] max-w-sm mx-auto
                 bg-zinc-900 border border-lime-500/30 rounded-2xl p-4
                 shadow-[0_0_30px_rgba(57,255,20,0.2)] backdrop-blur-xl"
      role="dialog"
      aria-label={copy.title}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-lime-500/15 flex items-center justify-center shrink-0 mt-0.5">
          <Zap className="w-5 h-5 text-lime-400" />
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
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-1.5 pl-6 pr-2 font-mono text-zinc-100 outline-none focus:border-lime-500/60"
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
          <motion.button whileTap={{ scale: 0.94 }} onClick={() => valid && onAdd(parsed)} disabled={!valid || saving}
            className="flex-1 bg-lime-400 text-black text-xs font-black py-2 rounded-xl hover:bg-lime-300 transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Add expense'}
          </motion.button>
        )}
        <motion.button whileTap={{ scale: 0.94 }} onClick={onDismiss}
          className="flex-1 bg-zinc-800 text-zinc-400 text-xs font-bold py-2 rounded-xl hover:bg-zinc-700 transition-colors">
          {isExpense ? 'Not an expense' : 'OK'}
        </motion.button>
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
  const { expenses, loading, totalSpent, addExpense, addScannedExpense } = useExpenses();

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
    isSupported, permissionGranted, permissionChecked, pending, resolvePayment, openPermissionSettings,
    restrictedSettingsLikely, openAppSettings, checkPermissionNow,
  } = usePaymentNotifications();
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
  const { categories, foodThisMonth, lastExpense } = useMemo(() => {
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
      lastExpense: expenses[0] ? { description: expenses[0].description, amount: Number(expenses[0].amount) } : null,
    };
  }, [expenses]);

  // ── Handlers ───────────────────────────────────────────────
  const handleAddExpense = async (amount, category, description) => {
    setAddLoading(true);
    try { return await addExpense(amount, category, description); }
    finally { setAddLoading(false); }
  };

  // Auto-dismiss scan toast after 3 seconds
  useEffect(() => {
    if (!scanToast) return;
    const t = setTimeout(() => setScanToast(null), 3000);
    return () => clearTimeout(t);
  }, [scanToast]);

  const handleScanFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanLoading(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      try {
        const result = await addScannedExpense({ scannedTotal: 0, merchantName: 'Receipt Scan', imageBase64: reader.result });
        if (result?.success) {
          setShowAddModal(false);
          setScanToast({ type: 'success', message: 'Receipt scanned and added.' });
        } else {
          setScanToast({ type: 'error', message: result?.message || 'Failed to scan bill.' });
        }
      } catch (err) {
        console.error('Scan failed:', err);
        setScanToast({ type: 'error', message: 'Scan failed. Please try again.' });
      } finally {
        setScanLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
  }, [addScannedExpense]);

  const handleLogUpiPayment = async (confirmedAmount) => {
    if (!pendingPayment || savingPayment) return;
    const payment = pendingPayment;

    // Income and refunds are never recorded as spending.
    if (payment.kind !== 'EXPENSE') {
      await resolvePayment(payment.fingerprint);
      return;
    }

    const merchant = payment.merchant && payment.merchant !== 'Unknown' ? payment.merchant : 'UPI payment';
    setSavingPayment(true);
    const result = await addExpense(confirmedAmount, 'Other', merchant.slice(0, 200), {
      source: 'upi_auto',
      occurredAt: new Date(payment.timestamp).toISOString(),
    });
    setSavingPayment(false);

    if (result.success) {
      await resolvePayment(payment.fingerprint);
    } else {
      // Keep it in the queue so the user can retry.
      setScanToast({ type: 'error', message: result.message || 'Could not save that payment.' });
    }
  };

  const firstName = String(user?.full_name || user?.name || '').trim().split(/\s+/)[0] || 'there';
  const initials = String(user?.full_name || user?.name || 'V').split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

  // ── RENDER ─────────────────────────────────────────────────
  return (
    <div className="bg-black pb-4 text-white">

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
            initial={{ opacity: 0, y: -60, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -40, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            className={`fixed top-[calc(1rem+env(safe-area-inset-top))] inset-x-4 z-[300] max-w-sm mx-auto
                       rounded-2xl p-4 shadow-xl backdrop-blur-xl border ${
                         scanToast.type === 'success'
                           ? 'bg-zinc-900 border-lime-500/30 shadow-[0_0_30px_rgba(57,255,20,0.15)]'
                           : 'bg-zinc-900 border-red-500/30 shadow-[0_0_30px_rgba(239,68,68,0.15)]'
                       }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                scanToast.type === 'success' ? 'bg-lime-500/15' : 'bg-red-500/15'
              }`}>
                {scanToast.type === 'success'
                  ? <CheckCircle className="w-5 h-5 text-lime-400" />
                  : <AlertCircle className="w-5 h-5 text-red-400" />}
              </div>
              <p className={`text-sm font-bold ${
                scanToast.type === 'success' ? 'text-lime-400' : 'text-red-400'
              }`}>{scanToast.message}</p>
              <button onClick={() => setScanToast(null)} className="ml-auto text-zinc-600 hover:text-zinc-400 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notification Access explanation and re-check */}
      <AnimatePresence>
        {showAccessSheet && (
          <NotificationAccessSheet
            permissionGranted={permissionGranted}
            restrictedSettingsLikely={restrictedSettingsLikely}
            checkPermissionNow={checkPermissionNow}
            openPermissionSettings={openPermissionSettings}
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
      <div className="mx-auto max-w-lg space-y-3">
        {/* HEADER */}
        <header className="flex items-center justify-between pb-1">
          <div className="min-w-0">
            <p className="text-sm text-zinc-500">{getGreeting()}</p>
            <h1 className="truncate text-2xl font-black tracking-tight text-white">{firstName}</h1>
          </div>
          <button type="button" onClick={() => navigate('/settings')} aria-label="Profile"
            className="v-press flex h-11 w-11 items-center justify-center rounded-full bg-lime-400 text-sm font-black text-black">
            {initials}
          </button>
        </header>

        {/* Payment-notification access (Android) */}
        <PermissionBanner
          isSupported={isSupported}
          permissionGranted={permissionGranted}
          permissionChecked={permissionChecked}
          onEnable={() => setShowAccessSheet(true)}
        />

        {/* 1. How much can I spend? */}
        <MoneyStatus safe={safeToSpend} error={safeError} onRetry={() => setReloadKey((k) => k + 1)} />

        {/* 2. Can I afford this? — the main action */}
        <AffordItCard />

        {/* 3. What needs attention? */}
        <MoneyHealth loading={loading} totalSpent={totalSpent} monthlyBudget={monthlyBudget}
          safe={safeToSpend} burn={burnRate} categories={categories} lastExpense={lastExpense} />

        {/* 4. Habit */}
        <MoneyStreakCard streak={moneyStreak} onChanged={reloadMoneyStreak} compact />

        {/* One insight at most, plus Ask Vittova */}
        <InsightCard burn={burnRate} foodThisMonth={foodThisMonth} />

        <input type="file" accept="image/*" capture="environment" className="hidden" ref={fileInputRef} onChange={handleScanFile} />
        {/* Room for the + button so it never covers the last card */}
        <div className="h-24" />
      </div>

      {/* Add expense */}
      <button
        type="button"
        onClick={() => setShowAddModal(true)}
        className="v-press fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-[100] flex h-14 w-14 items-center justify-center rounded-full bg-lime-400 text-black shadow-[0_6px_20px_rgba(0,0,0,0.45)]"
        aria-label="Add expense"
      >
        <Plus className="h-7 w-7" strokeWidth={3} />
      </button>

    </div>
  );
}
