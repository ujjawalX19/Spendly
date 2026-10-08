/**
 * Vittova design system — the shared building blocks for every screen.
 *
 *   Surface       a block on the page: one tone lighter, no outline, 16px padding
 *   SectionLabel  sentence-case label above a group
 *   PrimaryButton 48px tall, the accent: the one main action in a section
 *   SecondaryButton (neutral) / QuietButton (text)
 *   Row           label · value line with optional hint and chevron (44px+ touch target)
 *   Money         rupee figure that eases to new values (skips when reduced motion)
 *   Skeleton      layout-preserving placeholder
 *   EmptyState    friendly "nothing here yet" with one action
 *   ErrorState    "Something went wrong. Your data wasn't changed." + Retry
 *   StatusPill    text + symbol, never colour alone
 *
 * Colours come from the tokens in index.css (bg, surface, ink, accent…), so
 * both the dark and the light look are covered. The accent is for the primary
 * action, selected states and the key positive figure, and nothing else.
 * Motion: 120–180 ms for presses, 200–260 ms for content; prefers-reduced-motion
 * turns it off.
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronRight, RefreshCw } from 'lucide-react';

export const cx = (...c) => c.filter(Boolean).join(' ');

export function Surface({ as: Tag = 'section', className = '', children, ...props }) {
  return (
    <Tag className={cx('v-enter v-block p-4', className)} {...props}>
      {children}
    </Tag>
  );
}

export function SectionLabel({ children, className = '' }) {
  return <p className={cx('v-label', className)}>{children}</p>;
}

export function PrimaryButton({ className = '', children, ...props }) {
  return (
    <button type="button" {...props} className={cx('v-press v-btn-primary w-full', className)}>
      {children}
    </button>
  );
}

export function SecondaryButton({ className = '', children, ...props }) {
  return (
    <button type="button" {...props} className={cx('v-press v-btn-secondary', className)}>
      {children}
    </button>
  );
}

export function QuietButton({ className = '', children, ...props }) {
  return (
    <button type="button" {...props} className={cx('v-press v-btn-text', className)}>
      {children}
    </button>
  );
}

export function Row({ label, value, hint, onClick, right, className = '' }) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block truncate text-xs text-ink-3">{hint}</span>}
      </span>
      {value !== undefined && <span className="shrink-0 font-mono-finance text-sm font-semibold tabular-nums text-ink">{value}</span>}
      {right}
      {onClick && <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />}
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
  return <span aria-hidden="true" className={cx('block animate-pulse rounded-lg bg-surface-2', className)} />;
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      {Icon && <Icon className="mb-3 h-6 w-6 text-ink-3" aria-hidden="true" />}
      <p className="text-base font-semibold text-ink">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm text-ink-2">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ onRetry, message = "Something went wrong. Your data wasn't changed." }) {
  return (
    <div role="alert" className="v-block flex flex-col items-center px-4 py-6 text-center">
      <p className="text-sm font-medium text-ink">{message}</p>
      {onRetry && <SecondaryButton className="mt-3" onClick={onRetry}><RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again</SecondaryButton>}
    </div>
  );
}

const PILL = {
  good: 'text-accent',
  warn: 'text-warn',
  bad: 'text-danger',
  neutral: 'text-ink-2',
};
const SYMBOL = { good: '✓', warn: '!', bad: '✕', neutral: '•' };

/**
 * Status label that never relies on colour alone. Plain coloured text with a
 * symbol: a status is a fact about the row, not a badge to be looked at.
 */
export function StatusPill({ tone = 'neutral', children }) {
  return (
    <span className={cx('inline-flex items-center gap-1 text-xs font-semibold', PILL[tone])}>
      <span aria-hidden="true">{SYMBOL[tone]}</span>{children}
    </span>
  );
}
