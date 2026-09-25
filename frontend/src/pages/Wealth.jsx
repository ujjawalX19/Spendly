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
import { Calculator, ArrowUpRight, Info } from 'lucide-react';
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

const inr = (v) => `₹${Math.round(Number(v) || 0).toLocaleString('en-IN')}`;

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 280, damping: 24 } },
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

function HistoryChart({ history, budget }) {
  const data = history.map((h) => ({ label: h.label, spent: h.spent, inProgress: h.inProgress }));
  const hasData = history.some((h) => h.transactions > 0);
  if (!hasData) {
    return <p className="py-10 text-center text-sm text-zinc-500">No expenses logged in the last six months yet.</p>;
  }
  return (
    <div className="h-52" role="img" aria-label="Monthly spending for the last six months">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="#27272a" vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#a1a1aa', fontSize: 11 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 11 }} tickFormatter={compactInr} width={52} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12 }}
            labelStyle={{ color: '#e4e4e7' }}
            formatter={(v, _n, item) => [inr(v), item?.payload?.inProgress ? 'Spent so far' : 'Spent']}
          />
          {budget > 0 && <ReferenceLine y={budget} stroke="#A3E635" strokeDasharray="5 4" label={{ value: 'Budget', fill: '#A3E635', fontSize: 10, position: 'insideTopRight' }} />}
          <Bar dataKey="spent" radius={[6, 6, 0, 0]} fill="#38bdf8" fillOpacity={0.85} />
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
    <motion.section variants={cardVariants} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center gap-2 font-bold text-white">
        <Calculator className="h-5 w-5 text-lime-400" /> How regular saving compounds
        <span className="ml-auto rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">Hypothetical</span>
      </div>
      <p className="mt-1 text-xs text-zinc-500">{basis}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-zinc-400">
          Monthly amount
          <span className="relative mt-1 block">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">₹</span>
            <input type="number" inputMode="numeric" min="0" step="100" value={monthly} onChange={(e) => setMonthly(e.target.value)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800 py-2 pl-7 pr-2 font-mono text-zinc-100 outline-none focus:border-lime-500/60" />
          </span>
        </label>
        <div className="text-xs text-zinc-400" role="radiogroup" aria-label="Assumed yearly rate">
          Assumed yearly rate
          <div className="mt-1 flex gap-1.5">
            {RATES.map((r) => (
              <button key={r} type="button" role="radio" aria-checked={rate === r} onClick={() => setRate(r)}
                className={`flex-1 rounded-lg border py-2 font-bold ${rate === r ? 'border-lime-400 bg-lime-400 text-black' : 'border-zinc-700 bg-zinc-800 text-zinc-300'}`}>{Math.round(r * 100)}%</button>
            ))}
          </div>
        </div>
        <div className="text-xs text-zinc-400" role="radiogroup" aria-label="Time range">
          Time range
          <div className="mt-1 flex gap-1.5">
            {HORIZONS.map((y) => (
              <button key={y} type="button" role="radio" aria-checked={years === y} onClick={() => setYears(y)}
                className={`flex-1 rounded-lg border py-2 font-bold ${years === y ? 'border-sky-400 bg-sky-400 text-black' : 'border-zinc-700 bg-zinc-800 text-zinc-300'}`}>{y}y</button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 h-44" role="img" aria-label="Illustration of saved amount growing at the assumed rate">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 6, right: 4, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="illus" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="#a3e635" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#a3e635" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#27272a" vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 11 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 11 }} tickFormatter={compactInr} width={52} />
            <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12 }} formatter={(v, name) => [inr(v), name === 'value' ? 'Illustrated value' : 'Put in']} />
            <Area type="monotone" dataKey="putIn" stroke="#71717a" strokeDasharray="4 4" fill="none" />
            <Area type="monotone" dataKey="value" stroke="#a3e635" strokeWidth={2.5} fill="url(#illus)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-zinc-950 p-3"><p className="text-xs text-zinc-500">Put in over {years} year{years === 1 ? '' : 's'}</p><p className="font-mono font-bold text-white">{inr(putIn)}</p></div>
        <div className="rounded-xl bg-zinc-950 p-3"><p className="text-xs text-zinc-500">At a constant {Math.round(rate * 100)}% a year</p><p className="font-mono font-bold text-lime-300">{inr(final)}</p></div>
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-[11px] text-zinc-500">
        <Info className="mt-px h-3 w-3 shrink-0" />
        Illustration only, not a forecast or recommendation. Real investments do not grow at a constant rate, can lose value, and have costs and taxes not shown.
      </p>
    </motion.section>
  );
}

function Unavailable() {
  return <Surface><p className="text-sm text-zinc-400">This isn't available right now. Try again in a moment.</p></Surface>;
}

export default function Wealth() {
  const { session } = useAuth();
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
        <Skeleton className="mt-2 h-56 w-full rounded-[20px]" />
        <Skeleton className="h-40 w-full rounded-[20px]" />
        {waking && <p className="text-center text-xs text-zinc-500">Waking the server up, this can take up to a minute…</p>}
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
    <div className="space-y-3 pb-4 text-white">
      <header>
        <h1 className="text-2xl font-black tracking-tight">Your money plan</h1>
        <p className="mt-1 text-sm text-zinc-400">From your budget and spending. Income and bank balances aren't tracked.</p>
      </header>

      {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}

      <Surface className="divide-y divide-white/[0.06] py-1">
        <Row label="Safe to invest this month" value={sti ? inr(sti.amount) : '—'} hint={open === 'invest' ? 'Hide' : 'How calculated'} onClick={() => toggle('invest')} />
        <Row label="SIP stress test" hint={open === 'sip' ? 'Hide' : 'Test a monthly SIP'} onClick={() => toggle('sip')} />
        <Row label="Month shape" hint={open === 'shape' ? 'Hide' : 'View month'} onClick={() => toggle('shape')}
          right={shapeBadge ? <StatusPill tone={shapeBadge.tone === 'good' ? 'good' : shapeBadge.tone === 'warn' ? 'warn' : 'bad'}>{shapeBadge.label}</StatusPill> : null} />
        <Row label="Spend Score" value={hasScore ? `${score.total}/${score.max || 100}` : '—'} hint={open === 'score' ? 'Hide' : 'Why this score'} onClick={() => toggle('score')} />
      </Surface>

      {open === 'invest' && (sti ? <SafeToInvestCard sti={sti} variants={cardVariants} /> : <Unavailable />)}
      {open === 'sip' && <SipStressTestCard variants={cardVariants} />}
      {open === 'shape' && (shape ? <MonthShapeCard shape={shape} variants={cardVariants} /> : <Unavailable />)}
      {open === 'score' && (score ? <SpendScoreCard score={score} /> : <Unavailable />)}

      <Surface>
        <SectionLabel>This month</SectionLabel>
        {noBudget ? (
          <p className="mt-2 text-sm text-zinc-300">Set a monthly budget in <Link to="/settings" className="text-lime-400 underline">Profile</Link> to see what's left.</p>
        ) : (
          <>
            <p className="mt-2"><span className="font-mono-finance text-3xl font-black">{inr(m.leftAfterCommitments)}</span> <span className="text-sm font-semibold text-zinc-400">left in budget</span></p>
            {m.shortfall > 0 && <p className="mt-1 text-sm font-bold text-rose-300">Short by {inr(m.shortfall)} after bills and your savings target</p>}
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div><dt className="text-xs text-zinc-500">Budget</dt><dd className="font-mono">{inr(m.budget)}</dd></div>
              <div><dt className="text-xs text-zinc-500">Spent</dt><dd className="font-mono">{inr(m.spent)} <span className="text-xs text-zinc-500">({m.budgetUsedPercent}%)</span></dd></div>
              <div><dt className="text-xs text-zinc-500">Bills still due</dt><dd className="font-mono">{inr(m.upcomingBills)}</dd></div>
              <div><dt className="text-xs text-zinc-500">Savings target</dt><dd className="font-mono">{m.savingsTarget ? inr(m.savingsTarget) : '—'}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-zinc-500">{m.daysLeft} day{m.daysLeft === 1 ? '' : 's'} left · Round-ups ₹{wealth.roundUps.total.toLocaleString('en-IN')} (+₹{wealth.roundUps.thisMonth.toLocaleString('en-IN')} this month)</p>
          </>
        )}
      </Surface>

      <details className="group rounded-[20px] border border-white/[0.06] bg-[#111113] p-4">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between text-sm font-bold">
          Spending, last 6 months
          <span className="text-xs font-semibold text-zinc-500 group-open:hidden">{wealth.averageMonthlySpend !== null ? `Avg ${inr(wealth.averageMonthlySpend)}/month · Show` : 'Show'}</span>
        </summary>
        <div className="mt-2">
          <HistoryChart history={wealth.history} budget={m.budget} />
          <p className="mt-2 text-[11px] text-zinc-500">The current month is still in progress. The line is your current budget.</p>
        </div>
      </details>

      <details className="group rounded-[20px] border border-white/[0.06] bg-[#111113] p-4">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between text-sm font-bold">
          How regular saving grows <span className="text-xs font-semibold text-zinc-500 group-open:hidden">Show</span>
        </summary>
        <div className="mt-2"><Illustration illustration={wealth.illustration} /></div>
      </details>

      <Link to="/bot" className="v-press flex min-h-[52px] items-center justify-between rounded-[20px] border border-white/[0.06] bg-[#111113] px-4 text-sm font-bold">
        Ask Vittova about your plan <ArrowUpRight className="h-4 w-4 text-lime-300" />
      </Link>

      <InvestmentDisclaimer />
    </div>
  );
}
