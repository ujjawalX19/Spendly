/**
 * Wealth.jsx — Spendly v1 (REWRITE)
 * ─────────────────────────────────────────────────────────────
 * Real data from user's expenses, actual investable surplus,
 * SIP projections, goal-based plans with SEBI-compliant disclaimers.
 * Replaces the old hardcoded version.
 */

import { useState, useEffect, useCallback } from 'react';
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

const API_URL = import.meta.env.VITE_API_URL || 'https://spendly-t8s6.onrender.com/api';
const money = (v) => `₹${Math.round(Number(v) || 0).toLocaleString('en-IN')}`;

// SIP future value: M × {[(1+r)^n - 1] / r} × (1+r)
const sipFV = (monthly, years, annual = 0.12) => {
  const r = annual / 12;
  const n = years * 12;
  return monthly * (((1 + r) ** n - 1) / r) * (1 + r);
};

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 280, damping: 22 } },
};

function SipProjectionCard({ surplus }) {
  const sipAmount = Math.max(100, Math.floor(surplus / 100) * 100);
  const projections = [1, 3, 5].map(years => ({
    years,
    invested: sipAmount * years * 12,
    value: Math.round(sipFV(sipAmount, years)),
    returns: Math.round(sipFV(sipAmount, years) - sipAmount * years * 12),
  }));

  // Chart data for 5-year projection
  const chartData = [];
  for (let m = 0; m <= 60; m += 6) {
    const years = m / 12;
    chartData.push({
      month: `${m}m`,
      invested: sipAmount * m,
      projected: Math.round(sipFV(sipAmount, years)),
    });
  }

  return (
    <motion.div variants={cardVariants} className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
      <div className="flex items-center gap-2 font-bold text-white mb-1">
        <Calculator className="w-5 h-5 text-lime-400" />
        SIP Growth Projection
      </div>
      <p className="text-sm text-zinc-500 mb-5">
        If you invest {money(sipAmount)}/month at ~12% historical average return
      </p>

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
              <span className="text-xs text-lime-400 ml-2">(+{money(p.returns)})</span>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-zinc-600 mt-3">
        Based on historical Nifty 50 CAGR of ~12%. Actual returns may vary.
      </p>
    </motion.div>
  );
}

export default function Wealth() {
  const { session, user } = useAuth();
  const [safeToSpend, setSafeToSpend] = useState(null);
  const [burnRate, setBurnRate] = useState(null);
  const [loading, setLoading] = useState(true);

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
      const [stsRes, brRes] = await Promise.all([
        fetch(`${API_URL}/safe-to-spend`, { headers }).then(parseResponse),
        fetch(`${API_URL}/burn-rate`, { headers }).then(parseResponse),
      ]);

      if (stsRes.success) setSafeToSpend(stsRes.safeToSpend);
      if (brRes.success) setBurnRate(brRes.burnRate);
    } catch (err) {
      console.error('Wealth data fetch error:', err);
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
          <p className="text-zinc-500 text-sm">Loading your wealth data...</p>
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
        <p className="text-zinc-400 mt-1">Your savings, investments, and spending intelligence — all real data.</p>
      </motion.div>

      {/* Investable Surplus Hero */}
      <motion.div variants={cardVariants}
        className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur-xl"
      >
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-lime-400/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-400 mb-3">
            <Wallet className="h-4 w-4 text-lime-400" />
            Investable Surplus This Month
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-5xl font-extrabold tracking-tight text-white">{money(surplus)}</span>
            {surplus > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-lime-400/20 bg-lime-400/10 px-3 py-1.5 text-sm font-bold text-lime-400">
                <TrendingUp className="h-4 w-4" /> Safe to invest
              </span>
            )}
          </div>
          <p className="mt-3 text-sm text-zinc-400">
            Budget {money(monthlyBudget)} − Spent {money(burnRate?.totalSpent || 0)}
            {investmentTarget > 0 && ` − Investment goal ${money(investmentTarget)}`}
            {safeToSpend?.upcomingBills > 0 && ` − Bills ${money(safeToSpend.upcomingBills)}`}
          </p>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Chillar Savings */}
        <motion.div variants={cardVariants} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-white mb-3">
            <PiggyBank className="w-4 h-4 text-lime-400" /> Round-up Savings
          </div>
          <p className="text-3xl font-extrabold">{money(totalChillar)}</p>
          <p className="text-xs text-zinc-500 mt-1">Micro-savings from round-ups</p>
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
            {investmentTarget > 0 ? 'Set aside for investing' : 'Set a target in Settings'}
          </p>
        </motion.div>
      </div>

      {/* SIP Projection */}
      {surplus > 100 && <SipProjectionCard surplus={surplus} />}

      {surplus <= 100 && (
        <motion.div variants={cardVariants} className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
          <Sparkles className="w-6 h-6 text-amber-400 mb-3" />
          <h2 className="text-lg font-bold text-white">Build your surplus first</h2>
          <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
            Your investable surplus is {money(surplus)} this month. Focus on reducing spending to
            build a ₹500+ surplus before starting an SIP. Small steps add up!
          </p>
        </motion.div>
      )}

      {/* Quick Action */}
      <motion.div variants={cardVariants}>
        <a
          href="/bot"
          className="flex items-center justify-between rounded-2xl bg-lime-400 text-black p-4 font-bold hover:bg-lime-300 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-black/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-black">Get AI Investment Advice</p>
              <p className="text-xs font-bold text-black/60">Personalized plan based on your actual spending</p>
            </div>
          </div>
          <ArrowUpRight className="w-5 h-5" />
        </a>
      </motion.div>

      {/* SEBI Disclaimer */}
      <InvestmentDisclaimer />
    </motion.div>
  );
}
