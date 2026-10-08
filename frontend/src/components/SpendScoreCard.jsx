/**
 * SpendScoreCard — the weekly Spend Score (from /api/paisa-score), with the
 * breakdown on tap. Moved from Home to Wealth in the v1.1 layout.
 */

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

// ─── SPEND SCORE WIDGET ───────────────────────────────────
const SCORE_LABELS = {
  budgetDiscipline: 'Budget discipline',
  dailyConsistency: 'Daily consistency',
  spendingStability: 'Spending stability',
  savingsConsistency: 'Savings consistency',
  loggingHabit: 'Logging habit',
};

export default function SpendScoreCard({ score }) {
  const [open, setOpen] = useState(false);
  if (!score) return null;
  const hasScore = typeof score.total === 'number';
  const pct = hasScore ? Math.round((score.total / (score.max || 100)) * 100) : 0;
  const circumference = 2 * Math.PI * 32;
  const strokeDash = (pct / 100) * circumference;

  return (
    <div className="v-enter v-block p-4">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-4 text-left">
        <div className="relative h-16 w-16 shrink-0">
          <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="36" cy="36" r="32" fill="none" stroke="var(--v-surface-3)" strokeWidth="4" />
            {hasScore && (
              <circle cx="36" cy="36" r="32" fill="none" stroke="var(--v-accent)" strokeWidth="4"
                strokeLinecap="round" strokeDasharray={circumference}
                strokeDashoffset={circumference - strokeDash}
                className="transition-all duration-700 ease-out" />
            )}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-display text-lg font-bold tabular-nums text-ink">{hasScore ? score.total : '—'}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-ink">Spend Score <span className="font-normal text-ink-3">/ {score.max || 100}</span></p>
          <p className="mt-0.5 text-xs text-ink-2">
            {hasScore ? 'Tap to see why you got this score' : 'Not enough data for a score yet'}
          </p>
          {typeof score.change === 'number' && score.change !== 0 && (
            <p className={`mt-1 text-xs font-semibold ${score.change > 0 ? 'text-accent' : 'text-danger'}`}>
              {score.change > 0 ? '+' : ''}{score.change} since last week
            </p>
          )}
        </div>
        <ChevronRight className={`h-4 w-4 text-ink-3 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="mt-4 space-y-3 border-t border-line pt-3">
          {!hasScore && score.insufficientReasons?.length > 0 && (
            <ul className="list-disc space-y-1 pl-4 text-xs text-ink-2">
              {score.insufficientReasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
          {Object.entries(score.components || {}).map(([key, c]) => (
            <div key={key}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-ink">{SCORE_LABELS[key] || key}</span>
                <span className="font-mono tabular-nums text-ink-2">{c.available ? `${c.score}/100` : 'n/a'}</span>
              </div>
              {c.available && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-ink-2" style={{ width: `${c.score}%` }} />
                </div>
              )}
              <p className="mt-1 text-[11px] text-ink-3">{c.explanation}</p>
            </div>
          ))}
          {score.disclaimer && <p className="text-[11px] text-ink-3">{score.disclaimer}</p>}
        </div>
      )}
    </div>
  );
}
