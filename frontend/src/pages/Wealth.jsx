/**
 * Wealth.jsx — Spendly v1 (REWRITE)
 * ─────────────────────────────────────────────────────────────
 * What is left of this month's budget, round-ups and the user's own savings
 * target, from real data. The compounding chart is an illustration with a
 * user-chosen assumed rate — never a forecast and never tied to a product.
 * See FINANCIAL_CONTENT_REVIEW.md.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  TrendingUp, Wallet, Target, Sparkles, ArrowUpRight,
  Calculator, Loader2, PiggyBank
} from 'lucide-react';
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import InvestmentDisclaimer from '../components/InvestmentDisclaimer';
import { API_URL as API_BASE_URL, apiFetch } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';

const API_URL = API_BASE_URL;
const money = (v) => `₹${Math.round(Number(v) || 0).toLocaleString('en-IN')}`;

// Future value of a fixed monthly contribution at a constant assumed rate:
// M × {[(1+r)^n - 1] / r} × (1+r). Real returns are not constant and can be negative.
const ASSUMED_RATES = [0.04, 0.06, 0.08, 0.1];
const sipFV = (monthly, years, annual) => {
  if (annual === 0) return monthly * years * 12;
  const r = annual / 12;
  const n = years * 12;
  return monthly * (((1 + r) ** n - 1) / r) * (1 + r);
};

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 280, damping: 22 } },
};

function SipProjectionCard({ surplus }) {
  const [rate, setRate] = useState(0.06);
  const sipAmount = Math.max(100, Math.floor(surplus / 100) * 100);
  const projections = [1, 3, 5].map(years => ({
    years,
    invested: sipAmount * years * 12,
    value: Math.round(sipFV(sipAmount, years, rate)),
    returns: Math.round(sipFV(sipAmount, years, rate) - sipAmount * years * 12),
  }));

  // Chart data for 5-year projection
  const chartData = [];
  for (let m = 0; m <= 60; m += 6) {
    const years = m / 12;
    chartData.push({
      month: `${m}m`,
      invested: sipAmount * m,
      projected: Math.round(sipFV(sipAmount, years, rate)),
    });
  }

  return (
    <motion.div variants={cardVariants} className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
      <div className="flex items-center gap-2 font-bold text-white mb-1">
        <Calculator className="w-5 h-5 text-lime-400" />
        How regular saving compounds
      </div>
      <p className="text-sm text-zinc-500 mb-3">
        An illustration: {money(sipAmount)} put aside every month, growing at a constant assumed rate.
      </p>
      <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-zinc-400" role="radiogroup" aria-label="Assumed yearly growth rate">
        Assumed rate:
        {ASSUMED_RATES.map((r) => (
          <button key={r} type="button" role="radio" aria-checked={rate === r} onClick={() => setRate(r)}
            className={`rounded-lg border px-2.5 py-1 font-bold ${rate === r ? 'border-lime-400 bg-lime-400 text-black' : 'border-zinc-700 bg-zinc-800 text-zinc-300'}`}>
            {Math.round(r * 100)}%
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="h-44 mb-5">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="sipFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="#a3e635" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#a3e635" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 11 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 11 }}
              tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: '12px' }}
              labelStyle={{ color: '#a1a1aa' }}
              formatter={(v) => [money(v), '']}
            />
            <Area type="monotone" dataKey="invested" stroke="#71717a" strokeWidth={1.5} strokeDasharray="4 4" fill="none" name="Invested" />
            <Area type="monotone" dataKey="projected" stroke="#a3e635" strokeWidth={2.5} fill="url(#sipFill)" name="Projected" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Projection table */}
      <div className="space-y-2">
        {projections.map(p => (
          <div key={p.years} className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
            <span className="text-sm text-zinc-400">{p.years} year{p.years > 1 ? 's' : ''}</span>
            <div className="text-right">
              <span className="text-sm font-bold text-white font-mono">{money(p.value)}</span>
              <span className="text-xs text-zinc-500 ml-2">({money(p.invested)} put in)</span>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-zinc-600 mt-3">
        Illustration only, not a forecast or a recommendation. Real investments do not grow at a constant rate, can lose value, and involve costs and taxes not shown here.
      </p>
    </motion.div>
  );
}

export default function Wealth() {
  const { session, user } = useAuth();
  const [safeToSpend, setSafeToSpend] = useState(null);
  const [burnRate, setBurnRate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [waking, setWaking] = useState(false);

  const fetchData = useCallback(async () => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }

    try {
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const parseResponse = async (response) => {
        if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
        return response.json();
      };
      // The API sleeps on Render's free tier; the first request of the day
      // gets a 502 while it wakes. Retry rather than blaming the network.
      const onRetry = () => setWaking(true);
      const [stsRes, brRes] = await Promise.all([
        apiFetch(`${API_URL}/safe-to-spend`, { headers }, { onRetry }).then(parseResponse),
        apiFetch(`${API_URL}/burn-rate`, { headers }, { onRetry }).then(parseResponse),
      ]);
      setWaking(false);

      if (stsRes.success) setSafeToSpend(stsRes.safeToSpend);
      if (brRes.success) setBurnRate(brRes.burnRate);
    } catch (err) {
      console.error('Wealth data fetch error:', err);
      setLoadError(friendlyError(err, "We couldn't load your wealth figures. Check your connection and try again."));
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const monthlyBudget = user?.monthly_budget || 5000;
  const totalChillar = parseFloat(user?.total_chillar || 0);
  const investmentTarget = user?.investment_target || 0;
  const surplus = Math.max(0, Number(safeToSpend?.remaining ?? monthlyBudget - (burnRate?.totalSpent || 0)) || 0);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-lime-400 animate-spin mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">
            {waking ? 'Waking the server up — this can take a moment…' : 'Loading your wealth data...'}
          </p>
        </div>
      </div>
    );
  }

  // Showing zeros after a failed load would read as "you have no money
  // tracked", which is a lie. Say what actually happened instead.
  if (loadError) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-sm rounded-2xl border border-red-500/25 bg-red-500/10 p-5 text-center">
          <p role="alert" className="text-sm text-red-100">{loadError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-xl bg-red-500/20 px-4 py-2.5 text-xs font-bold text-red-100"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="min-h-screen bg-black p-4 md:p-6 text-white space-y-5 pb-28"
      initial="hidden" animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
    >
      {/* Header */}
      <motion.div variants={cardVariants}>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-lime-400">Wealth Dashboard</p>
        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl mt-1">Make your money feel expensive.</h1>
        <p className="text-zinc-400 mt-1">What's left this month, your round-ups and your savings target, from your own data.</p>
      </motion.div>

      {/* Investable Surplus Hero */}
      <motion.div variants={cardVariants}
        className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur-xl"
      >
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-lime-400/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-400 mb-3">
            <Wallet className="h-4 w-4 text-lime-400" />
            Left in this month's budget
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-5xl font-extrabold tracking-tight text-white">{money(surplus)}</span>
          </div>
          <p className="mt-3 text-sm text-zinc-400">
            Budget {money(monthlyBudget)} − Spent {money(burnRate?.totalSpent || 0)}
            {investmentTarget > 0 && ` − Savings target ${money(investmentTarget)}`}
            {safeToSpend?.upcomingBills > 0 && ` − Bills ${money(safeToSpend.upcomingBills)}`}
          </p>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Chillar Savings */}
        <motion.div variants={cardVariants} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-white mb-3">
            <PiggyBank className="w-4 h-4 text-lime-400" /> Round-ups
          </div>
          <p className="text-3xl font-extrabold">{money(totalChillar)}</p>
          <p className="text-xs text-zinc-500 mt-1">Spare change to the next ₹5, for you to set aside</p>
        </motion.div>

        {/* Investment Target */}
        <motion.div variants={cardVariants} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-white mb-3">
            <Target className="w-4 h-4 text-sky-400" /> Monthly Target
          </div>
          <p className="text-3xl font-extrabold">
            {investmentTarget > 0 ? money(investmentTarget) : '—'}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            {investmentTarget > 0 ? 'Your monthly savings target' : 'Set a target in Settings'}
          </p>
        </motion.div>
      </div>

      {/* SIP Projection */}
      {surplus > 100 && <SipProjectionCard surplus={surplus} />}

      {surplus <= 100 && (
        <motion.div variants={cardVariants} className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
          <Sparkles className="w-6 h-6 text-amber-400 mb-3" />
          <h2 className="text-lg font-bold text-white">Not much left this month</h2>
          <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
            About {money(surplus)} of this month's budget is left after spending and bills. Many people build an
            emergency fund before putting money into investments that can go down in value.
          </p>
        </motion.div>
      )}

      {/* Quick Action */}
      <motion.div variants={cardVariants}>
        <Link
          to="/bot"
          className="flex items-center justify-between rounded-2xl bg-lime-400 text-black p-4 font-bold hover:bg-lime-300 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-black/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-black">Ask the money coach</p>
              <p className="text-xs font-bold text-black/60">Questions about your spending and money basics</p>
            </div>
          </div>
          <ArrowUpRight className="w-5 h-5" />
        </Link>
      </motion.div>

      {/* Education disclaimer */}
      <InvestmentDisclaimer />
    </motion.div>
  );
}
