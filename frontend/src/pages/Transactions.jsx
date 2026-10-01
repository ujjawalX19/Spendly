/**
 * Transactions.jsx — the full expense history, searchable and editable.
 *
 * The API has supported search, category and date filters, amount ranges,
 * four sort orders and pagination for a while; nothing used it. Without this
 * screen a user could not answer "how much did I spend on food last month",
 * which is the single most common thing people open an expense app to do.
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, SlidersHorizontal, X, Trash2, Loader2,
  ArrowDownUp, Receipt, Check,
} from 'lucide-react';

import { useNavigate } from 'react-router-dom';
import { useTransactionSearch, EMPTY_FILTERS } from '../hooks/useTransactionSearch';
import { useExpenses } from '../hooks/useExpenses';
import { usePaymentTracking } from '../contexts/PaymentTrackingContext';
import CategoryIcon from '../components/CategoryIcon';
import { expenseMeta, expenseTitle, groupByDay } from '../lib/expenseDisplay';

const CATEGORIES = ['Food', 'Transport', 'Shopping', 'Recharge', 'Entertainment', 'Rent', 'Other'];

const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'highest', label: 'Highest' },
  { value: 'lowest', label: 'Lowest' },
];

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** 'Today' / 'Yesterday' / '15 Apr' — dates people actually recognise. */
function dayLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

/** Date input wants YYYY-MM-DD in local time, which toISOString() does not give. */
function toDateInput(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function Transactions() {
  const s = useTransactionSearch();
  const { editExpense, deleteExpense } = useExpenses();
  const tracking = usePaymentTracking();
  const navigate = useNavigate();
  const plural = (n) => `${n} detected payment${n === 1 ? '' : 's'}`;

  const [showFilters, setShowFilters] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState(null);

  const flash = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // One block per day, with the day's total: a long list stays scannable.
  const days = useMemo(() => groupByDay(s.rows, dayLabel), [s.rows]);

  const pageTotal = useMemo(
    () => s.rows.reduce((sum, r) => sum + Number(r.amount || 0), 0),
    [s.rows]
  );

  const handleSave = async (id, updates) => {
    const result = await editExpense(id, updates);
    if (result.success) {
      s.replaceRow(result.expense);
      setEditing(null);
      flash('Expense updated.');
    } else {
      flash(result.message, 'error');
    }
  };

  const handleDelete = async (id) => {
    const result = await deleteExpense(id);
    if (result.success) {
      s.removeRow(id);
      setConfirmDelete(null);
      flash('Expense deleted.');
    } else {
      flash(result.message, 'error');
    }
  };

  return (
    <div className="pb-8">
      <header className="mb-5">
        <h1 className="text-2xl font-black tracking-tight text-white">Activity</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {s.loading
            ? 'Loading…'
            : `${s.total.toLocaleString('en-IN')} ${s.total === 1 ? 'expense' : 'expenses'}${s.isFiltered ? ' matching' : ''} · ${rupees(pageTotal)} shown`}
        </p>
      </header>

      {/* Payments captured while the app was closed that are not in the list yet */}
      {tracking.supported && (tracking.waiting > 0 || tracking.reviewCount > 0) && (
        <div role="status" className="mb-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-xs text-zinc-300">
          <span className="flex-1">
            {tracking.waiting > 0 && `${plural(tracking.waiting)} waiting to upload. `}
            {tracking.reviewCount > 0 && `${plural(tracking.reviewCount)} need${tracking.reviewCount === 1 ? 's' : ''} your review.`}
          </span>
          {tracking.waiting > 0 && (
            <button type="button" onClick={() => tracking.syncNow()} className="v-press min-h-[40px] shrink-0 font-bold text-lime-300">Retry</button>
          )}
          {tracking.reviewCount > 0 && (
            <button type="button" onClick={() => navigate('/dash')} className="v-press min-h-[40px] shrink-0 font-bold text-lime-300">Review</button>
          )}
        </div>
      )}

      {/* Search + filter toggle */}
      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={s.filters.q}
            onChange={(e) => s.setFilter('q', e.target.value)}
            placeholder="Search descriptions…"
            aria-label="Search transactions"
            className="w-full rounded-2xl border border-white/10 bg-[#181818] py-3 pl-10 pr-3 text-sm text-white
                       placeholder:text-zinc-600 focus:border-lime-400/40 focus:outline-none focus:ring-2 focus:ring-lime-400/20"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters(v => !v)}
          aria-expanded={showFilters}
          aria-label="Filters"
          className={`flex min-h-12 min-w-12 items-center justify-center rounded-2xl border px-4 transition
            ${s.isFiltered
              ? 'border-lime-400/40 bg-lime-400/15 text-lime-300'
              : 'border-white/10 bg-[#181818] text-zinc-400 hover:text-white'}`}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mb-4 space-y-4 rounded-2xl border border-white/10 bg-[#141414] p-4">
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Category</p>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(c => {
                    const active = s.filters.category === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => s.setFilter('category', active ? '' : c)}
                        className={`rounded-full px-3 py-2 text-xs font-bold transition
                          ${active ? 'bg-lime-400 text-black' : 'bg-white/[.06] text-zinc-400 hover:text-white'}`}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">From</span>
                  <input
                    type="date" value={s.filters.from}
                    onChange={(e) => s.setFilter('from', e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#181818] px-3 py-2.5 text-sm text-white focus:border-lime-400/40 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">To</span>
                  <input
                    type="date" value={s.filters.to}
                    onChange={(e) => s.setFilter('to', e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#181818] px-3 py-2.5 text-sm text-white focus:border-lime-400/40 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Min ₹</span>
                  <input
                    type="number" inputMode="numeric" min="0" value={s.filters.minAmount}
                    onChange={(e) => s.setFilter('minAmount', e.target.value)}
                    placeholder="0"
                    className="w-full rounded-xl border border-white/10 bg-[#181818] px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-lime-400/40 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Max ₹</span>
                  <input
                    type="number" inputMode="numeric" min="0" value={s.filters.maxAmount}
                    onChange={(e) => s.setFilter('maxAmount', e.target.value)}
                    placeholder="Any"
                    className="w-full rounded-xl border border-white/10 bg-[#181818] px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-lime-400/40 focus:outline-none"
                  />
                </label>
              </div>

              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  <ArrowDownUp className="h-3 w-3" /> Sort
                </p>
                <div className="flex flex-wrap gap-2">
                  {SORTS.map(o => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => s.setFilter('sort', o.value)}
                      className={`rounded-full px-3 py-2 text-xs font-bold transition
                        ${s.filters.sort === o.value ? 'bg-lime-400 text-black' : 'bg-white/[.06] text-zinc-400 hover:text-white'}`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {s.isFiltered && (
                <button
                  type="button"
                  onClick={s.resetFilters}
                  className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" /> Clear all filters
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      {s.error ? (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">
          <p>{s.error}</p>
          <button type="button" onClick={s.refresh} className="mt-3 rounded-xl bg-red-500/20 px-4 py-2 text-xs font-bold text-red-100">
            Try again
          </button>
        </div>
      ) : s.loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading transactions">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[68px] animate-pulse rounded-2xl bg-white/[.04]" />
          ))}
        </div>
      ) : s.rows.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#141414] px-6 py-12 text-center">
          <Receipt className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
          {s.isFiltered ? (
            <>
              <p className="font-bold text-zinc-300">Nothing matches those filters</p>
              <p className="mt-1 text-sm text-zinc-500">Try widening the date range or clearing the category.</p>
              <button type="button" onClick={s.resetFilters} className="mt-4 rounded-xl bg-lime-400 px-4 py-2.5 text-xs font-black text-black">
                Clear filters
              </button>
            </>
          ) : (
            <>
              <p className="font-bold text-zinc-300">No expenses yet</p>
              <p className="mt-1 text-sm text-zinc-500">
                Add your first expense from Home, or allow bank SMS in Profile and Vittova will track your payments for you.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-5">
            {days.map((day) => (
              <section key={`${day.label}-${day.rows[0].id}`} aria-label={day.label}>
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">{day.label}</h2>
                  <span className="font-mono-finance text-xs font-semibold text-zinc-500">{rupees(day.total)}</span>
                </div>
                {/* One container per day; a row is one tap target that opens the expense. */}
                <ul className="divide-y divide-white/[.06] overflow-hidden rounded-2xl border border-white/[.06] bg-[#141414]">
                  {day.rows.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => setEditing(row)}
                        aria-label={`${expenseTitle(row)}, ${rupees(row.amount)}. Edit or delete`}
                        className="flex min-h-[64px] w-full items-center gap-3 px-3.5 py-3 text-left transition active:bg-white/[.04] hover:bg-white/[.03]"
                      >
                        <CategoryIcon category={row.category} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold text-zinc-100">{expenseTitle(row)}</span>
                          <span className="mt-0.5 block truncate text-xs text-zinc-500">{expenseMeta(row)}</span>
                        </span>
                        <span className="font-mono-finance shrink-0 text-[15px] font-bold text-white">{rupees(row.amount)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {s.hasMore && (
            <button
              type="button"
              onClick={s.loadMore}
              disabled={s.loadingMore}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#181818] py-3.5 text-sm font-bold text-zinc-300 transition hover:text-white disabled:opacity-60"
            >
              {s.loadingMore ? <><Loader2 className="h-4 w-4 animate-spin" /> Loading…</> : 'Load more'}
            </button>
          )}
        </>
      )}

      <AnimatePresence>
        {editing && (
          <EditSheet
            expense={editing}
            onCancel={() => setEditing(null)}
            onSave={handleSave}
            onDelete={() => { const row = editing; setEditing(null); setConfirmDelete(row); }}
          />
        )}
        {confirmDelete && (
          <ConfirmDelete
            expense={confirmDelete}
            onCancel={() => setConfirmDelete(null)}
            onConfirm={() => handleDelete(confirmDelete.id)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={`fixed inset-x-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-[300] mx-auto max-w-sm rounded-2xl border p-3.5 text-sm font-semibold backdrop-blur-xl md:bottom-8
              ${toast.type === 'error'
                ? 'border-red-500/30 bg-red-500/15 text-red-100'
                : 'border-lime-500/30 bg-[#181818] text-lime-200'}`}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EditSheet({ expense, onCancel, onSave, onDelete }) {
  const [amount, setAmount] = useState(String(expense.amount ?? ''));
  const [category, setCategory] = useState(expense.category || 'Other');
  const [description, setDescription] = useState(expense.description || '');
  const [date, setDate] = useState(toDateInput(expense.occurred_at || expense.created_at));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setFormError('Enter an amount greater than zero.');
      return;
    }
    if (description.length > 200) {
      setFormError('Description is too long (200 characters max).');
      return;
    }

    // Send only what actually changed, so an untouched field is never
    // rewritten and the server does not see a no-op update.
    const updates = {};
    if (value !== Number(expense.amount)) updates.amount = value;
    if (category !== expense.category) updates.category = category;
    if (description !== (expense.description || '')) updates.description = description;
    if (date && date !== toDateInput(expense.occurred_at || expense.created_at)) updates.occurred_at = date;

    if (Object.keys(updates).length === 0) { onCancel(); return; }

    setSaving(true);
    setFormError('');
    await onSave(expense.id, updates);
    setSaving(false);
  };

  return (
    <motion.div
      className="fixed inset-0 z-[400] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onCancel}
      role="dialog" aria-modal="true" aria-label="Edit expense"
    >
      <motion.form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="w-full max-w-md space-y-4 rounded-t-3xl border border-white/10 bg-[#141414] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-3xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-white">Edit expense</h2>
          <button type="button" onClick={onCancel} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-500 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Amount</span>
          <input
            type="number" inputMode="decimal" step="0.01" min="0.01" value={amount} autoFocus
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-[#181818] px-3 py-3 text-lg font-black text-white focus:border-lime-400/40 focus:outline-none"
          />
        </label>

        <div>
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Category</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(c => (
              <button
                key={c} type="button" onClick={() => setCategory(c)}
                className={`rounded-full px-3 py-2 text-xs font-bold transition ${category === c ? 'bg-lime-400 text-black' : 'bg-white/[.06] text-zinc-400'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Description</span>
          <input
            type="text" value={description} maxLength={200}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What was it for?"
            className="w-full rounded-xl border border-white/10 bg-[#181818] px-3 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-lime-400/40 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Date</span>
          <input
            type="date" value={date} max={toDateInput(new Date().toISOString())}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-[#181818] px-3 py-3 text-sm text-white focus:border-lime-400/40 focus:outline-none"
          />
        </label>

        <p className="text-[11px] leading-4 text-zinc-500">
          Editing an expense does not change round-up savings or your streak — those were earned when you logged it.
        </p>

        {formError && <p role="alert" className="text-sm font-semibold text-red-400">{formError}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="submit" disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-lime-400 py-3.5 text-sm font-black text-black disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" onClick={onCancel} className="rounded-xl bg-white/[.06] px-5 py-3.5 text-sm font-bold text-zinc-300">
            Cancel
          </button>
        </div>
        <button type="button" onClick={onDelete} disabled={saving}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-red-400 hover:bg-red-500/10 disabled:opacity-50">
          <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete this expense
        </button>
      </motion.form>
    </motion.div>
  );
}

function ConfirmDelete({ expense, onCancel, onConfirm }) {
  const [busy, setBusy] = useState(false);
  return (
    <motion.div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onCancel}
      role="alertdialog" aria-modal="true" aria-label="Confirm delete"
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
        className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#141414] p-5"
      >
        <h2 className="text-lg font-black text-white">Delete this expense?</h2>
        <p className="mt-2 text-sm text-zinc-400">
          {rupees(expense.amount)}{expense.description ? ` · ${expense.description}` : ''}
        </p>
        <p className="mt-1 text-sm text-zinc-500">This cannot be undone.</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 py-3.5 text-sm font-black text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
          </button>
          <button type="button" onClick={onCancel} className="rounded-xl bg-white/[.06] px-5 py-3.5 text-sm font-bold text-zinc-300">
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
