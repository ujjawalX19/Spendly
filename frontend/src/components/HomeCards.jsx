/**
 * HomeCards — the pieces of the Home screen, top to bottom:
 *   TopBar          who is signed in, and two round shortcuts
 *   BalanceCard     the one figure: what is left to spend this month, on the
 *                   gradient card
 *   QuickActions    four tiles: the things people do most
 *   DailyCard       today's spending against the safe daily amount, split by
 *                   category
 *   AnalyticsCard   the last seven days, spent against the daily limit
 *   InsightRow      at most one thing that needs attention
 *   MonthRows       what is still to come this month: bills, biggest category
 *   RecentActivity  the last few expenses
 *
 * Presentation only: every figure comes from the existing APIs
 * (/safe-to-spend, /burn-rate) or sums of the user's own expense rows.
 */

import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarClock, ChevronRight, Lightbulb, Loader2, MessageCircle } from 'lucide-react';
import CategoryIcon from './CategoryIcon';
import PulseMark from './PulseMark';
import { Skeleton } from './ui';
import { billDueIn, compactInr, inr } from '../lib/moneyDisplay';

/** The four data colours, in the order they are handed out. */
export const SERIES = ['bg-accent', 'bg-info', 'bg-violet', 'bg-warn'];

function healthOf({ totalSpent, monthlyBudget, burn }) {
  if (totalSpent > monthlyBudget) return 'Over budget';
  if (burn?.willGoBroke) return 'Watch spending';
  return 'On track';
}

/**
 * @param {{ initials: string, actions: Array<{ icon: Function, label: string, onClick: () => void, busy?: boolean }> }} props
 */
export function TopBar({ initials, actions = [] }) {
  const navigate = useNavigate();
  return (
    <header className="flex items-center justify-between">
      <button type="button" onClick={() => navigate('/settings')} aria-label="Profile" className="v-press v-round text-[13px] font-semibold">
        {initials}
      </button>
      <div className="flex gap-2.5">
        {actions.map((a) => (
          <button key={a.label} type="button" onClick={a.onClick} disabled={a.busy} aria-label={a.label} className="v-press v-round">
            {a.busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" /> : <a.icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </header>
  );
}

/**
 * @param {object} props
 * @param {object|null} props.safe        GET /safe-to-spend
 * @param {boolean} props.error           that request failed
 * @param {boolean} props.loading         expenses are still loading (or could not be loaded)
 * @param {string} props.name             the signed-in person's name
 */
export function BalanceCard({ safe, error, onRetry, loading, totalSpent, monthlyBudget, burn, name }) {
  if (!safe) {
    return (
      <section className="v-hero-card v-enter p-5" aria-busy={!error}>
        <div className="flex items-start justify-between">
          <p className="text-xs text-white/75">Left to spend</p>
          <PulseMark />
        </div>
        {error
          ? <p className="mt-3 text-sm">We couldn't load this just now. <button type="button" onClick={onRetry} className="min-h-[44px] font-semibold underline">Try again</button></p>
          : <p className="mt-2 text-[32px] font-semibold leading-none text-white/40">₹ ———</p>}
        <div className="h-[84px]" />
      </section>
    );
  }
  const over = safe.isNegative;
  const value = over ? 0 : Math.max(0, Number(safe.remaining) || 0);
  const whole = Math.floor(value);
  const paise = String(Math.round((value - whole) * 100)).padStart(2, '0');
  const setAside = [safe.upcomingBills > 0 && `${inr(safe.upcomingBills)} bills`, safe.investmentTarget > 0 && `${inr(safe.investmentTarget)} savings`].filter(Boolean);
  // Bottom left says what the figure allows for; with nothing set aside, whose month it is.
  const note = over
    ? { label: 'Over plan by', value: inr(safe.overBy) }
    : setAside.length
      ? { label: 'After setting aside', value: setAside.join(' + ') }
      : { label: 'Name', value: String(name || '').toUpperCase() };

  return (
    <section className="v-hero-card v-enter p-5" aria-label="Left to spend this month">
      <div className="flex items-start justify-between">
        <p className="text-xs text-white/75">Left to spend</p>
        <PulseMark />
      </div>
      <p className="mt-1.5 text-[32px] font-semibold leading-none tabular-nums">
        ₹{whole.toLocaleString('en-IN')}<span className="text-white/55">.{paise}</span>
      </p>
      <p className="mt-4 inline-flex min-h-[24px] items-center rounded-md bg-white/15 px-2 text-[11px] font-medium">
        {over ? 'Over plan' : loading ? 'This month' : healthOf({ totalSpent, monthlyBudget, burn })}
      </p>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] text-white/70">{note.label}</p>
          <p className="mt-0.5 truncate text-[13px] font-semibold">{note.value}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] text-white/70">{safe.daysRemaining} day{safe.daysRemaining === 1 ? '' : 's'} left</p>
          <p className="mt-0.5 text-[13px] font-medium tabular-nums">
            {loading ? '—' : <>{inr(totalSpent)} <span className="text-white/70">of</span> {inr(monthlyBudget)}</>}
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * @param {{ actions: Array<{ icon: Function, label: string, name?: string, onClick: () => void, busy?: boolean }> }} props
 */
export function QuickActions({ actions }) {
  return (
    <div className="grid grid-cols-4 gap-2.5">
      {actions.map((a) => (
        <button key={a.label} type="button" onClick={a.onClick} disabled={a.busy} aria-label={a.name || a.label} className="v-press v-tile">
          {a.busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <a.icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />}
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Today's spending against the safe daily amount, split by category.
 * @param {{ spent: number, daily: number|null, parts: Array<{ category: string, amount: number }>, loading: boolean }} props
 */
export function DailyCard({ spent, daily, parts, loading }) {
  return (
    <section className="v-block v-enter p-4" aria-labelledby="daily-title">
      <h2 id="daily-title" className="text-[15px] font-medium text-ink">Daily spending</h2>
      {loading ? <Skeleton className="mt-3 h-[70px] w-full" /> : (
        <>
          <p className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-[26px] font-semibold leading-none tabular-nums text-ink">{inr(spent)}</span>
            {daily !== null && <span className="text-xs text-ink-2">Safe: {inr(daily)} / day</span>}
          </p>
          <div className="mt-4 flex h-2 gap-1" role="img" aria-label={parts.length ? `Today by category: ${parts.map((p) => `${p.category} ${inr(p.amount)}`).join(', ')}` : 'Nothing spent today'}>
            {parts.length
              ? parts.map((p, i) => <span key={p.category} className={`min-w-2 rounded-full ${SERIES[i % SERIES.length]}`} style={{ flexGrow: p.amount, flexBasis: 0 }} />)
              : <span className="flex-1 rounded-full bg-surface-3" />}
          </div>
          {parts.length ? (
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-ink-soft">
              {parts.map((p, i) => (
                <li key={p.category} className="flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${SERIES[i % SERIES.length]}`} aria-hidden="true" />{p.category}</li>
              ))}
            </ul>
          ) : <p className="mt-3 text-xs text-ink-2">Nothing spent today.</p>}
        </>
      )}
    </section>
  );
}

/**
 * The last seven days: what was spent each day next to the safe daily amount.
 * @param {{ days: Array<{ label: string, spent: number }>, limit: number|null, loading: boolean }} props
 */
export function AnalyticsCard({ days, limit, loading }) {
  const navigate = useNavigate();
  const max = Math.max(limit || 0, ...days.map((d) => d.spent), 1);
  const height = (n) => `${Math.max(n > 0 ? 4 : 0, Math.round((n / max) * 100))}%`;
  return (
    <section className="v-enter" aria-labelledby="analytics-title">
      <div className="flex items-center justify-between">
        <h2 id="analytics-title" className="v-h">Analytics</h2>
        <button type="button" onClick={() => navigate('/transactions')} className="v-press v-h-link">View details</button>
      </div>
      <div className="v-block p-4">
        <div className="flex items-center justify-between text-xs text-ink-soft">
          <ul className="flex gap-4">
            <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warn" aria-hidden="true" />Spent</li>
            {limit !== null && <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-ink-3" aria-hidden="true" />Daily limit</li>}
          </ul>
          <span>Last 7 days</span>
        </div>
        {loading ? <Skeleton className="mt-4 h-[132px] w-full" /> : (
          <>
            <div className="relative mt-4 h-28" role="img" aria-label={`Spending for the last seven days: ${days.map((d) => `${d.label} ${inr(d.spent)}`).join(', ')}`}>
              {[0, 50, 100].map((top) => <span key={top} className="absolute inset-x-0 border-t border-dashed border-line" style={{ top: `${top}%` }} />)}
              <span className="absolute left-0 top-1 text-[10px] tabular-nums text-ink-3">{compactInr(max)}</span>
              <div className="absolute inset-0 flex items-end pl-9">
                {days.map((d) => (
                  <div key={d.label} className="flex h-full flex-1 items-end justify-center gap-1">
                    {limit !== null && <span className="w-2 rounded-[3px] bg-surface-3" style={{ height: height(limit) }} />}
                    <span className="w-2 rounded-[3px] bg-warn" style={{ height: height(d.spent) }} />
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-2 flex pl-9 text-[10px] text-ink-3">
              {days.map((d) => <span key={d.label} className="flex-1 text-center">{d.label}</span>)}
            </div>
          </>
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
      icon: Lightbulb, tone: 'text-ink',
      text: `Food is ${inr(foodThisMonth)} this month. Trimming 10% frees up ${inr(foodThisMonth * 0.1)}.`,
      action: 'Show me how', question: 'How can I spend less on food this month?',
    };
  }
  if (!insight) return null;
  return (
    <button type="button" onClick={() => navigate('/bot', { state: { ask: insight.question } })} className="v-press v-enter v-item w-full">
      <span className={`v-item-icon ${insight.tone}`}><insight.icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-snug text-ink">{insight.text}</span>
        <span className="mt-0.5 block text-xs text-ink-2">{insight.action}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
    </button>
  );
}

/** What this month still holds: bills to come, and where most of it went. */
export function MonthRows({ safe, categories }) {
  const nextBill = safe?.upcomingBillList?.[0];
  if (!safe && !categories[0]) return null;
  return (
    <section className="v-enter" aria-labelledby="month-rows-title">
      <h2 id="month-rows-title" className="v-h mb-2.5">This month</h2>
      <div className="space-y-2">
        {safe && (
          <div className="v-item">
            <span className="v-item-icon"><CalendarClock className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">Bills still due</span>
              <span className="block truncate text-xs text-ink-2">{nextBill ? `Next: ${nextBill.name} ${billDueIn(nextBill.dueDay, new Date().getDate())}` : 'None left this month'}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-sm font-semibold tabular-nums text-ink">{inr(safe.upcomingBills)}</span>
              <span className={`block text-xs ${safe.upcomingBills > 0 ? 'text-warn' : 'text-accent'}`}>{safe.upcomingBills > 0 ? 'To pay' : 'All paid'}</span>
            </span>
          </div>
        )}
        {categories[0] && (
          <div className="v-item">
            <CategoryIcon category={categories[0].category} className="text-ink" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{categories[0].category}</span>
              <span className="block truncate text-xs text-ink-2">{categories[0].share}% of this month's spending</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-sm font-semibold tabular-nums text-ink">{inr(categories[0].amount)}</span>
              <span className="block text-xs text-ink-2">Most spent</span>
            </span>
          </div>
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
      <div className="flex items-center justify-between">
        <h2 id="recent-title" className="v-h">Recent</h2>
        <button type="button" onClick={() => navigate('/transactions')} className="v-press v-h-link">View all</button>
      </div>
      {loading ? <Skeleton className="h-[196px] w-full rounded-2xl" /> : (
        <ul className="space-y-2">
          {items.map((e) => (
            <li key={e.id} className="v-item">
              <CategoryIcon category={e.category} className="text-ink" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{e.title}</span>
                <span className="block truncate text-xs text-ink-2">{e.meta}</span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{inr(e.amount)}</span>
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
    <button type="button" onClick={() => navigate('/bot')} className="v-press v-item w-full">
      <span className="v-item-icon"><MessageCircle className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">Ask Vittova</span>
        <span className="block truncate text-xs text-ink-2">What can I safely spend this week?</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
    </button>
  );
}
