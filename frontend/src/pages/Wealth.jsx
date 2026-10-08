/**
 * Wealth — what the user's own data says about their money, and nothing more.
 *
 * Vittova does not know income, bank balances or investments, so this screen
 * never shows portfolio values or performance. Everything is from
 * GET /api/wealth; the only projection is labelled a hypothetical illustration
 * with an assumed rate the user picks. See FINANCIAL_CONTENT_REVIEW.md.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight, Bell, CalendarClock, CalendarRange, ChevronDown, ChevronRight, Coins, Gauge, Info, MessageCircle, PiggyBank, Receipt, Sprout, TrendingUp, Wallet } from 'lucide-react';
import { CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { useExpenses } from '../hooks/useExpenses';
import InvestmentDisclaimer from '../components/InvestmentDisclaimer';
import CategoryIcon from '../components/CategoryIcon';
import { TopBar, SERIES } from '../components/HomeCards';
import { apiJson } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';
import { compactInr } from '../lib/moneyDisplay';
import { expenseMeta, expenseTitle } from '../lib/expenseDisplay';
import { MonthShapeCard, SafeToInvestCard, SipStressTestCard } from '../components/MoneyDecisionCards';
import SpendScoreCard from '../components/SpendScoreCard';
import { ErrorState, Skeleton, Surface } from '../components/ui';
import { stateBadge } from '../lib/moneyDisplay';
import { ageFrom, ADULT_AGE } from '../lib/age';

const inr = (v) => `₹${Math.round(Number(v) || 0).toLocaleString('en-IN')}`;

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
};

const RATES = [0.04, 0.06, 0.08, 0.1];
const HORIZONS = [1, 3, 5, 10];

/** Future value of a fixed monthly contribution at a constant assumed annual rate. */
function futureValue(monthly, years, annual) {
  const n = years * 12;
  if (annual === 0) return monthly * n;
  const r = annual / 12;
  return monthly * (((1 + r) ** n - 1) / r) * (1 + r);
}

// Chart colours come from the theme tokens, so both looks are covered. One
// neutral series, the accent only for the line that matters.
const CHART = {
  grid: 'var(--v-line)',
  tick: { fill: 'var(--v-ink-3)', fontSize: 11 },
  tooltip: { background: 'var(--v-surface-2)', border: '1px solid var(--v-line-strong)', borderRadius: 10, boxShadow: 'var(--v-shadow-pop)', fontSize: 12 },
  tooltipLabel: { color: 'var(--v-ink-2)' },
  tooltipItem: { color: 'var(--v-ink)' },
};

/** A half-circle gauge: how much of the month's budget is used. */
function BudgetGauge({ percent }) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const arc = Math.PI * 40; // length of the half circle, radius 40
  return (
    <div className="relative h-[62px] w-[104px] shrink-0" role="img" aria-label={`${p}% of this month's budget used`}>
      <svg viewBox="0 0 100 56" className="h-full w-full" aria-hidden="true">
        <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="var(--v-surface-3)" strokeWidth="9" strokeLinecap="round" />
        <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke={p > 100 ? 'var(--v-danger)' : 'var(--v-warn)'} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${(p / 100) * arc} ${arc}`} />
      </svg>
      <p className="absolute inset-x-0 bottom-0 text-center leading-tight">
        <span className="block text-sm font-semibold tabular-nums text-ink">{Math.round(Number(percent) || 0)}%</span>
        <span className="block text-[10px] text-ink-2">Used</span>
      </p>
    </div>
  );
}

const RANGES = [['7d', '7D'], ['1m', '1M'], ['6m', '6M']];
const RANGE_TITLE = { '7d': 'Last 7 days', '1m': 'This month', '6m': 'Last 6 months' };

/**
 * Spending for a range as stacked bars: one bar per day (7D) or per week of
 * this month (1M), split into the three biggest categories and the rest.
 * Sums of the user's own expense rows, for display only.
 */
function buildStacks(expenses, range) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let buckets;
  let bucketOf;
  if (range === '7d') {
    buckets = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      return { key: d.toDateString(), label: d.toLocaleDateString('en-IN', { weekday: 'short' }) };
    });
    bucketOf = (when) => when.toDateString();
  } else {
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const weeks = Math.ceil(today.getDate() / 7);
    buckets = Array.from({ length: weeks }, (_, i) => ({ key: `w${i}`, label: `${i * 7 + 1}–${Math.min(i * 7 + 7, lastDay)}` }));
    bucketOf = (when) => (when.getFullYear() === today.getFullYear() && when.getMonth() === today.getMonth() ? `w${Math.floor((when.getDate() - 1) / 7)}` : null);
  }
  const index = new Map(buckets.map((b) => [b.key, b]));
  const rows = [];
  const byCat = {};
  for (const e of expenses) {
    const bucket = index.get(bucketOf(new Date(e.occurred_at || e.created_at)));
    if (!bucket) continue;
    const amount = Number(e.amount) || 0;
    const category = e.category || 'Other';
    rows.push({ bucket, category, amount });
    byCat[category] = (byCat[category] || 0) + amount;
  }
  const ranked = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const named = ranked.slice(0, 3).map(([category]) => category);
  const rest = ranked.slice(3).reduce((sum, [, amount]) => sum + amount, 0);
  for (const b of buckets) b.parts = [0, 0, 0, 0];
  for (const r of rows) {
    const at = named.indexOf(r.category);
    r.bucket.parts[at === -1 ? 3 : at] += r.amount;
  }
  return {
    bars: buckets.map((b) => ({ label: b.label, parts: b.parts, total: b.parts.reduce((a, c) => a + c, 0) })),
    legend: [...ranked.slice(0, 3).map(([category, amount]) => ({ category, amount })), ...(rest > 0 ? [{ category: 'Other', amount: rest }] : [])],
    total: ranked.reduce((sum, [, amount]) => sum + amount, 0),
  };
}

/** Bars built from rounded segments, as in the reference: no axes, just the days. */
function StackedBars({ bars, label }) {
  const max = Math.max(...bars.map((b) => b.total), 1);
  return (
    <div role="img" aria-label={`${label}: ${bars.map((b) => `${b.label} ${inr(b.total)}`).join(', ')}`}>
      <div className="flex h-44 items-end gap-2">
        {bars.map((b) => (
          <div key={b.label} className="flex h-full min-w-0 flex-1 flex-col justify-end">
            <div className="flex flex-col gap-[3px]" style={{ height: `${b.total > 0 ? Math.max(6, (b.total / max) * 100) : 0}%` }}>
              {b.parts.map((amount, i) => amount > 0 && (
                <span key={SERIES[i]} className={`min-h-1 rounded-md ${SERIES[i]}`} style={{ flexGrow: amount, flexBasis: 0 }} />
              ))}
            </div>
            {b.total === 0 && <span className="h-1 rounded-full bg-surface-3" />}
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex gap-2 text-[11px] text-ink-2">
        {bars.map((b) => <span key={b.label} className="min-w-0 flex-1 truncate text-center">{b.label}</span>)}
      </div>
    </div>
  );
}

/** Four small actions inside the plan card. */
function ActionTiles({ actions }) {
  return (
    <div className={`mt-4 grid gap-2 ${actions.length === 4 ? 'grid-cols-4' : 'grid-cols-2'}`}>
      {actions.map((a) => (
        <button key={a.label} type="button" onClick={a.onClick} aria-pressed={a.on} aria-label={a.name}
          className={`v-press v-tile ${a.on ? 'bg-ink text-bg' : ''}`}>
          <a.icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}

/** One line of the allocation list: icon, name, share, amount and a status word. */
function AllocationRow({ icon: Icon, title, sub, amount, status, tone = 'text-ink-2' }) {
  return (
    <li className="v-item">
      <span className="v-item-icon"><Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{title}</span>
        <span className="block truncate text-xs text-ink-2">{sub}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-semibold tabular-nums text-ink">{amount}</span>
        <span className={`block text-xs ${tone}`}>{status}</span>
      </span>
    </li>
  );
}

function Illustration({ illustration }) {
  const [rate, setRate] = useState(0.06);
  const [years, setYears] = useState(5);
  const [monthly, setMonthly] = useState(String(illustration.monthlyAmount || 1000));
  const amount = Math.max(0, Math.min(10000000, Number(monthly) || 0));

  const series = useMemo(() => {
    const points = [];
    const step = Math.max(1, Math.round((years * 12) / 20));
    for (let m = 0; m <= years * 12; m += step) {
      points.push({ label: m % 12 === 0 ? `${m / 12}y` : `${m}m`, putIn: amount * m, value: Math.round(futureValue(amount, m / 12, rate)) });
    }
    return points;
  }, [amount, rate, years]);

  const final = futureValue(amount, years, rate);
  const putIn = amount * years * 12;

  const basis = illustration.basis === 'savings_target'
    ? 'Starting from your monthly savings target.'
    : illustration.basis === 'average_leftover'
      ? 'Starting from what your average spending leaves under your budget.'
      : 'Enter an amount to see how regular saving compounds.';

  return (
    <motion.section variants={cardVariants}>
      <p className="text-xs text-ink-3"><span className="font-semibold text-warn">Hypothetical.</span> {basis}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="v-field-label">
          Monthly amount
          <span className="relative mt-1.5 block">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">₹</span>
            <input type="number" inputMode="numeric" min="0" step="100" value={monthly} onChange={(e) => setMonthly(e.target.value)}
              className="v-input pl-7 font-mono" />
          </span>
        </label>
        <div className="v-field-label" role="radiogroup" aria-label="Assumed yearly rate">
          Assumed yearly rate
          <div className="v-seg mt-1.5 flex w-full [&>button]:flex-1">
            {RATES.map((r) => (
              <button key={r} type="button" role="radio" aria-checked={rate === r} onClick={() => setRate(r)}>{Math.round(r * 100)}%</button>
            ))}
          </div>
        </div>
        <div className="v-field-label" role="radiogroup" aria-label="Time range">
          Time range
          <div className="v-seg mt-1.5 flex w-full [&>button]:flex-1">
            {HORIZONS.map((y) => (
              <button key={y} type="button" role="radio" aria-checked={years === y} onClick={() => setYears(y)}>{y}y</button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 h-44" role="img" aria-label="Illustration of saved amount growing at the assumed rate">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 6, right: 4, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="illus" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="var(--v-accent)" stopOpacity={0.18} />
                <stop offset="95%" stopColor="var(--v-accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={CHART.tick} />
            <YAxis axisLine={false} tickLine={false} tick={CHART.tick} tickFormatter={compactInr} width={52} />
            <Tooltip contentStyle={CHART.tooltip} labelStyle={CHART.tooltipLabel} itemStyle={CHART.tooltipItem} formatter={(v, name) => [inr(v), name === 'value' ? 'Illustrated value' : 'Put in']} />
            <Area type="monotone" dataKey="putIn" stroke="var(--v-ink-3)" strokeDasharray="4 4" fill="none" />
            <Area type="monotone" dataKey="value" stroke="var(--v-accent)" strokeWidth={2} fill="url(#illus)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-3 text-sm">
        <div><dt className="text-xs text-ink-3">Put in over {years} year{years === 1 ? '' : 's'}</dt><dd className="mt-0.5 font-mono font-semibold tabular-nums text-ink">{inr(putIn)}</dd></div>
        <div><dt className="text-xs text-ink-3">At a constant {Math.round(rate * 100)}% a year</dt><dd className="mt-0.5 font-mono font-semibold tabular-nums text-accent">{inr(final)}</dd></div>
      </dl>
      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-3">
        <Info className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
        Illustration only, not a forecast or recommendation. Real investments do not grow at a constant rate, can lose value, and have costs and taxes not shown.
      </p>
    </motion.section>
  );
}

function Unavailable() {
  return <Surface><p className="text-sm text-ink-2">This isn't available right now. Try again in a moment.</p></Surface>;
}

export default function Wealth() {
  const { session, user } = useAuth();
  const minor = Boolean(user?.birth_year_month) && ageFrom(user.birth_year_month) < ADULT_AGE;
  const [wealth, setWealth] = useState(null);
  const [error, setError] = useState('');
  const [waking, setWaking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [shape, setShape] = useState(null);
  const [sti, setSti] = useState(null);
  const [score, setScore] = useState(null);
  const [open, setOpen] = useState(null); // 'invest' | 'sip' | 'shape' | 'score'
  const [tab, setTab] = useState('plan'); // 'plan' | 'spending'
  const [range, setRange] = useState('7d');
  const navigate = useNavigate();
  // This month and the last seven days, for the Spending tab's bars and list.
  const { expenses, loading: expensesLoading, error: expensesError } = useExpenses();
  const stacks = useMemo(() => (range === '6m' ? null : buildStacks(expenses, range)), [expenses, range]);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError('');
    try {
      // Month Shape and Safe-to-Invest are extras: if they fail, the screen still loads.
      const [data, shapeData, stiData, scoreData] = await Promise.all([
        apiJson('/wealth', { session, onRetry: () => setWaking(true) }),
        apiJson('/decisions/month-shape', { session }).catch(() => null),
        apiJson('/decisions/safe-to-invest', { session }).catch(() => null),
        apiJson('/paisa-score', { session }).catch(() => null),
      ]);
      setWealth(data.wealth);
      setShape(shapeData?.monthShape || null);
      setSti(stiData?.safeToInvest || null);
      setScore(scoreData?.paisaScore || null);
    } catch (err) {
      setError(friendlyError(err, "We couldn't load your wealth figures."));
    } finally {
      setWaking(false);
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { load(); }, [load]);

  if (loading && !wealth) {
    return (
      <div className="space-y-3 pb-4" aria-busy="true">
        <div className="flex justify-between"><Skeleton className="h-10 w-10 rounded-full" /><Skeleton className="h-10 w-24 rounded-full" /></div>
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="mt-2 h-56 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        {waking && <p className="text-center text-xs text-ink-3">Waking the server up, this can take up to a minute…</p>}
      </div>
    );
  }

  if (!wealth) {
    return <div className="pt-10"><ErrorState onRetry={load} /></div>;
  }

  const m = wealth.month;
  const noBudget = !m.budget;

  const shapeBadge = shape ? stateBadge(shape.state) : null;
  const toggle = (key) => setOpen((v) => (v === key ? null : key));
  const hasScore = typeof score?.total === 'number';

  const initials = String(user?.full_name || user?.name || 'V').split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const share = (n) => (m.budget > 0 ? `${Math.round((n / m.budget) * 100)}% of budget` : 'No budget set');
  const shapeTone = { good: 'text-accent', warn: 'text-warn', bad: 'text-danger' }[shapeBadge?.tone] || 'text-ink-2';
  const actions = [
    !minor && { key: 'invest', icon: Sprout, label: 'Invest', name: 'Safe to invest this month' },
    !minor && { key: 'sip', icon: TrendingUp, label: 'SIP test', name: 'SIP stress test' },
    { key: 'shape', icon: CalendarRange, label: 'Month', name: 'Month shape' },
    { key: 'score', icon: Gauge, label: 'Score', name: 'Spend Score' },
  ].filter(Boolean).map((a) => ({ ...a, on: open === a.key, onClick: () => toggle(a.key) }));

  // The Spending tab's figures for the chosen range.
  const sixMonths = range === '6m';
  const monthBars = wealth.history.map((h) => ({ label: h.label, parts: [0, h.spent, 0, 0], total: h.spent }));
  const bars = sixMonths ? monthBars : stacks.bars;
  const rangeTotal = sixMonths ? wealth.history.reduce((sum, h) => sum + h.spent, 0) : stacks.total;
  const legend = sixMonths
    ? [{ category: 'Average a month', amount: wealth.averageMonthlySpend ?? 0, series: 1 }, { category: 'This month so far', amount: m.spent, series: 3 }]
    : stacks.legend.map((l, i) => ({ ...l, series: i }));
  const expensesMissing = !sixMonths && Boolean(expensesError) && expenses.length === 0;
  const recent = expenses.slice(0, 4);

  return (
    <div className="space-y-5 pb-4 text-ink">
      <h1 className="sr-only">Your money plan</h1>
      <TopBar initials={initials} actions={[
        { icon: MessageCircle, label: 'Ask Vittova about your plan', onClick: () => navigate('/bot') },
        { icon: Bell, label: 'Debit reminders', onClick: () => navigate('/subscription-audit') },
      ]} />

      <div className="v-seg flex w-full [&>button]:min-h-10 [&>button]:flex-1" role="tablist" aria-label="Wealth">
        <button type="button" role="tab" aria-selected={tab === 'plan'} aria-pressed={tab === 'plan'} onClick={() => setTab('plan')}>Plan</button>
        <button type="button" role="tab" aria-selected={tab === 'spending'} aria-pressed={tab === 'spending'} onClick={() => setTab('spending')}>Spending</button>
      </div>

      {error && <p role="alert" className="v-error">{error}</p>}

      {tab === 'plan' ? (
        <>
          {/* What is left this month, how much of the budget is used, and the four checks */}
          <section className="v-block p-4" aria-label="This month">
            {noBudget ? (
              <p className="text-sm text-ink-soft">Set a monthly budget in <Link to="/settings" className="font-semibold text-ink underline">Profile</Link> to see what's left.</p>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-ink-2">Left in budget</p>
                  <p className="mt-1.5 text-[26px] font-semibold leading-none tabular-nums">{inr(m.leftAfterCommitments)}</p>
                  <p className="mt-2.5 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-2">
                    <ArrowUpRight className="h-3.5 w-3.5 text-warn" aria-hidden="true" />
                    <span className="font-medium text-warn">{inr(m.spent)} ({m.budgetUsedPercent}%)</span> spent this month
                  </p>
                </div>
                <BudgetGauge percent={m.budgetUsedPercent} />
              </div>
            )}
            {!noBudget && m.shortfall > 0 && <p className="mt-3 text-xs font-medium text-danger">Short by {inr(m.shortfall)} after bills and your savings target</p>}
            <ActionTiles actions={actions} />
          </section>

          {open === 'invest' && (sti ? <SafeToInvestCard sti={sti} variants={cardVariants} /> : <Unavailable />)}
          {open === 'sip' && <SipStressTestCard variants={cardVariants} />}
          {open === 'shape' && (shape ? <MonthShapeCard shape={shape} variants={cardVariants} /> : <Unavailable />)}
          {open === 'score' && (score ? <SpendScoreCard score={score} /> : <Unavailable />)}

          {/* Two figures at a glance */}
          <section aria-labelledby="glance-title">
            <div className="flex items-center justify-between">
              <h2 id="glance-title" className="v-h">At a glance</h2>
              <Link to="/transactions" className="v-press v-h-link">See activity</Link>
            </div>
            <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
              <div className="v-item min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet text-on-fill"><Receipt className="h-[18px] w-[18px]" aria-hidden="true" /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-ink">Average</span>
                  <span className="block truncate text-xs text-ink-2">{wealth.averageMonthlySpend !== null ? `${inr(wealth.averageMonthlySpend)} a month` : 'Not known yet'}</span>
                </span>
              </div>
              <div className="v-item min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warn text-on-fill"><Coins className="h-[18px] w-[18px]" aria-hidden="true" /></span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-ink">Round-ups</span>
                  <span className="block truncate text-xs text-accent">₹{wealth.roundUps.total.toLocaleString('en-IN')} (+₹{wealth.roundUps.thisMonth.toLocaleString('en-IN')})</span>
                </span>
              </div>
            </div>
          </section>

          {/* Where this month's budget is going */}
          {!noBudget && (
            <section aria-labelledby="allocation-title">
              <div className="flex items-center justify-between">
                <h2 id="allocation-title" className="v-h">This month's budget</h2>
                <Link to="/settings" className="v-press v-h-link">Edit budget</Link>
              </div>
              <ul className="space-y-2">
                <AllocationRow icon={Wallet} title="Spent" sub={share(m.spent)} amount={inr(m.spent)}
                  status={shapeBadge ? shapeBadge.label : `${m.daysLeft} day${m.daysLeft === 1 ? '' : 's'} left`} tone={shapeBadge ? shapeTone : 'text-ink-2'} />
                <AllocationRow icon={CalendarClock} title="Bills still due" sub={share(m.upcomingBills)} amount={inr(m.upcomingBills)}
                  status={m.upcomingBills > 0 ? 'To pay' : 'All paid'} tone={m.upcomingBills > 0 ? 'text-warn' : 'text-accent'} />
                <AllocationRow icon={PiggyBank} title="Savings target" sub={m.savingsTarget ? share(m.savingsTarget) : 'Set one in Profile'} amount={m.savingsTarget ? inr(m.savingsTarget) : '—'}
                  status={m.savingsTarget ? (m.shortfall > 0 ? 'At risk' : 'Set aside') : 'Not set'} tone={m.savingsTarget ? (m.shortfall > 0 ? 'text-danger' : 'text-accent') : 'text-ink-2'} />
              </ul>
            </section>
          )}

          <section aria-labelledby="more-title">
            <h2 id="more-title" className="v-h mb-2.5">Plan ahead</h2>
            <div className="v-block v-rows">
              <details className="group px-4 py-1">
                <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">
                  How regular saving grows
                  <ChevronDown className="h-4 w-4 text-ink-3 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="pb-3 pt-1"><Illustration illustration={wealth.illustration} /></div>
              </details>
              <Link to="/bot" className="v-press flex min-h-[52px] items-center justify-between px-4 text-sm font-medium">
                Ask Vittova about your plan <ChevronRight className="h-4 w-4 text-ink-3" aria-hidden="true" />
              </Link>
            </div>
          </section>
          <p className="text-xs leading-relaxed text-ink-3">From your budget and spending. Income and bank balances aren't tracked.</p>
        </>
      ) : (
        <>
          {/* Spending for the chosen range, split by category */}
          <section className="v-block p-4" aria-labelledby="total-title">
            <h2 id="total-title" className="text-[15px] font-semibold text-ink">Where it went</h2>
            <p className="mt-4 text-xs text-ink-2">{RANGE_TITLE[range]}</p>
            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="text-[26px] font-semibold leading-none tabular-nums">{inr(rangeTotal)}</span>
              {m.budget > 0 && <span className="text-xs text-ink-2">Budget: {inr(m.budget)} / month</span>}
            </p>
            <div className="mt-4 flex gap-1" role="radiogroup" aria-label="Period">
              {RANGES.map(([key, label]) => (
                <button key={key} type="button" role="radio" aria-checked={range === key} onClick={() => setRange(key)}
                  className={`min-h-10 min-w-11 rounded-lg px-3 text-xs font-medium ${range === key ? 'bg-surface-2 text-ink' : 'text-ink-2'}`}>{label}</button>
              ))}
            </div>
            <div className="mt-5">
              {expensesMissing ? (
                <p className="py-10 text-center text-sm text-ink-2">We couldn't load your expenses just now.</p>
              ) : !sixMonths && expensesLoading ? (
                <Skeleton className="h-44 w-full" />
              ) : rangeTotal === 0 ? (
                <p className="py-10 text-center text-sm text-ink-2">No expenses in this period yet.</p>
              ) : (
                <StackedBars bars={bars} label={RANGE_TITLE[range]} />
              )}
            </div>
            {!expensesMissing && rangeTotal > 0 && (
              <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                {legend.map((l) => (
                  <li key={l.category} className="flex items-center gap-2">
                    <span className={`h-3 w-1 shrink-0 rounded-full ${SERIES[l.series]}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-ink-soft">{l.category}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-ink">{inr(l.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            {sixMonths && <p className="mt-3 text-[11px] text-ink-3">The current month is still in progress.</p>}
          </section>

          {/* The latest expenses */}
          <section className="v-block p-4" aria-labelledby="history-title">
            <div className="flex items-center justify-between">
              <h2 id="history-title" className="text-[15px] font-semibold text-ink">Latest</h2>
              <Link to="/transactions" className="v-press v-h-link -my-2">View all</Link>
            </div>
            {expensesLoading ? <Skeleton className="mt-3 h-40 w-full" /> : recent.length === 0 ? (
              <p className="mt-3 text-sm text-ink-2">{expensesError ? "We couldn't load your expenses just now." : 'No expenses yet.'}</p>
            ) : (
              <ul className="v-rows mt-2">
                {recent.map((e) => (
                  <li key={e.id} className="flex min-h-[56px] items-center gap-3 py-2">
                    <CategoryIcon category={e.category || 'Other'} className="text-ink" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{expenseTitle(e)}</span>
                      <span className="block truncate text-xs text-ink-2">{expenseMeta(e)}</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{inr(e.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <InvestmentDisclaimer />
    </div>
  );
}
