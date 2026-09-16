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
import { Wallet, Target, PiggyBank, Calculator, Loader2, ArrowUpRight, Info, RefreshCw } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import InvestmentDisclaimer from '../components/InvestmentDisclaimer';
import { apiJson } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';

const inr = (v) => `₹${Math.round(Number(v) || 0).toLocaleString('en-IN')}`;
const compactInr = (v) => (Math.abs(v) >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : Math.abs(v) >= 1000 ? `₹${Math.round(v / 1000)}k` : `₹${Math.round(v)}`);

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

export default function Wealth() {
  const { session } = useAuth();
  const [wealth, setWealth] = useState(null);
  const [error, setError] = useState('');
  const [waking, setWaking] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiJson('/wealth', { session, onRetry: () => setWaking(true) });
      setWealth(data.wealth);
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
      <div className="flex min-h-[60vh] items-center justify-center" role="status">
        <div className="text-center">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-lime-400" />
          <p className="text-sm text-zinc-500">{waking ? 'Waking the server up, this can take up to a minute…' : 'Loading your figures…'}</p>
        </div>
      </div>
    );
  }

  if (!wealth) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-sm rounded-2xl border border-red-500/25 bg-red-500/10 p-5 text-center">
          <p role="alert" className="text-sm text-red-100">{error || "We couldn't load your wealth figures."}</p>
          <button type="button" onClick={load} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-500/20 px-4 py-2.5 text-xs font-bold text-red-100">
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      </div>
    );
  }

  const m = wealth.month;
  const noBudget = !m.budget;

  return (
    <motion.div className="space-y-5 pb-4 text-white" initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.06 } } }}>
      <motion.header variants={cardVariants}>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-lime-400">Wealth</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Where your money stands</h1>
        <p className="mt-1 text-sm text-zinc-400">From the expenses and budget you've set in Vittova. Income, bank balances and investments aren't tracked.</p>
      </motion.header>

      {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}

      <motion.section variants={cardVariants} className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-lime-400/10 blur-3xl" />
        <div className="relative">
          <div className="mb-2 flex items-center gap-2 text-sm text-zinc-400"><Wallet className="h-4 w-4 text-lime-400" /> Left in this month's budget</div>
          {noBudget ? (
            <p className="text-sm text-zinc-300">Set a monthly budget in <Link to="/settings" className="text-lime-400 underline">Settings</Link> to see what's left.</p>
          ) : (
            <>
              <p className="text-5xl font-extrabold tracking-tight">{inr(m.leftAfterCommitments)}</p>
              {m.shortfall > 0 && <p className="mt-1 text-sm font-bold text-rose-400">Short by {inr(m.shortfall)} after bills and your savings target</p>}
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                <div><dt className="text-xs text-zinc-500">Budget</dt><dd className="font-mono">{inr(m.budget)}</dd></div>
                <div><dt className="text-xs text-zinc-500">Spent</dt><dd className="font-mono">{inr(m.spent)} <span className="text-xs text-zinc-500">({m.budgetUsedPercent}%)</span></dd></div>
                <div><dt className="text-xs text-zinc-500">Bills still due</dt><dd className="font-mono">{inr(m.upcomingBills)}</dd></div>
                <div><dt className="text-xs text-zinc-500">Savings target</dt><dd className="font-mono">{inr(m.savingsTarget)}</dd></div>
              </dl>
              <p className="mt-2 text-xs text-zinc-500">{m.daysLeft} day{m.daysLeft === 1 ? '' : 's'} left this month</p>
            </>
          )}
        </div>
      </motion.section>

      <motion.section variants={cardVariants} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Spending, last 6 months</h2>
          {wealth.averageMonthlySpend !== null && <span className="text-xs text-zinc-500">Avg {inr(wealth.averageMonthlySpend)}/month</span>}
        </div>
        <HistoryChart history={wealth.history} budget={m.budget} />
        <p className="mt-2 text-[11px] text-zinc-500">The current month is still in progress. The budget line shows your current budget.</p>
      </motion.section>

      <div className="grid grid-cols-2 gap-3">
        <motion.div variants={cardVariants} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold"><PiggyBank className="h-4 w-4 text-lime-400" /> Round-ups</div>
          <p className="text-3xl font-extrabold">₹{wealth.roundUps.total.toLocaleString('en-IN')}</p>
          <p className="mt-1 text-xs text-zinc-500">+₹{wealth.roundUps.thisMonth.toLocaleString('en-IN')} this month. Spare change to set aside yourself; Vittova doesn't move money.</p>
        </motion.div>
        <motion.div variants={cardVariants} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold"><Target className="h-4 w-4 text-sky-400" /> Monthly target</div>
          <p className="text-3xl font-extrabold">{m.savingsTarget ? inr(m.savingsTarget) : '—'}</p>
          <p className="mt-1 text-xs text-zinc-500">{m.savingsTarget ? 'Set aside before Safe-to-Spend is calculated' : <Link to="/settings" className="underline">Set a target in Settings</Link>}</p>
        </motion.div>
      </div>

      <Illustration illustration={wealth.illustration} />

      <motion.div variants={cardVariants}>
        <Link to="/bot" className="flex items-center justify-between rounded-2xl bg-lime-400 p-4 font-bold text-black">
          <div>
            <p className="text-sm font-black">Ask Vittova AI</p>
            <p className="text-xs font-bold text-black/60">"How long to save ₹50,000?" · "Can I afford ₹3,000?"</p>
          </div>
          <ArrowUpRight className="h-5 w-5" />
        </Link>
      </motion.div>

      <InvestmentDisclaimer />
    </motion.div>
  );
}
