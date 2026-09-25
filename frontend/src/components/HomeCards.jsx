/**
 * HomeCards — the Home screen, top to bottom:
 *   MoneyStatus    how much is left to spend this month, and per day
 *   MoneyHealth    spent vs budget, bills still due, top categories (compact rows)
 *   InsightCard    at most one thing that needs attention, plus "Ask Vittova"
 *
 * Presentation only: every figure comes from the existing APIs
 * (/safe-to-spend, /burn-rate) or sums of the user's own expense rows.
 */

import { useNavigate } from 'react-router-dom';
import { AlertTriangle, MessageCircle, Sparkles } from 'lucide-react';
import { Money, Row, SectionLabel, Skeleton, StatusPill, Surface } from './ui';

import { billDueIn, inr } from '../lib/moneyDisplay';

export function MoneyStatus({ safe, error, onRetry }) {
  if (!safe) {
    return (
      <Surface className="bg-gradient-to-b from-[#142008] to-[#111113]" aria-busy="true">
        <SectionLabel>Left to spend this month</SectionLabel>
        {error
          ? <p className="mt-3 text-sm text-zinc-300">We couldn't load this just now. <button type="button" onClick={onRetry} className="min-h-[44px] font-bold text-lime-300 underline">Try again</button></p>
          : <><p className="mt-2 font-mono-finance text-[44px] font-black leading-none text-zinc-700">₹ ———</p><Skeleton className="mt-3 h-4 w-40" /></>}
      </Surface>
    );
  }
  const over = safe.isNegative;
  return (
    <Surface className={over ? 'bg-gradient-to-b from-[#2a0d10] to-[#111113]' : 'bg-gradient-to-b from-[#142008] to-[#111113]'}>
      <div className="flex items-start justify-between gap-2">
        <SectionLabel>Left to spend this month</SectionLabel>
        {over && <StatusPill tone="bad">Over plan</StatusPill>}
      </div>
      <p className="mt-2"><Money value={over ? 0 : safe.remaining} className="text-[44px] font-black leading-none text-white" /></p>
      {over ? (
        <p className="mt-3 text-sm text-zinc-300">Bills and your savings target are <span className="font-bold text-rose-300">{inr(safe.overBy)}</span> more than this month's budget.</p>
      ) : (
        <p className="mt-3 text-sm text-zinc-300">
          <span className="font-mono-finance font-bold text-lime-300">{inr(safe.daily)}/day</span> for {safe.daysRemaining} day{safe.daysRemaining === 1 ? '' : 's'}
        </p>
      )}
      {(safe.upcomingBills > 0 || safe.investmentTarget > 0) && (
        <p className="mt-1 text-xs text-zinc-500">
          Already set aside: {[safe.upcomingBills > 0 && `${inr(safe.upcomingBills)} bills due`, safe.investmentTarget > 0 && `${inr(safe.investmentTarget)} savings`].filter(Boolean).join(' · ')}
        </p>
      )}
    </Surface>
  );
}

function healthOf({ totalSpent, monthlyBudget, burn }) {
  if (totalSpent > monthlyBudget) return { tone: 'bad', label: 'Over budget' };
  if (burn?.willGoBroke) return { tone: 'warn', label: 'Watch spending' };
  return { tone: 'good', label: 'On track' };
}

export function MoneyHealth({ loading, totalSpent, monthlyBudget, safe, burn, categories, lastExpense }) {
  const navigate = useNavigate();
  const pct = monthlyBudget > 0 ? Math.min(100, Math.round((totalSpent / monthlyBudget) * 100)) : 0;
  const health = healthOf({ totalSpent, monthlyBudget, burn });
  const nextBill = safe?.upcomingBillList?.[0];
  return (
    <Surface>
      <div className="flex items-center justify-between">
        <SectionLabel>Money health</SectionLabel>
        {!loading && <StatusPill tone={health.tone}>{health.label}</StatusPill>}
      </div>
      <div className="mt-2">
        {loading ? <Skeleton className="h-10 w-full" /> : (
          <>
            <Row label="Spent this month" value={`${inr(totalSpent)} of ${inr(monthlyBudget)}`} />
            <div className="-mt-1 mb-1 h-1.5 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-label="Budget used" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full rounded-full transition-[width] duration-500 ${health.tone === 'good' ? 'bg-lime-400' : health.tone === 'warn' ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${pct}%` }} />
            </div>
          </>
        )}
        {safe && (
          <Row label="Bills still due" value={inr(safe.upcomingBills)}
            hint={nextBill ? `Next: ${nextBill.name} ${billDueIn(nextBill.dueDay, new Date().getDate())}` : 'None left this month'} />
        )}
        {categories[0] && (
          <Row label={`Biggest spend: ${categories[0].category}`} value={inr(categories[0].amount)} hint={`${categories[0].share}% of this month's spending`} />
        )}
        {lastExpense && (
          <Row label="Last expense" hint={`${lastExpense.description} · ${inr(lastExpense.amount)}`} onClick={() => navigate('/transactions')} right={<span className="text-xs font-bold text-zinc-400">See all</span>} />
        )}
      </div>
    </Surface>
  );
}

/**
 * One insight at most: an overspending warning first, otherwise a gentle
 * tip from the user's own food spending, otherwise just "Ask Vittova".
 */
export function InsightCard({ burn, foodThisMonth }) {
  const navigate = useNavigate();
  const ask = (q) => navigate('/bot', { state: { ask: q } });
  let insight = null;
  if (burn?.willGoBroke) {
    insight = {
      icon: AlertTriangle, tone: 'text-amber-300',
      text: burn.budgetRemaining < 0 ? `You're ${inr(Math.abs(burn.budgetRemaining))} over this month's budget.` : `At this pace, your budget runs out around ${burn.brokeDate}.`,
      action: 'See why', question: 'Why is my spending pace high this month?',
    };
  } else if (foodThisMonth >= 500) {
    insight = {
      icon: Sparkles, tone: 'text-lime-300',
      text: `Food is ${inr(foodThisMonth)} this month. Trimming 10% frees up ${inr(foodThisMonth * 0.1)}.`,
      action: 'Show me how', question: 'How can I spend less on food this month?',
    };
  }
  return (
    <Surface>
      {insight && (
        <div className="flex items-start gap-3 border-b border-white/[0.06] pb-3">
          <insight.icon className={`mt-0.5 h-5 w-5 shrink-0 ${insight.tone}`} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">{insight.text}</p>
            <button type="button" onClick={() => ask(insight.question)} className="v-press mt-1 min-h-[36px] text-sm font-bold text-lime-300">{insight.action}</button>
          </div>
        </div>
      )}
      <button type="button" onClick={() => navigate('/bot')} className={`v-press flex min-h-[44px] w-full items-center gap-3 text-left ${insight ? 'pt-3' : ''}`}>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime-400/10"><MessageCircle className="h-5 w-5 text-lime-300" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-white">Ask Vittova</span>
          <span className="block truncate text-xs text-zinc-500">"What can I safely spend this week?"</span>
        </span>
      </button>
    </Surface>
  );
}
