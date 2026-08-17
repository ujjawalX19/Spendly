import { useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpRight,
  Coins,
  Gem,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const netWorth = 42500;
const monthlyGrowth = 12.5;
const roundUps = 3240;
const autoInvestTrigger = 5000;

const goals = [
  { name: 'New Laptop', target: 60000, saved: 15000, icon: Gem },
  { name: 'Emergency Fund', target: 10000, saved: 8500, icon: Wallet },
  { name: 'Goa Weekend', target: 18000, saved: 6300, icon: Sparkles },
];

const assets = [
  { name: 'Mutual Funds', allocation: 60, value: 25500, color: 'bg-lime-400' },
  { name: 'Stocks', allocation: 25, value: 10625, color: 'bg-sky-400' },
  { name: 'Crypto', allocation: 15, value: 6375, color: 'bg-violet-400' },
];

const portfolioHistory = [
  { month: 'Mar', value: 28500 },
  { month: 'Apr', value: 30100 },
  { month: 'May', value: 29200 },
  { month: 'Jun', value: 33500 },
  { month: 'Jul', value: 37800 },
  { month: 'Aug', value: 42500 },
];

const formatCurrency = (amount) => `₹${amount.toLocaleString('en-IN')}`;

function Wealth() {
  const [message, setMessage] = useState('');
  const roundUpProgress = Math.min((roundUps / autoInvestTrigger) * 100, 100);

  const handleAction = (action) => {
    setMessage(action === 'invest'
      ? 'Investment flow is ready for your next money move.'
      : 'Withdrawal options will appear here when you need them.');
  };

  return (
    <div className="min-h-screen bg-black p-4 md:p-6 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-lime-400">Wealth dashboard</p>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Make your money feel expensive.</h1>
          <p className="text-zinc-400">Your savings, investments, and tiny wins — all in one place.</p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur-xl transition-all duration-300 hover:border-zinc-700 lg:col-span-3">
            <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-lime-400/10 blur-3xl" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-400">
                  <Wallet className="h-4 w-4 text-lime-400" />
                  Total net worth
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-5xl font-extrabold tracking-tight text-white">{formatCurrency(netWorth)}</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-lime-400/20 bg-lime-400/10 px-3 py-1.5 text-sm font-bold text-lime-400">
                    <TrendingUp className="h-4 w-4" /> +{monthlyGrowth}% this month
                  </span>
                </div>
                <p className="mt-3 text-sm text-zinc-400">That is {formatCurrency(4730)} more than last month. Nice one.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => handleAction('invest')} className="inline-flex items-center gap-2 rounded-xl bg-lime-400 px-5 py-3 font-bold text-black transition-colors hover:bg-lime-300">
                  <ArrowUpRight className="h-4 w-4" /> Invest Now
                </button>
                <button onClick={() => handleAction('withdraw')} className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-5 py-3 font-bold text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800">
                  <ArrowDownToLine className="h-4 w-4" /> Withdraw
                </button>
              </div>
            </div>
            {message && <p className="relative mt-4 text-sm text-lime-300" role="status">{message}</p>}
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur-xl transition-all duration-300 hover:border-zinc-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold"><Coins className="h-5 w-5 text-lime-400" /> Spare Change Stash</div>
              <span className="rounded-lg bg-lime-400/10 p-2 text-lime-400"><Sparkles className="h-4 w-4" /></span>
            </div>
            <p className="mt-6 text-4xl font-extrabold">{formatCurrency(roundUps)}</p>
            <p className="mt-1 text-sm text-zinc-400">saved this month from round-ups</p>
            <div className="mt-6 h-3 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-lime-400 shadow-[0_0_10px_rgba(132,204,22,0.5)]" style={{ width: `${roundUpProgress}%` }} />
            </div>
            <p className="mt-3 text-sm text-zinc-400">{formatCurrency(roundUps)} / {formatCurrency(autoInvestTrigger)} to next auto-invest</p>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur-xl transition-all duration-300 hover:border-zinc-700">
            <div className="flex items-center gap-2 font-bold"><Target className="h-5 w-5 text-lime-400" /> Asset Allocation</div>
            <div className="mt-5 space-y-1">
              {assets.map((asset) => (
                <div key={asset.name} className="flex items-center justify-between border-b border-zinc-800/50 py-3 last:border-0">
                  <div className="flex items-center gap-3"><span className={`h-2.5 w-2.5 rounded-full ${asset.color}`} /><span className="text-sm text-zinc-300">{asset.name}</span></div>
                  <div className="text-right"><p className="text-sm font-bold">{asset.allocation}%</p><p className="text-xs text-zinc-500">{formatCurrency(asset.value)}</p></div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur-xl transition-all duration-300 hover:border-zinc-700 lg:col-span-2">
            <div className="flex items-center justify-between"><div><p className="flex items-center gap-2 font-bold"><TrendingUp className="h-5 w-5 text-lime-400" /> Portfolio performance</p><p className="mt-1 text-sm text-zinc-400">Your six-month money arc</p></div><span className="text-sm font-bold text-lime-400">+49.1%</span></div>
            <div className="mt-5 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={portfolioHistory} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                  <defs><linearGradient id="wealthFill" x1="0" x2="0" y1="0" y2="1"><stop offset="5%" stopColor="#a3e635" stopOpacity={0.35} /><stop offset="95%" stopColor="#a3e635" stopOpacity={0} /></linearGradient></defs>
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 12 }} tickFormatter={(value) => `₹${value / 1000}k`} />
                  <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: '12px' }} labelStyle={{ color: '#a1a1aa' }} formatter={(value) => [formatCurrency(value), 'Net worth']} />
                  <Area type="monotone" dataKey="value" stroke="#a3e635" strokeWidth={3} fill="url(#wealthFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur-xl transition-all duration-300 hover:border-zinc-700 lg:col-span-2">
            <div className="mb-5 flex items-center gap-2 font-bold"><Target className="h-5 w-5 text-lime-400" /> Financial Goals</div>
            <div className="grid gap-4 md:grid-cols-3">
              {goals.map((goal) => {
                const progress = Math.round((goal.saved / goal.target) * 100);
                const Icon = goal.icon;
                return <div key={goal.name} className="rounded-xl border border-zinc-800 bg-black/30 p-4"><div className="flex items-center justify-between"><span className="text-sm font-bold">{goal.name}</span><Icon className="h-4 w-4 text-zinc-400" /></div><p className="mt-4 text-xl font-extrabold">{formatCurrency(goal.saved)}</p><p className="mt-1 text-xs text-zinc-400">of {formatCurrency(goal.target)} target · {progress}%</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-lime-400" style={{ width: `${progress}%` }} /></div></div>;
              })}
            </div>
          </section>

          <aside className="rounded-2xl border border-lime-400/20 bg-lime-400/5 p-6 backdrop-blur-xl transition-all duration-300 hover:border-lime-400/40">
            <Sparkles className="h-6 w-6 text-lime-400" />
            <h2 className="mt-4 text-lg font-bold">Level-up move</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">You’re only {formatCurrency(autoInvestTrigger - roundUps)} away from an automatic investment. Your spare change is doing more work than it looks.</p>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default Wealth;
