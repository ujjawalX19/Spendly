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
    <div className="v-enter rounded-[20px] border border-white/[0.06] bg-[#111113] p-4">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-4 text-left">
        <div className="relative w-20 h-20 shrink-0">
          <svg viewBox="0 0 72 72" className="w-full h-full -rotate-90" aria-hidden="true">
            <circle cx="36" cy="36" r="32" fill="none" stroke="#27272a" strokeWidth="5" />
            {hasScore && (
              <circle cx="36" cy="36" r="32" fill="none" stroke="#a3e635" strokeWidth="5"
                strokeLinecap="round" strokeDasharray={circumference}
                strokeDashoffset={circumference - strokeDash}
                className="transition-all duration-1000 ease-out" />
            )}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-black text-white">{hasScore ? score.total : '—'}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">Spend Score <span className="text-[#71717a] font-semibold">/ {score.max || 100}</span></p>
          <p className="text-xs text-[#a1a1aa] mt-0.5">
            {hasScore ? 'Tap to see why you got this score' : 'Not enough data for a score yet'}
          </p>
          {typeof score.change === 'number' && score.change !== 0 && (
            <p className={`text-xs font-bold mt-1 ${score.change > 0 ? 'text-[#a3e635]' : 'text-[#f43f5e]'}`}>
              {score.change > 0 ? '+' : ''}{score.change} since last week
            </p>
          )}
        </div>
        <ChevronRight className={`h-4 w-4 text-[#71717a] transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="mt-4 space-y-3 border-t border-white/5 pt-3">
          {!hasScore && score.insufficientReasons?.length > 0 && (
            <ul className="list-disc space-y-1 pl-4 text-xs text-[#a1a1aa]">
              {score.insufficientReasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
          {Object.entries(score.components || {}).map(([key, c]) => (
            <div key={key}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white">{SCORE_LABELS[key] || key}</span>
                <span className="font-mono text-[#a1a1aa]">{c.available ? `${c.score}/100` : 'n/a'}</span>
              </div>
              {c.available && (
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#27272a]">
                  <div className="h-full rounded-full bg-[#a3e635]" style={{ width: `${c.score}%` }} />
                </div>
              )}
              <p className="mt-1 text-[11px] text-[#71717a]">{c.explanation}</p>
            </div>
          ))}
          {score.disclaimer && <p className="text-[10px] text-[#52525b]">{score.disclaimer}</p>}
        </div>
      )}
    </div>
  );
}



