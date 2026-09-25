/**
 * Vittova design system — the shared building blocks for every screen.
 *
 *   Surface       card: 20px radius, neutral surface, hairline border, 16px padding
 *   SectionLabel  11px uppercase label above a group
 *   PrimaryButton 48px tall, lime, the one main action on a screen
 *   SecondaryButton / QuietButton
 *   Row           label · value line with optional hint and chevron (44px+ touch target)
 *   Money         rupee figure that eases to new values (skips when reduced motion)
 *   Skeleton      layout-preserving placeholder
 *   EmptyState    friendly "nothing here yet" with one action
 *   ErrorState    "Something went wrong. Your data wasn't changed." + Retry
 *   StatusPill    text + symbol, never colour alone
 *
 * Colour rule: surfaces stay neutral; lime is for the primary action, active
 * states and positive confirmation. Motion rule: 120–180 ms for presses,
 * 200–260 ms for content; prefers-reduced-motion turns it off (index.css).
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronRight, RefreshCw } from 'lucide-react';

export const cx = (...c) => c.filter(Boolean).join(' ');

export function Surface({ as: Tag = 'section', className = '', children, ...props }) {
  return (
    <Tag className={cx('v-enter rounded-[20px] border border-white/[0.06] bg-[#111113] p-4', className)} {...props}>
      {children}
    </Tag>
  );
}

export function SectionLabel({ children, className = '' }) {
  return <p className={cx('text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500', className)}>{children}</p>;
}

export function PrimaryButton({ className = '', children, ...props }) {
  return (
    <button type="button" {...props}
      className={cx('v-press inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-lime-400 px-5 text-[15px] font-black text-black disabled:opacity-50', className)}>
      {children}
    </button>
  );
}

export function SecondaryButton({ className = '', children, ...props }) {
  return (
    <button type="button" {...props}
      className={cx('v-press inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-zinc-900 px-4 text-sm font-bold text-zinc-100 disabled:opacity-50', className)}>
      {children}
    </button>
  );
}

export function QuietButton({ className = '', children, ...props }) {
  return (
    <button type="button" {...props}
      className={cx('v-press inline-flex min-h-[44px] items-center gap-1 rounded-xl px-2 text-sm font-bold text-lime-300 disabled:opacity-50', className)}>
      {children}
    </button>
  );
}

export function Row({ label, value, hint, onClick, right, className = '' }) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-zinc-300">{label}</span>
        {hint && <span className="block truncate text-xs text-zinc-500">{hint}</span>}
      </span>
      {value !== undefined && <span className="shrink-0 font-mono-finance text-sm font-bold tabular-nums text-white">{value}</span>}
      {right}
      {onClick && <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" aria-hidden="true" />}
    </>
  );
  const base = cx('flex min-h-[44px] w-full items-center gap-3 py-2 text-left', className);
  return onClick
    ? <button type="button" onClick={onClick} className={cx(base, 'v-press')}>{body}</button>
    : <div className={base}>{body}</div>;
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A number that eases to its new value (0.6 s), so changes are noticed. */
export function useEasedNumber(target, duration = 600) {
  const [display, setDisplay] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const from = prev.current;
    prev.current = target;
    if (from === target || reducedMotion()) { setDisplay(target); return undefined; }
    let raf;
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min((now - t0) / duration, 1);
      setDisplay(from + (target - from) * (1 - (1 - p) ** 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return display;
}

export function Money({ value, className = '' }) {
  const n = useEasedNumber(Number(value) || 0);
  return <span className={cx('font-mono-finance tabular-nums', className)}>₹{Math.round(n).toLocaleString('en-IN')}</span>;
}

export function Skeleton({ className = '' }) {
  return <span aria-hidden="true" className={cx('block animate-pulse rounded-lg bg-zinc-800/80', className)} />;
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      {Icon && <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900"><Icon className="h-6 w-6 text-zinc-400" aria-hidden="true" /></span>}
      <p className="text-base font-bold text-white">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm text-zinc-400">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ onRetry, message = "Something went wrong. Your data wasn't changed." }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-[20px] border border-white/[0.06] bg-[#111113] px-4 py-6 text-center">
      <p className="text-sm font-bold text-white">{message}</p>
      {onRetry && <SecondaryButton className="mt-3" onClick={onRetry}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again</SecondaryButton>}
    </div>
  );
}

const PILL = {
  good: 'border-lime-400/30 bg-lime-400/10 text-lime-300',
  warn: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  bad: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
  neutral: 'border-white/10 bg-zinc-900 text-zinc-300',
};
const SYMBOL = { good: '✓', warn: '!', bad: '✕', neutral: '•' };

/** Status label that never relies on colour alone. */
export function StatusPill({ tone = 'neutral', children }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold', PILL[tone])}>
      <span aria-hidden="true">{SYMBOL[tone]}</span>{children}
    </span>
  );
}
