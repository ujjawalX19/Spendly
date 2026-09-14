import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Info, Loader2, X } from 'lucide-react';

// ─── Formatting ─────────────────────────────────────────────────────────────

const numberFmt = new Intl.NumberFormat('en-IN');

export const fmtNumber = (n) => (n === null || n === undefined ? '—' : numberFmt.format(n));
export const fmtPercent = (r) => (r === null || r === undefined ? '—' : `${(r * 100).toFixed(r < 0.1 ? 1 : 0)}%`);

export function fmtDate(value, { time = true } = {}) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    ...(time ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  });
}

export function fmtRelative(value) {
  if (!value) return 'never';
  const s = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 60) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(value, { time: false });
}

// ─── Status ─────────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  HEALTHY: 'bg-lime-400/10 text-lime-300 ring-lime-400/30',
  WARNING: 'bg-amber-400/10 text-amber-300 ring-amber-400/30',
  ERROR: 'bg-red-500/10 text-red-300 ring-red-500/40',
  NO_DATA: 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/30',
  DISABLED: 'bg-zinc-500/10 text-zinc-500 ring-zinc-600/30',
};
const STATUS_DOT = { HEALTHY: 'bg-lime-400', WARNING: 'bg-amber-400', ERROR: 'bg-red-500', NO_DATA: 'bg-zinc-500', DISABLED: 'bg-zinc-600' };

export function StatusBadge({ status }) {
  const label = status === 'NO_DATA' ? 'NO DATA' : status;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ring-1 ${STATUS_STYLES[status] || STATUS_STYLES.NO_DATA}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status] || STATUS_DOT.NO_DATA}`} aria-hidden />
      {label}
    </span>
  );
}

// ─── Layout primitives ──────────────────────────────────────────────────────

export function Card({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-zinc-800/80 bg-zinc-900/60 ${className}`}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800/80 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

/**
 * One figure from the API: `{ value, note? }`. A null value renders as an
 * explained dash, never as zero.
 */
export function Metric({ label, metric, format = fmtNumber, hint }) {
  const value = metric?.value;
  const missing = value === null || value === undefined;
  const note = metric?.note;
  return (
    <div className="min-w-0">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 tabular text-2xl font-semibold ${missing ? 'text-zinc-600' : 'text-zinc-50'}`}>
        {missing ? '—' : format(value)}
        {metric?.lowerBound && <span className="text-sm text-zinc-500">+</span>}
      </p>
      {(note || hint) && (
        <p className={`mt-1 flex items-start gap-1 text-[11px] leading-snug ${missing ? 'text-amber-300/80' : 'text-zinc-500'}`}>
          {missing ? <Info className="mt-px h-3 w-3 shrink-0" aria-hidden /> : null}
          <span>{note || hint}</span>
        </p>
      )}
    </div>
  );
}

export function MetricGrid({ children }) {
  return <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 xl:grid-cols-4">{children}</div>;
}

export function Button({ variant = 'secondary', loading = false, children, className = '', ...props }) {
  const styles = {
    primary: 'bg-lime-400 text-zinc-950 hover:bg-lime-300',
    secondary: 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700',
    danger: 'bg-red-500/15 text-red-300 ring-1 ring-red-500/30 hover:bg-red-500/25',
    ghost: 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60',
  };
  return (
    <button
      type="button"
      {...props}
      disabled={loading || props.disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-400 disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function ErrorBanner({ error, onRetry }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1">{error.message || String(error)}</span>
      {onRetry && <Button variant="ghost" onClick={onRetry}>Retry</Button>}
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-md bg-zinc-800/70 ${className}`} />;
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/**
 * Confirmation dialog that requires a written reason. The reason is stored in
 * the audit log with the action.
 */
export function ReasonDialog({ open, title, description, confirmLabel, danger, onCancel, onConfirm, children }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;
  const valid = reason.trim().length >= 3;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="reason-dialog-title">
      <div className="absolute inset-0 bg-black/70" onClick={() => !busy && onCancel()} />
      <form onSubmit={submit} className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 id="reason-dialog-title" className="text-lg font-semibold text-zinc-50">{title}</h3>
          <button type="button" onClick={onCancel} disabled={busy} className="rounded p-1 text-zinc-500 hover:text-zinc-200" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        {description && <p className="mb-4 text-sm leading-relaxed text-zinc-400">{description}</p>}
        {children}
        <label className="mb-1.5 mt-4 block text-xs font-medium text-zinc-400" htmlFor="reason">Reason (recorded in the audit log)</label>
        <textarea
          id="reason"
          ref={inputRef}
          value={reason}
          maxLength={500}
          rows={3}
          onChange={(e) => setReason(e.target.value)}
          className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-lime-400 focus:outline-none"
          placeholder="e.g. Support ticket #142"
        />
        {error && <p className="mt-3 text-sm text-red-300">{error.message}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} loading={busy} disabled={!valid}>{confirmLabel}</Button>
        </div>
      </form>
    </div>
  );
}
