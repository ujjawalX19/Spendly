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
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Activity</h1>
        <p className="mt-0.5 text-sm text-ink-2">
          {s.loading
            ? 'Loading…'
            : `${s.total.toLocaleString('en-IN')} ${s.total === 1 ? 'expense' : 'expenses'}${s.isFiltered ? ' matching' : ''} · ${rupees(pageTotal)} shown`}
        </p>
      </header>

      {/* Payments captured while the app was closed that are not in the list yet */}
      {tracking.supported && (tracking.waiting > 0 || tracking.reviewCount > 0) && (
        <div role="status" className="v-block mb-3 flex items-center gap-3 px-4 py-1.5 text-sm text-ink-soft">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" aria-hidden="true" />
          <span className="flex-1 py-1.5">
            {tracking.waiting > 0 && `${plural(tracking.waiting)} waiting to upload. `}
            {tracking.reviewCount > 0 && `${plural(tracking.reviewCount)} need${tracking.reviewCount === 1 ? 's' : ''} your review.`}
          </span>
          {tracking.waiting > 0 && (
            <button type="button" onClick={() => tracking.syncNow()} className="v-press min-h-[44px] shrink-0 font-semibold text-ink underline">Retry</button>
          )}
          {tracking.reviewCount > 0 && (
            <button type="button" onClick={() => navigate('/dash')} className="v-press min-h-[44px] shrink-0 font-semibold text-ink underline">Review</button>
          )}
        </div>
      )}

      {/* Search + filter toggle */}
      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            value={s.filters.q}
            onChange={(e) => s.setFilter('q', e.target.value)}
            placeholder="Search payee or note"
            aria-label="Search transactions"
            className="v-input bg-surface pl-10"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters(v => !v)}
          aria-expanded={showFilters}
          aria-label={s.isFiltered ? 'Filters (on)' : 'Filters'}
          className={`v-press relative flex min-h-12 min-w-12 items-center justify-center rounded-xl transition-colors
            ${showFilters ? 'bg-surface-2 text-ink' : 'bg-surface text-ink-2'}`}
        >
          {/* A filter is on: a small accent dot, not a green button. */}
          {s.isFiltered && <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />}
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
            <div className="v-block mb-4 space-y-4 p-4">
              <div>
                <p className="v-field-label">Category</p>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(c => {
                    const active = s.filters.category === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => s.setFilter('category', active ? '' : c)}
                        aria-pressed={active}
                        className={`v-press min-h-[40px] rounded-lg px-3 text-sm font-semibold transition-colors
                          ${active ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2'}`}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="v-field-label">From</span>
                  <input
                    type="date" value={s.filters.from}
                    onChange={(e) => s.setFilter('from', e.target.value)}
                    className="v-input"
                  />
                </label>
                <label className="block">
                  <span className="v-field-label">To</span>
                  <input
                    type="date" value={s.filters.to}
                    onChange={(e) => s.setFilter('to', e.target.value)}
                    className="v-input"
                  />
                </label>
                <label className="block">
                  <span className="v-field-label">Min ₹</span>
                  <input
                    type="number" inputMode="numeric" min="0" value={s.filters.minAmount}
                    onChange={(e) => s.setFilter('minAmount', e.target.value)}
                    placeholder="0"
                    className="v-input"
                  />
                </label>
                <label className="block">
                  <span className="v-field-label">Max ₹</span>
                  <input
                    type="number" inputMode="numeric" min="0" value={s.filters.maxAmount}
                    onChange={(e) => s.setFilter('maxAmount', e.target.value)}
                    placeholder="Any"
                    className="v-input"
                  />
                </label>
              </div>

              <div>
                <p className="v-field-label flex items-center gap-1.5">
                  <ArrowDownUp className="h-3.5 w-3.5" aria-hidden="true" /> Sort
                </p>
                <div className="flex flex-wrap gap-2">
                  {SORTS.map(o => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => s.setFilter('sort', o.value)}
                      aria-pressed={s.filters.sort === o.value}
                      className={`v-press min-h-[40px] rounded-lg px-3 text-sm font-semibold transition-colors
                        ${s.filters.sort === o.value ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2'}`}
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
                  className="v-press v-btn-text -ml-2"
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
        <div role="alert" className="v-block p-4 text-sm text-ink-soft">
          <p>{s.error}</p>
          <button type="button" onClick={s.refresh} className="v-press v-btn-secondary mt-3">
            Try again
          </button>
        </div>
      ) : s.loading ? (
        <div className="space-y-1" aria-busy="true" aria-label="Loading transactions">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[60px] animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      ) : s.rows.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <Receipt className="mx-auto mb-3 h-7 w-7 text-ink-3" aria-hidden="true" />
          {s.isFiltered ? (
            <>
              <p className="font-semibold text-ink">Nothing matches those filters</p>
              <p className="mt-1 text-sm text-ink-2">Try widening the date range or clearing the category.</p>
              <button type="button" onClick={s.resetFilters} className="v-press v-btn-secondary mt-4">
                Clear filters
              </button>
            </>
          ) : (
            <>
              <p className="font-semibold text-ink">No expenses yet</p>
              <p className="mt-1 text-sm text-ink-2">
                Add your first expense from Home, or allow bank SMS in Profile and Vittova will track your payments for you.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-6">
            {days.map((day) => (
              <section key={`${day.label}-${day.rows[0].id}`} aria-label={day.label}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="v-label">{day.label}</h2>
                  <span className="font-mono-finance text-xs font-medium text-ink-2">{rupees(day.total)}</span>
                </div>
                {/* One block per day; a row is one tap target that opens the expense. */}
                <ul className="v-block v-rows px-3.5">
                  {day.rows.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => setEditing(row)}
                        aria-label={`${expenseTitle(row)}, ${rupees(row.amount)}. Edit or delete`}
                        className="v-press flex min-h-[60px] w-full items-center gap-3 py-2.5 text-left"
                      >
                        <CategoryIcon category={row.category} className="text-ink" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{expenseTitle(row)}</span>
                          <span className="block truncate text-xs text-ink-2">{expenseMeta(row)}</span>
                        </span>
                        <span className="font-mono-finance shrink-0 text-sm font-semibold text-ink">{rupees(row.amount)}</span>
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
              className="v-press v-btn-secondary mt-5 w-full"
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
            className="fixed inset-x-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-[300] mx-auto flex max-w-sm items-center gap-2.5 rounded-xl bg-surface-2 p-3.5 text-sm font-semibold text-ink shadow-[var(--v-shadow-pop)] md:bottom-8"
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${toast.type === 'error' ? 'bg-danger' : 'bg-accent'}`} aria-hidden="true" />
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
      className="v-scrim fixed inset-0 z-[400] flex items-end justify-center p-0 sm:items-center sm:p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onCancel}
      role="dialog" aria-modal="true" aria-label="Edit expense"
    >
      <motion.form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        transition={{ type: 'tween', duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        className="v-sheet w-full max-w-md space-y-4 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Edit expense</h2>
          <button type="button" onClick={onCancel} aria-label="Close" className="v-press flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2 text-ink-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="block">
          <span className="v-field-label">Amount</span>
          <input
            type="number" inputMode="decimal" step="0.01" min="0.01" value={amount} autoFocus
            onChange={(e) => setAmount(e.target.value)}
            className="v-input font-mono-finance text-lg font-semibold"
          />
        </label>

        <div>
          <span className="v-field-label">Category</span>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(c => (
              <button
                key={c} type="button" onClick={() => setCategory(c)}
                aria-pressed={category === c}
                className={`v-press min-h-[40px] rounded-lg px-3 text-sm font-semibold transition-colors ${category === c ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="v-field-label">Description</span>
          <input
            type="text" value={description} maxLength={200}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What was it for?"
            className="v-input"
          />
        </label>

        <label className="block">
          <span className="v-field-label">Date</span>
          <input
            type="date" value={date} max={toDateInput(new Date().toISOString())}
            onChange={(e) => setDate(e.target.value)}
            className="v-input"
          />
        </label>

        <p className="text-xs leading-relaxed text-ink-3">
          Editing an expense does not change round-up savings or your streak. Those were earned when you logged it.
        </p>

        {formError && <p role="alert" className="v-error">{formError}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="submit" disabled={saving}
            className="v-press v-btn-primary flex-1"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" onClick={onCancel} className="v-press v-btn-secondary min-h-[3rem]">
            Cancel
          </button>
        </div>
        <button type="button" onClick={onDelete} disabled={saving}
          className="v-press flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-danger disabled:opacity-50">
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
      className="v-scrim fixed inset-0 z-[400] flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onCancel}
      role="alertdialog" aria-modal="true" aria-label="Confirm delete"
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.98, opacity: 0 }}
        className="w-full max-w-sm rounded-3xl bg-surface p-5 shadow-[var(--v-shadow-pop)]"
      >
        <h2 className="text-lg font-bold text-ink">Delete this expense?</h2>
        <p className="mt-2 text-sm text-ink-soft">
          {rupees(expense.amount)}{expense.description ? ` · ${expense.description}` : ''}
        </p>
        <p className="mt-1 text-sm text-ink-3">This cannot be undone.</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }}
            className="v-press flex min-h-[3rem] flex-1 items-center justify-center gap-2 rounded-xl bg-danger text-[15px] font-semibold text-on-fill disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
          </button>
          <button type="button" onClick={onCancel} className="v-press v-btn-secondary min-h-[3rem]">
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
