/**
 * Wealth — what the user's own data says about their money, and nothing more.
 *
 * Vittova does not know income, bank balances or investments, so this screen
 * never shows portfolio values or performance. Everything is from
 * GET /api/wealth; the only projection is labelled a hypothetical illustration
 * with an assumed rate the user picks. See FINANCIAL_CONTENT_REVIEW.md.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import InvestmentDisclaimer from '../components/InvestmentDisclaimer';
import { apiJson } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';
import { compactInr } from '../lib/moneyDisplay';
import { MonthShapeCard, SafeToInvestCard, SipStressTestCard } from '../components/MoneyDecisionCards';
import SpendScoreCard from '../components/SpendScoreCard';
import { ErrorState, Row, SectionLabel, Skeleton, StatusPill, Surface } from '../components/ui';
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

function HistoryChart({ history, budget }) {
  const data = history.map((h) => ({ label: h.label, spent: h.spent, inProgress: h.inProgress }));
  const hasData = history.some((h) => h.transactions > 0);
  if (!hasData) {
    return <p className="py-10 text-center text-sm text-ink-3">No expenses logged in the last six months yet.</p>;
  }
  return (
    <div className="h-48" role="img" aria-label="Monthly spending for the last six months">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={CHART.tick} />
          <YAxis axisLine={false} tickLine={false} tick={CHART.tick} tickFormatter={compactInr} width={52} />
          <Tooltip
            cursor={{ fill: 'var(--v-surface-2)' }}
            contentStyle={CHART.tooltip}
            labelStyle={CHART.tooltipLabel}
            itemStyle={CHART.tooltipItem}
            formatter={(v, _n, item) => [inr(v), item?.payload?.inProgress ? 'Spent so far' : 'Spent']}
          />
          {budget > 0 && <ReferenceLine y={budget} stroke="var(--v-accent)" strokeDasharray="4 4" label={{ value: 'Budget', fill: 'var(--v-accent)', fontSize: 10, position: 'insideTopRight' }} />}
          <Bar dataKey="spent" radius={[4, 4, 0, 0]} fill="var(--v-ink-2)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
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
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
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

  return (
    <div className="space-y-6 pb-4 text-ink">
      <header>
        <h1 className="text-2xl font-bold">Your money plan</h1>
        <p className="mt-1 text-sm text-ink-2">From your budget and spending. Income and bank balances aren't tracked.</p>
      </header>

      {error && <p role="alert" className="v-error">{error}</p>}

      <section>
        <SectionLabel className="mb-2">This month</SectionLabel>
        <Surface>
          {noBudget ? (
            <p className="text-sm text-ink-soft">Set a monthly budget in <Link to="/settings" className="font-semibold text-ink underline">Profile</Link> to see what's left.</p>
          ) : (
            <>
              <p className="text-[13px] text-ink-2">Left in budget</p>
              <p className="mt-1 font-display text-[34px] font-bold leading-none tabular-nums">{inr(m.leftAfterCommitments)}</p>
              {m.shortfall > 0 && <p className="mt-2 text-sm font-semibold text-danger">Short by {inr(m.shortfall)} after bills and your savings target</p>}
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3 text-sm">
                <div><dt className="text-xs text-ink-3">Budget</dt><dd className="mt-0.5 font-mono tabular-nums">{inr(m.budget)}</dd></div>
                <div><dt className="text-xs text-ink-3">Spent</dt><dd className="mt-0.5 font-mono tabular-nums">{inr(m.spent)} <span className="text-xs text-ink-3">({m.budgetUsedPercent}%)</span></dd></div>
                <div><dt className="text-xs text-ink-3">Bills still due</dt><dd className="mt-0.5 font-mono tabular-nums">{inr(m.upcomingBills)}</dd></div>
                <div><dt className="text-xs text-ink-3">Savings target</dt><dd className="mt-0.5 font-mono tabular-nums">{m.savingsTarget ? inr(m.savingsTarget) : '—'}</dd></div>
              </dl>
              <p className="mt-3 text-xs text-ink-3">{m.daysLeft} day{m.daysLeft === 1 ? '' : 's'} left · Round-ups ₹{wealth.roundUps.total.toLocaleString('en-IN')} (+₹{wealth.roundUps.thisMonth.toLocaleString('en-IN')} this month)</p>
            </>
          )}
        </Surface>
      </section>

      <section className="space-y-3">
      <SectionLabel>Checks</SectionLabel>
      <Surface className="v-rows py-1">
        {!minor && <Row label="Safe to invest this month" value={sti ? inr(sti.amount) : '—'} hint={open === 'invest' ? 'Hide' : 'How calculated'} onClick={() => toggle('invest')} />}
        {!minor && <Row label="SIP stress test" hint={open === 'sip' ? 'Hide' : 'Test a monthly SIP'} onClick={() => toggle('sip')} />}
        <Row label="Month shape" hint={open === 'shape' ? 'Hide' : 'View month'} onClick={() => toggle('shape')}
          right={shapeBadge ? <StatusPill tone={shapeBadge.tone === 'good' ? 'good' : shapeBadge.tone === 'warn' ? 'warn' : 'bad'}>{shapeBadge.label}</StatusPill> : null} />
        <Row label="Spend Score" value={hasScore ? `${score.total}/${score.max || 100}` : '—'} hint={open === 'score' ? 'Hide' : 'Why this score'} onClick={() => toggle('score')} />
      </Surface>

      {open === 'invest' && (sti ? <SafeToInvestCard sti={sti} variants={cardVariants} /> : <Unavailable />)}
      {open === 'sip' && <SipStressTestCard variants={cardVariants} />}
      {open === 'shape' && (shape ? <MonthShapeCard shape={shape} variants={cardVariants} /> : <Unavailable />)}
      {open === 'score' && (score ? <SpendScoreCard score={score} /> : <Unavailable />)}
      </section>

      <section>
        <SectionLabel className="mb-2">Trends</SectionLabel>
        <div className="v-block v-rows">
          <details className="group px-4 py-1">
            <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">
              Spending, last 6 months
              <span className="flex items-center gap-1 text-xs text-ink-3">
                <span className="group-open:hidden">{wealth.averageMonthlySpend !== null ? `Avg ${inr(wealth.averageMonthlySpend)}/month` : ''}</span>
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
              </span>
            </summary>
            <div className="pb-3 pt-1">
              <HistoryChart history={wealth.history} budget={m.budget} />
              <p className="mt-2 text-[11px] text-ink-3">The current month is still in progress. The line is your current budget.</p>
            </div>
          </details>

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

      <InvestmentDisclaimer />
    </div>
  );
}
