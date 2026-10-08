/**
 * HomeCards — the Home screen, top to bottom:
 *   MoneyStatus     the one figure: what is left to spend this month, set
 *                   directly on the page, then one summary block (per day,
 *                   spent against budget)
 *   InsightRow      at most one thing that needs attention
 *   MonthRows       what is still to come this month: bills, biggest category
 *   RecentActivity  the last few expenses
 *   AskRow          the way into Ask Vittova
 *
 * Presentation only: every figure comes from the existing APIs
 * (/safe-to-spend, /burn-rate) or sums of the user's own expense rows.
 */

import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Lightbulb, MessageCircle } from 'lucide-react';
import CategoryIcon from './CategoryIcon';
import { Money, Skeleton, StatusPill } from './ui';

import { billDueIn, inr } from '../lib/moneyDisplay';

function healthOf({ totalSpent, monthlyBudget, burn }) {
  if (totalSpent > monthlyBudget) return { tone: 'bad', label: 'Over budget' };
  if (burn?.willGoBroke) return { tone: 'warn', label: 'Watch spending' };
  return { tone: 'good', label: 'On track' };
}
const BAR = { good: 'bg-accent', warn: 'bg-warn', bad: 'bg-danger' };

/**
 * @param {object} props
 * @param {object|null} props.safe        GET /safe-to-spend
 * @param {boolean} props.error           that request failed
 * @param {boolean} props.loading         expenses are still loading (or could not be loaded)
 */
export function MoneyStatus({ safe, error, onRetry, loading, totalSpent, monthlyBudget, burn }) {
  if (!safe) {
    return (
      <section className="v-enter pt-2" aria-busy="true">
        <p className="v-label">Left to spend this month</p>
        {error
          ? <p className="mt-3 text-sm text-ink-soft">We couldn't load this just now. <button type="button" onClick={onRetry} className="min-h-[44px] font-semibold text-ink underline">Try again</button></p>
          : <><p className="mt-1 font-mono-finance text-[48px] font-bold leading-none text-surface-3">₹ ———</p><Skeleton className="mt-3 h-4 w-40" /></>}
        <Skeleton className="mt-5 h-[92px] w-full rounded-2xl" />
      </section>
    );
  }
  const over = safe.isNegative;
  const pct = monthlyBudget > 0 ? Math.min(100, Math.round((totalSpent / monthlyBudget) * 100)) : 0;
  const health = healthOf({ totalSpent, monthlyBudget, burn });
  const setAside = [safe.upcomingBills > 0 && `${inr(safe.upcomingBills)} bills due`, safe.investmentTarget > 0 && `${inr(safe.investmentTarget)} savings`].filter(Boolean);

  return (
    <section className="v-enter pt-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="v-label">Left to spend this month</p>
        {over ? <StatusPill tone="bad">Over plan</StatusPill> : !loading && <StatusPill tone={health.tone}>{health.label}</StatusPill>}
      </div>
      <p className="mt-1"><Money value={over ? 0 : safe.remaining} className={`text-[48px] font-bold leading-none ${over ? 'text-danger' : 'text-accent'}`} /></p>
      {over
        ? <p className="mt-2 text-sm text-ink-2">Bills and your savings target are <span className="font-semibold text-ink">{inr(safe.overBy)}</span> more than this month's budget.</p>
        : setAside.length > 0 && <p className="mt-2 text-sm text-ink-2">After setting aside {setAside.join(' and ')}.</p>}

      <div className="v-block mt-5 px-4 py-3.5">
        <dl className="grid grid-cols-2">
          <div className="pr-4">
            <dt className="text-xs text-ink-2">Safe to spend</dt>
            <dd className="mt-0.5 font-mono-finance text-xl font-bold text-ink">{over ? inr(0) : inr(safe.daily)}<span className="text-sm font-medium text-ink-2"> /day</span></dd>
            <dd className="text-xs text-ink-3">{safe.daysRemaining} day{safe.daysRemaining === 1 ? '' : 's'} left</dd>
          </div>
          <div className="border-l border-line pl-4">
            <dt className="text-xs text-ink-2">Spent</dt>
            {loading
              ? <dd><Skeleton className="mt-1 h-6 w-24" /></dd>
              : <><dd className="mt-0.5 font-mono-finance text-xl font-bold text-ink">{inr(totalSpent)}</dd><dd className="text-xs text-ink-3">of {inr(monthlyBudget)} budget</dd></>}
          </div>
        </dl>
        {!loading && (
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label="Budget used" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full rounded-full transition-[width] duration-500 ${BAR[health.tone]}`} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * One insight at most: an overspending warning first, otherwise a gentle tip
 * from the user's own food spending. Written as a plain finding with one way
 * to act on it; where it comes from is not the point.
 */
export function InsightRow({ burn, foodThisMonth }) {
  const navigate = useNavigate();
  let insight = null;
  if (burn?.willGoBroke) {
    insight = {
      icon: AlertTriangle, tone: 'text-warn',
      text: burn.budgetRemaining < 0 ? `You're ${inr(Math.abs(burn.budgetRemaining))} over this month's budget.` : `At this pace, your budget runs out around ${burn.brokeDate}.`,
      action: 'See why', question: 'Why is my spending pace high this month?',
    };
  } else if (foodThisMonth >= 500) {
    insight = {
      icon: Lightbulb, tone: 'text-ink-2',
      text: `Food is ${inr(foodThisMonth)} this month. Trimming 10% frees up ${inr(foodThisMonth * 0.1)}.`,
      action: 'Show me how', question: 'How can I spend less on food this month?',
    };
  }
  if (!insight) return null;
  return (
    <button type="button" onClick={() => navigate('/bot', { state: { ask: insight.question } })}
      className="v-press v-enter flex w-full items-start gap-3 py-1 text-left">
      <insight.icon className={`mt-0.5 h-5 w-5 shrink-0 ${insight.tone}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-snug text-ink">{insight.text}</span>
        <span className="mt-0.5 block text-sm text-ink-2">{insight.action}</span>
      </span>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
    </button>
  );
}

function Line({ label, hint, value }) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-3 py-2.5">
      <span className="min-w-0">
        <span className="block truncate text-[15px] text-ink">{label}</span>
        {hint && <span className="block truncate text-xs text-ink-3">{hint}</span>}
      </span>
      <span className="shrink-0 font-mono-finance text-[15px] font-semibold text-ink">{value}</span>
    </div>
  );
}

/** What this month still holds: bills to come, and where most of it went. */
export function MonthRows({ safe, categories }) {
  const nextBill = safe?.upcomingBillList?.[0];
  if (!safe && !categories[0]) return null;
  return (
    <section className="v-enter" aria-labelledby="month-rows-title">
      <h2 id="month-rows-title" className="v-label mb-1.5">This month</h2>
      <div className="v-block v-rows px-4">
        {safe && (
          <Line label="Bills still due" value={inr(safe.upcomingBills)}
            hint={nextBill ? `Next: ${nextBill.name} ${billDueIn(nextBill.dueDay, new Date().getDate())}` : 'None left this month'} />
        )}
        {categories[0] && (
          <Line label={`Most spent on ${String(categories[0].category).toLowerCase()}`} value={inr(categories[0].amount)} hint={`${categories[0].share}% of this month's spending`} />
        )}
      </div>
    </section>
  );
}

/**
 * @param {{ items: Array<{ id: string, title: string, meta: string, category: string, amount: number }>, loading: boolean }} props
 */
export function RecentActivity({ items, loading }) {
  const navigate = useNavigate();
  if (!loading && items.length === 0) return null;
  return (
    <section className="v-enter" aria-labelledby="recent-title">
      <div className="mb-0.5 flex items-center justify-between">
        <h2 id="recent-title" className="v-label">Recent</h2>
        <button type="button" onClick={() => navigate('/transactions')} className="v-press v-btn-text -mr-2">See all</button>
      </div>
      {loading ? <Skeleton className="h-[156px] w-full rounded-2xl" /> : (
        <ul className="v-rows">
          {items.map((e) => (
            <li key={e.id} className="flex min-h-[56px] items-center gap-3 py-2">
              <CategoryIcon category={e.category} className="h-9 w-9 rounded-lg" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-ink">{e.title}</span>
                <span className="block truncate text-xs text-ink-3">{e.meta}</span>
              </span>
              <span className="shrink-0 font-mono-finance text-[15px] font-semibold text-ink">{inr(e.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The way into Ask Vittova: a plain row, no sparkle. */
export function AskRow() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/bot')} className="v-press flex min-h-[56px] w-full items-center gap-3 py-2 text-left">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-2"><MessageCircle className="h-[18px] w-[18px]" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink">Ask Vittova</span>
        <span className="block truncate text-xs text-ink-3">What can I safely spend this week?</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
    </button>
  );
}
