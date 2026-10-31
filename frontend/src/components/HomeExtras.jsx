/**
 * HomeExtras — the parts of Home that help someone find their way: the
 * getting-started list, shortcuts to budgets and reports, a quiet Pro row and
 * the "Customise Home" sheet.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Check, ChevronRight, Crown, SlidersHorizontal, Target, X } from 'lucide-react';
import { HOME_SECTIONS, dismissGettingStarted, getHomePrefs, gettingStartedSteps, toggleSection } from '../lib/homePrefs';

export function GettingStarted({ hasExpense, onAddExpense }) {
  const [prefs, setPrefs] = useState(getHomePrefs);
  if (prefs.startDismissed) return null;
  const steps = gettingStartedSteps(prefs, hasExpense);
  const left = steps.filter((s) => !s.done).length;
  if (left === 0) return null;
  return (
    <section className="v-block p-4" aria-labelledby="start-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="start-title" className="text-[15px] font-semibold text-ink">Get started</h2>
          <p className="mt-0.5 text-xs text-ink-3">{steps.length - left} of {steps.length} done</p>
        </div>
        <button type="button" aria-label="Hide this list for good" onClick={() => setPrefs(dismissGettingStarted())}
          className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-3">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <ul className="mt-2">
        {steps.map((step) => {
          const inner = (
            <>
              <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${step.done ? 'border-accent bg-accent text-on-fill' : 'border-line-strong'}`}>
                {step.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </span>
              <span className={`flex-1 text-sm ${step.done ? 'text-ink-3 line-through' : 'font-medium text-ink'}`}>
                {step.label}<span className="sr-only">{step.done ? ' (done)' : ''}</span>
              </span>
              {!step.done && <ChevronRight className="h-4 w-4 text-ink-3" aria-hidden="true" />}
            </>
          );
          const cls = 'v-press flex min-h-[44px] w-full items-center gap-3 text-left no-underline';
          return (
            <li key={step.id}>
              {step.id === 'expense'
                ? <button type="button" onClick={onAddExpense} disabled={step.done} className={cls}>{inner}</button>
                : <Link to={step.to} className={cls}>{inner}</Link>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Shortcut({ to, icon: Icon, title, hint }) {
  return (
    <Link to={to} className="v-press v-block flex min-h-[64px] items-center gap-3 p-3 no-underline">
      <Icon className="h-5 w-5 shrink-0 text-ink-2" strokeWidth={1.75} aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block truncate text-xs text-ink-3">{hint}</span>
      </span>
    </Link>
  );
}

export function PlanShortcuts() {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Shortcut to="/budgets" icon={Target} title="Budgets" hint="Limits by category" />
      <Shortcut to="/reports" icon={BarChart3} title="Reports" hint="Week, month, year" />
    </div>
  );
}

export function ProRow() {
  return (
    <Link to="/pro" className="v-press v-block flex min-h-[56px] items-center gap-3 px-4 py-3 no-underline">
      <Crown className="h-5 w-5 shrink-0 text-ink-2" strokeWidth={1.75} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">Vittova Pro</span>
        <span className="block text-xs text-ink-3">Fewer limits and deeper tools</span>
      </span>
      <ChevronRight className="h-4 w-4 text-ink-3" aria-hidden="true" />
    </Link>
  );
}

export function CustomiseHome({ hidden, onChange, onClose }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center">
      <div className="v-scrim absolute inset-0" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="customise-title"
        className="v-sheet relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="customise-title" className="text-lg font-bold text-ink">Customise Home</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-ink-2"><X className="h-4 w-4" aria-hidden="true" /></button>
        </div>
        <p className="mb-3 text-sm text-ink-2">Choose what shows on Home. Hiding something never changes your data.</p>
        <ul className="v-rows">
          {HOME_SECTIONS.map((s) => {
            const on = !hidden.includes(s.id);
            return (
              <li key={s.id}>
                <button type="button" role="switch" aria-checked={on} onClick={() => onChange(toggleSection(s.id).hidden)}
                  className="flex min-h-[56px] w-full items-center gap-3 py-2 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{s.label}</span>
                    <span className="block text-xs text-ink-3">{s.hint}</span>
                  </span>
                  <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${on ? 'border-accent bg-accent text-on-fill' : 'border-line-strong'}`}>
                    {on && <Check className="h-4 w-4" strokeWidth={3} />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function CustomiseButton({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="v-press mx-auto flex min-h-[44px] items-center gap-2 px-3 text-sm font-medium text-ink-2">
      <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Customise Home
    </button>
  );
}
