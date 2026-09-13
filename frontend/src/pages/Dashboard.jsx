/**
 * Dashboard.jsx — Spendly
 * ─────────────────────────────────────────────────────────────
 * Pixel-perfect Figma-to-code conversion.
 * Stack: React 19 + Tailwind CSS 4 + Framer Motion + Lucide React
 * Data:  useExpenses (Supabase) + usePaymentNotifications (Capacitor UPI)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import {
  TrendingUp, Camera, ChevronRight,
  Flame, Zap, ShoppingCart, Tv, ShoppingBag, AlertCircle,
  Plus, X, Check, Wallet, Lightbulb, CircleDollarSign, CheckCircle
} from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';
import { useExpenses } from '../hooks/useExpenses';
import { usePaymentNotifications } from '../hooks/usePaymentNotifications';
import PermissionBanner from '../components/PermissionBanner';
import { API_URL, apiFetch } from '../lib/apiConfig';
import { localDateKey } from '../lib/dates';

// ─── ANIMATION VARIANTS ───────────────────────────────────────
const pageVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 28, scale: 0.96 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring', stiffness: 280, damping: 22, mass: 0.9 },
  },
};
const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
};

// ─── COUNT-UP HOOK ────────────────────────────────────────────
function useCountUp(target, duration = 1100) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    const to = target;
    prev.current = to;
    if (from === to) { setDisplay(to); return; }
    const t0 = performance.now();
    function tick(now) {
      const p = Math.min((now - t0) / duration, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(tick);
      else setDisplay(to);
    }
    requestAnimationFrame(tick);
  }, [target, duration]);
  return display;
}

// ─── UTILITY COMPONENTS ──────────────────────────────────────
function AnimatedRupee({ value, className = '' }) {
  const n = useCountUp(value);
  return (
    <span className={`font-mono-finance tabular-nums ${className}`}>
      {'\u20b9'}{Math.round(n).toLocaleString('en-IN')}
    </span>
  );
}

function AnimatedNum({ value, className = '' }) {
  const n = useCountUp(value);
  return (
    <span className={`font-mono-finance tabular-nums ${className}`}>
      {Math.round(n)}
    </span>
  );
}

function UserAvatar({ name }) {
  const initials = (name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  return (
    <motion.div
      className="relative cursor-pointer shadow-[0_0_20px_rgba(163,230,53,0.6)] rounded-full"
      whileHover={{ scale: 1.07 }}
      whileTap={{ scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 360, damping: 18 }}
    >
      <div className="relative w-11 h-11 rounded-full bg-gradient-to-br from-[#a3e635] to-[#84cc16]
                      flex items-center justify-center text-sm font-black text-black">
        {initials}
      </div>
      <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-[#a3e635] rounded-full
                      border-2 border-black" />
    </motion.div>
  );
}

const CATEGORY_META = {
  Food:          { icon: ShoppingCart, bg: 'bg-orange-500/15', color: 'text-orange-400' },
  Entertainment: { icon: Tv,           bg: 'bg-purple-500/15', color: 'text-purple-400' },
  Grocery:       { icon: ShoppingBag,  bg: 'bg-green-500/15',  color: 'text-green-400'  },
  Shopping:      { icon: ShoppingBag,  bg: 'bg-pink-500/15',   color: 'text-pink-400'   },
  Other:         { icon: Wallet,       bg: 'bg-zinc-700/60',   color: 'text-zinc-400'   },
};
function getCategoryMeta(cat) { return CATEGORY_META[cat] || CATEGORY_META.Other; }

function formatRelativeDate(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const oneDay = 86400000;
  const isToday = d.toDateString() === now.toDateString();
  const isYesterday = new Date(now - oneDay).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (isToday) return `Today, ${time}`;
  if (isYesterday) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
}

function StreakDots({ current, total = 7 }) {
  return (
    <div className="flex items-center gap-1.5 mt-3">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.4 + i * 0.06, type: 'spring', stiffness: 500, damping: 20 }}
          className={`h-1.5 rounded-full ${
            i < current
              ? 'w-5 bg-orange-400 shadow-[0_0_6px_rgba(251,146,60,0.7)]'
              : 'w-3.5 bg-zinc-700'
          }`}
        />
      ))}
    </div>
  );
}

// ─── ADD EXPENSE MODAL ────────────────────────────────────────
const CATEGORIES = ['Food', 'Entertainment', 'Grocery', 'Shopping', 'Other'];

function AddExpenseModal({ onClose, onAdd, loading }) {
  const [form, setForm] = useState({ desc: '', amount: '', category: 'Food' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.desc || !form.amount) return;
    await onAdd(parseFloat(form.amount), form.category, form.desc);
    onClose();
  };

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-6 pb-8 shadow-2xl z-10"
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
      >
        <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-5 sm:hidden" />
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-zinc-100">Log Expense</h2>
          <motion.button onClick={onClose} whileTap={{ scale: 0.9 }}
            className="p-2 rounded-xl bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors">
            <X className="w-4 h-4" />
          </motion.button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-1.5 block">
              What did you spend on?
            </label>
            <input
              autoFocus type="text" placeholder="Zomato, Netflix, Swiggy..."
              value={form.desc}
              onChange={e => setForm({ ...form, desc: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-sm
                         text-zinc-100 placeholder:text-zinc-600 outline-none
                         focus:border-lime-500/60 focus:ring-2 focus:ring-lime-500/15 transition-all"
              required />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-1.5 block">
              Amount
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-sm">{'\u20b9'}</span>
              <input
                type="number" placeholder="0" value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl pl-8 pr-4 py-3 text-sm
                           text-zinc-100 placeholder:text-zinc-600 outline-none font-mono-finance
                           focus:border-lime-500/60 focus:ring-2 focus:ring-lime-500/15 transition-all"
                min="1" step="0.01" required />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-2 block">
              Category
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <motion.button key={cat} type="button" whileTap={{ scale: 0.92 }}
                  onClick={() => setForm({ ...form, category: cat })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                    form.category === cat
                      ? 'bg-lime-400 text-black border-lime-400 shadow-[0_0_10px_rgba(57,255,20,0.3)]'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600'
                  }`}>
                  {cat}
                </motion.button>
              ))}
            </div>
          </div>
          <motion.button type="submit" disabled={loading}
            whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.01 }}
            className="w-full bg-lime-400 hover:bg-lime-300 text-black font-black py-3.5 rounded-2xl
                       text-sm tracking-wide transition-all shadow-[0_0_20px_rgba(57,255,20,0.25)]
                       disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-2">
            {loading
              ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              : <><Check className="w-4 h-4" /> Add Expense</>}
          </motion.button>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ─── BUDGET CARD ──────────────────────────────────────────────
function BudgetCard({ totalSpent, monthlyBudget }) {
  const percent = Math.min(100, (totalSpent / monthlyBudget) * 100);
  const remaining = Math.max(0, monthlyBudget - totalSpent);
  const isCritical = percent >= 60;
  const isOver = totalSpent > monthlyBudget;

  return (
    <motion.div
      variants={cardVariants}
      className={`rounded-2xl p-5 relative overflow-hidden bg-[#141414] border-0`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-black/40">
            <Wallet className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-bold text-white">Monthly Budget</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black bg-[#f43f5e]/10 text-[#f43f5e] border border-[#f43f5e]/20">
          📉 {Math.round(percent)}% USED
        </div>
      </div>

      {/* Amounts */}
      <div className="flex items-baseline gap-2 mb-4">
        <AnimatedRupee value={totalSpent} className="text-3xl font-black text-white" />
        <span className="text-[#a1a1aa] text-base font-medium">/</span>
        <span className="text-[#a1a1aa] text-base font-mono-finance tabular-nums">
          {'\u20b9'}{monthlyBudget.toLocaleString('en-IN')}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-black h-3 rounded-full overflow-hidden mb-3">
        <motion.div
          className={`h-full rounded-full ${
            isOver
              ? 'bg-gradient-to-r from-[#e11d48] to-[#f43f5e]'
              : isCritical
                ? 'bg-gradient-to-r from-[#e11d48] via-[#f43f5e] to-[#fb7185]'
                : 'bg-gradient-to-r from-[#65a30d] to-[#a3e635]'
          }`}
          style={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        />
      </div>

      {/* Alert */}
      {isCritical ? (
        <div className="flex items-center gap-1.5 mt-2">
          <AlertCircle className="w-4 h-4 text-[#f43f5e] shrink-0" />
          <span className="text-xs text-[#a1a1aa]">
            <span className="font-bold text-white">Aukatt Alert:</span> Only{' '}
            <span className="text-[#f43f5e] font-bold">{'\u20b9'}{remaining.toLocaleString('en-IN')}</span> left! 📉
          </span>
        </div>
      ) : (
        <p className="text-xs text-[#a1a1aa] mt-2">
          <span className="text-[#a3e635] font-bold">{'\u20b9'}{remaining.toLocaleString('en-IN')}</span> remaining this month
        </p>
      )}
    </motion.div>
  );
}

// ─── STREAK CARD ──────────────────────────────────────────────
function StreakCard({ streakDays }) {
  return (
    <motion.div
      variants={cardVariants}
      className="rounded-2xl p-4 bg-[#141414] relative overflow-hidden"
    >
      <div className="w-10 h-10 rounded-xl bg-[#ea580c]/20 flex items-center justify-center mb-3">
        <Flame className="w-5 h-5 text-[#f97316]" />
      </div>
      <div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-black text-[#f97316]">{streakDays} Days</span>
          <span className="text-[#f97316] font-black uppercase text-sm">SAFE</span>
        </div>
        <p className="text-xs text-[#a1a1aa] font-bold mt-1">Finance Streak</p>
      </div>
      <StreakDots current={Math.min(streakDays, 6)} total={6} />
    </motion.div>
  );
}

// ─── MICRO-SAVINGS CARD ──────────────────────────────────────
function ChillarCard({ totalChillar, todayRoundup }) {
  return (
    <motion.div
      variants={cardVariants}
      className="rounded-2xl p-4 bg-[#141414] relative overflow-hidden flex flex-col justify-between"
    >
      <div>
        <div className="w-10 h-10 rounded-xl bg-[#84cc16]/20 flex items-center justify-center mb-3">
          <CircleDollarSign className="w-5 h-5 text-[#a3e635]" />
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-black text-[#a3e635]">{'\u20b9'}{totalChillar}</span>
          <span className="text-[#a3e635] font-black uppercase text-sm">ROUND-UPS</span>
        </div>
        <p className="text-xs text-[#a1a1aa] font-bold mt-1">Spare change to the next ₹5, for you to set aside</p>
      </div>
      {todayRoundup > 0 && (
        <div className="mt-3 inline-flex items-center w-max bg-[#84cc16]/20 text-[#a3e635] text-xs font-bold px-2.5 py-1 rounded-full">
          +{'\u20b9'}{todayRoundup} today
        </div>
      )}
    </motion.div>
  );
}

// ─── SCAN BILL CTA ────────────────────────────────────────────
function ScanBillCTA({ onScan, loading, fileInputRef }) {
  return (
    <motion.div variants={cardVariants}>
      <input type="file" accept="image/*" capture="environment"
        className="hidden" ref={fileInputRef} onChange={onScan} />
      <motion.button
        onClick={() => fileInputRef.current?.click()}
        disabled={loading}
        whileTap={{ scale: 0.97 }}
        whileHover={{ scale: 1.01 }}
        className="w-full rounded-2xl bg-[#a3e635] text-black py-4 px-5 flex items-center justify-between
                   disabled:opacity-60 disabled:cursor-wait cursor-pointer"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-black/20 flex items-center justify-center shrink-0">
            {loading
              ? <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
              : <Camera className="w-6 h-6 text-black" />}
          </div>
          <div className="text-left">
            <p className="text-[16px] font-black tracking-tight leading-tight">
              {loading ? 'Scanning Bill...' : 'Scan Bill with AI'}
            </p>
            <p className="text-[13px] font-bold text-black/60 mt-0.5">
              Split instantly with your squad
            </p>
          </div>
        </div>
        <ChevronRight className="w-6 h-6 text-black/60 shrink-0" />
      </motion.button>
    </motion.div>
  );
}

// ─── RECENT KALESH ──────────────────────────────────────────
function RecentExpenses({ expenses, loading }) {
  const navigate = useNavigate();
  const recent = expenses.slice(0, 4);
  const recentCount = expenses.filter(e => Date.now() - new Date(e.occurred_at || e.created_at) < 3 * 86400000).length;

  return (
    <motion.div variants={cardVariants} className="rounded-2xl bg-[#141414] p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="text-lg font-black text-white">Recent Expenses</span>
          {recentCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-[#f43f5e] text-white text-[11px] font-black
                             flex items-center justify-center">
              {Math.min(recentCount, 9)}
            </span>
          )}
        </div>
        <button type="button" onClick={() => navigate('/transactions')} className="text-[13px] font-bold text-[#a1a1aa] hover:text-white flex items-center gap-0.5 transition-colors">
          View All <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-4 animate-pulse">
              <div className="w-12 h-12 rounded-xl bg-[#27272a]" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-[#27272a] rounded w-3/5" />
                <div className="h-2 bg-[#27272a] rounded w-2/5" />
              </div>
              <div className="h-3 bg-[#27272a] rounded w-12" />
            </div>
          ))}
        </div>
      ) : recent.length === 0 ? (
        <div className="py-8 text-center">
          <div className="text-3xl mb-2">🎉</div>
          <p className="text-[#a1a1aa] text-sm font-bold">No expenses yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {recent.map((exp, idx) => {
            const meta = getCategoryMeta(exp.category);
            const Icon = meta.icon;
            return (
              <motion.div key={exp.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.07, type: 'spring', stiffness: 300, damping: 24 }}
                className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl bg-black flex items-center justify-center shrink-0`}>
                  <Icon className={`w-5 h-5 ${meta.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold text-white truncate leading-tight">
                    {exp.description}
                  </p>
                  <p className="text-xs text-[#a1a1aa] font-medium mt-1">{formatRelativeDate(exp.occurred_at || exp.created_at)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono-finance tabular-nums font-black text-[#f43f5e] text-[15px] leading-tight">
                    {'\u20b9'}{parseFloat(exp.amount).toLocaleString('en-IN')}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#a1a1aa] mt-1">
                    {exp.category}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

// ─── AI DOST TIP ──────────────────────────────────────────
function AiTipCard({ expenses }) {
  // A simple rule on this month's own data. No figure is shown unless it
  // comes from the user's expenses.
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const foodSpend = expenses
    .filter(e => e.category === 'Food' && new Date(e.occurred_at || e.created_at) >= monthStart)
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  if (foodSpend < 500) return null;
  const tenPercent = Math.round(foodSpend * 0.1);

  return (
    <motion.div
      variants={cardVariants}
      className="rounded-2xl bg-[#141414] p-4 flex items-center gap-4"
    >
      <div className="w-12 h-12 rounded-xl bg-black flex items-center justify-center shrink-0">
        <Lightbulb className="w-6 h-6 text-[#a3e635]" />
      </div>
      <div className="min-w-0">
        <p className="text-[15px] font-bold text-white leading-tight">Budget tip</p>
        <p className="text-[13px] font-semibold text-[#a1a1aa] mt-1">
          You've spent {'\u20b9'}{Math.round(foodSpend).toLocaleString('en-IN')} on food this month. Trimming it by 10% frees up <span className="text-[#a3e635]">{'\u20b9'}{tenPercent.toLocaleString('en-IN')}</span>.
        </p>
      </div>
    </motion.div>
  );
}

// ─── SAFE-TO-SPEND HERO ───────────────────────────────────
function SafeToSpendCard({ safeData }) {
  if (!safeData) return null;
  const isNeg = safeData.isNegative;

  return (
    <motion.div
      variants={cardVariants}
      className={`rounded-2xl p-5 relative overflow-hidden ${
        isNeg ? 'bg-gradient-to-br from-red-950 to-[#141414]' : 'bg-gradient-to-br from-[#1a2e05] to-[#141414]'
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-wider text-[#a1a1aa] mb-1">
        You can safely spend today
      </p>
      <div className="flex items-baseline gap-2">
        <span className={`text-4xl font-black font-mono-finance tabular-nums ${
          isNeg ? 'text-[#f43f5e]' : 'text-[#a3e635]'
        }`}>
          {'\u20b9'}{safeData.daily.toLocaleString('en-IN')}
        </span>
      </div>
      <p className="text-xs text-[#a1a1aa] mt-2">
        {isNeg
          ? `Over budget by \u20b9${safeData.overBy.toLocaleString('en-IN')} this month`
          : `\u20b9${safeData.remaining.toLocaleString('en-IN')} remaining · ${safeData.daysRemaining} days left`}
      </p>
      {safeData.upcomingBills > 0 && (
        <p className="text-[10px] text-[#71717a] mt-1">
          Upcoming bills: {'\u20b9'}{safeData.upcomingBills.toLocaleString('en-IN')}
        </p>
      )}
    </motion.div>
  );
}

// ─── BURN RATE CARD ───────────────────────────────────────
function BurnRateCard({ burnData }) {
  if (!burnData || !burnData.willGoBroke) return null;

  return (
    <motion.div
      variants={cardVariants}
      className="rounded-2xl p-4 bg-[#141414] border border-red-500/15"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
          <AlertCircle className="w-5 h-5 text-[#f43f5e]" />
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-[#f43f5e] leading-tight">
            {burnData.budgetRemaining < 0
              ? `Over budget by \u20b9${Math.abs(burnData.budgetRemaining).toLocaleString('en-IN')}`
              : `At this pace your budget runs out around ${burnData.brokeDate}`}
          </p>
          {burnData.cutSuggestion && (
            <p className="text-xs text-[#a1a1aa] mt-1">
              {burnData.cutSuggestion.message}
            </p>
          )}
          <p className="text-[10px] text-[#71717a] mt-1">Spending forecast based on your pace so far this month.</p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── SPEND SCORE WIDGET ───────────────────────────────────
const SCORE_LABELS = {
  budgetDiscipline: 'Budget discipline',
  dailyConsistency: 'Daily consistency',
  spendingStability: 'Spending stability',
  savingsConsistency: 'Savings consistency',
  loggingHabit: 'Logging habit',
};

function SpendScoreCard({ score }) {
  const [open, setOpen] = useState(false);
  if (!score) return null;
  const hasScore = typeof score.total === 'number';
  const pct = hasScore ? Math.round((score.total / (score.max || 100)) * 100) : 0;
  const circumference = 2 * Math.PI * 32;
  const strokeDash = (pct / 100) * circumference;

  return (
    <motion.div variants={cardVariants} className="rounded-2xl p-4 bg-[#141414] relative overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-4 text-left">
        <div className="relative w-20 h-20 shrink-0">
          <svg viewBox="0 0 72 72" className="w-full h-full -rotate-90" aria-hidden="true">
            <circle cx="36" cy="36" r="32" fill="none" stroke="#27272a" strokeWidth="5" />
            {hasScore && (
              <circle cx="36" cy="36" r="32" fill="none" stroke="#a3e635" strokeWidth="5"
                strokeLinecap="round" strokeDasharray={circumference}
                strokeDashoffset={circumference - strokeDash}
                className="transition-all duration-1000 ease-out" />
            )}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-black text-white">{hasScore ? score.total : '—'}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">Spend Score <span className="text-[#71717a] font-semibold">/ {score.max || 100}</span></p>
          <p className="text-xs text-[#a1a1aa] mt-0.5">
            {hasScore ? 'Tap to see why you got this score' : 'Not enough data for a score yet'}
          </p>
          {typeof score.change === 'number' && score.change !== 0 && (
            <p className={`text-xs font-bold mt-1 ${score.change > 0 ? 'text-[#a3e635]' : 'text-[#f43f5e]'}`}>
              {score.change > 0 ? '+' : ''}{score.change} since last week
            </p>
          )}
        </div>
        <ChevronRight className={`h-4 w-4 text-[#71717a] transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="mt-4 space-y-3 border-t border-white/5 pt-3">
          {!hasScore && score.insufficientReasons?.length > 0 && (
            <ul className="list-disc space-y-1 pl-4 text-xs text-[#a1a1aa]">
              {score.insufficientReasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
          {Object.entries(score.components || {}).map(([key, c]) => (
            <div key={key}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white">{SCORE_LABELS[key] || key}</span>
                <span className="font-mono text-[#a1a1aa]">{c.available ? `${c.score}/100` : 'n/a'}</span>
              </div>
              {c.available && (
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#27272a]">
                  <div className="h-full rounded-full bg-[#a3e635]" style={{ width: `${c.score}%` }} />
                </div>
              )}
              <p className="mt-1 text-[11px] text-[#71717a]">{c.explanation}</p>
            </div>
          ))}
          {score.disclaimer && <p className="text-[10px] text-[#52525b]">{score.disclaimer}</p>}
        </div>
      )}
    </motion.div>
  );
}



// ─── UPI TOAST ────────────────────────────────────────────────
// Copy that matches what actually happened. The native parser classifies
// each notification, so money received must never be announced as spending.
const PAYMENT_COPY = {
  EXPENSE: { title: 'Payment detected', action: 'Log it', verb: 'spent' },
  INCOME: { title: 'Money received', action: 'Log it', verb: 'received' },
  REFUND: { title: 'Refund received', action: 'Log it', verb: 'refunded' },
};

function PaymentToast({ payment, queued, onAdd, onDismiss, saving }) {
  const copy = PAYMENT_COPY[payment.kind] || PAYMENT_COPY.EXPENSE;
  const uncertain = payment.needsConfirmation;
  const [amount, setAmount] = useState(String(payment.amount));
  const isExpense = payment.kind === 'EXPENSE';
  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= 10000000;
  const when = new Date(payment.timestamp);

  return (
    <motion.div
      initial={{ opacity: 0, y: -60, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -40, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
      className="fixed top-4 inset-x-4 z-[300] max-w-sm mx-auto
                 bg-zinc-900 border border-lime-500/30 rounded-2xl p-4
                 shadow-[0_0_30px_rgba(57,255,20,0.2)] backdrop-blur-xl"
      role="dialog"
      aria-label={copy.title}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-lime-500/15 flex items-center justify-center shrink-0 mt-0.5">
          <Zap className="w-5 h-5 text-lime-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-zinc-100">
            {uncertain ? `${copy.title}: please check` : copy.title}
            {queued > 1 && <span className="ml-2 text-[11px] font-semibold text-zinc-500">1 of {queued}</span>}
          </p>
          <p className="text-xs text-zinc-400 mt-0.5 truncate">
            {payment.merchant && payment.merchant !== 'Unknown' ? payment.merchant : 'Unknown payee'}
            {payment.app ? ` · ${payment.app}` : ''} · {when.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
          </p>
          {isExpense ? (
            <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
              Amount
              <span className="relative flex-1">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500">{'\u20b9'}</span>
                <input
                  type="number" inputMode="decimal" min="0.01" step="0.01" value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-1.5 pl-6 pr-2 font-mono text-zinc-100 outline-none focus:border-lime-500/60"
                />
              </span>
            </label>
          ) : (
            <p className="text-xs text-zinc-400 mt-1">{'\u20b9'}{Number(payment.amount).toLocaleString('en-IN')} {copy.verb}. Income isn't tracked yet, so this won't be added.</p>
          )}
          {uncertain && isExpense && (
            <p className="text-[11px] text-amber-400/90 mt-1">We couldn't read this one confidently. Check the amount before saving.</p>
          )}
        </div>
        <button onClick={onDismiss} aria-label="Dismiss" className="text-zinc-600 hover:text-zinc-400 p-1 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex gap-2 mt-3">
        {isExpense && (
          <motion.button whileTap={{ scale: 0.94 }} onClick={() => valid && onAdd(parsed)} disabled={!valid || saving}
            className="flex-1 bg-lime-400 text-black text-xs font-black py-2 rounded-xl hover:bg-lime-300 transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Add expense'}
          </motion.button>
        )}
        <motion.button whileTap={{ scale: 0.94 }} onClick={onDismiss}
          className="flex-1 bg-zinc-800 text-zinc-400 text-xs font-bold py-2 rounded-xl hover:bg-zinc-700 transition-colors">
          {isExpense ? 'Not an expense' : 'OK'}
        </motion.button>
      </div>
    </motion.div>
  );
}

// ─── GREETING ─────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Sup';
  if (h < 21) return 'Hey';
  return 'Yo';
}

// ═══════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════
export default function Dashboard() {
  const { user, session } = useAuth();
  const { expenses, loading, totalSpent, addExpense, addScannedExpense } = useExpenses();

  const [showAddModal, setShowAddModal]     = useState(false);
  const [addLoading, setAddLoading]         = useState(false);
  const [scanLoading, setScanLoading]       = useState(false);
  const [safeToSpend, setSafeToSpend]       = useState(null);
  const [burnRate, setBurnRate]             = useState(null);
  const [paisaScore, setPaisaScore]         = useState(null);
  const [scanToast, setScanToast]           = useState(null); // { type: 'success'|'error', message: string }
  const fileInputRef = useRef(null);


  // ── UPI Notifications ──────────────────────────────────────
  // Android Notification Access is only ever requested from an explicit tap on
  // "Enable". The dashboard must never send the user to Settings on its own.
  const {
    isSupported, permissionGranted, permissionChecked, pending, resolvePayment, openPermissionSettings,
  } = usePaymentNotifications();
  const pendingPayment = pending[0] || null;
  const [savingPayment, setSavingPayment] = useState(false);

  // ── Fetch v1 feature data ──────────────────────────────────
  useEffect(() => {
    if (!session?.access_token) return;
    const headers = { Authorization: `Bearer ${session.access_token}` };
    const parseResponse = (response) => {
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      return response.json();
    };

    // Fetch Safe-to-Spend
    apiFetch(`${API_URL}/safe-to-spend`, { headers })
      .then(parseResponse)
      .then(d => { if (d.success) setSafeToSpend(d.safeToSpend); })
      .catch(() => {});

    // Fetch Burn Rate
    apiFetch(`${API_URL}/burn-rate`, { headers })
      .then(parseResponse)
      .then(d => { if (d.success) setBurnRate(d.burnRate); })
      .catch(() => {});

    // Fetch Spend Score
    apiFetch(`${API_URL}/paisa-score`, { headers })
      .then(parseResponse)
      .then(d => { if (d.success) setPaisaScore(d.paisaScore); })
      .catch(() => {});

    // Record streak check-in for viewing safe-to-spend
    fetch(`${API_URL}/streaks/check-in`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity: 'check_safe_to_spend' }),
    }).catch(() => {});
  }, [session]);

  // ── Derived Values ─────────────────────────────────────────
  const monthlyBudget = user?.monthly_budget || 5000;
  const streakDays    = user?.streak_current  || 0;
  const totalChillar  = parseFloat(user?.total_chillar || 0);

  const today = localDateKey(new Date());
  const todayRoundup = expenses
    .filter(e => localDateKey(new Date(e.occurred_at || e.created_at)) === today)
    .reduce((s, e) => s + (parseFloat(e.roundup_chillar) || 0), 0);

  // ── Handlers ───────────────────────────────────────────────
  const handleAddExpense = async (amount, category, description) => {
    setAddLoading(true);
    try { await addExpense(amount, category, description); }
    finally { setAddLoading(false); }
  };

  // Auto-dismiss scan toast after 3 seconds
  useEffect(() => {
    if (!scanToast) return;
    const t = setTimeout(() => setScanToast(null), 3000);
    return () => clearTimeout(t);
  }, [scanToast]);

  const handleScanFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanLoading(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      try {
        const result = await addScannedExpense({ scannedTotal: 0, merchantName: 'Receipt Scan', imageBase64: reader.result });
        if (result?.success) {
          setScanToast({ type: 'success', message: 'Bill scanned and added!' });
        } else {
          setScanToast({ type: 'error', message: result?.message || 'Failed to scan bill.' });
        }
      } catch (err) {
        console.error('Scan failed:', err);
        setScanToast({ type: 'error', message: 'Scan failed. Please try again.' });
      } finally {
        setScanLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
  }, [addScannedExpense]);

  const handleLogUpiPayment = async (confirmedAmount) => {
    if (!pendingPayment || savingPayment) return;
    const payment = pendingPayment;

    // Income and refunds are never recorded as spending.
    if (payment.kind !== 'EXPENSE') {
      await resolvePayment(payment.fingerprint);
      return;
    }

    const merchant = payment.merchant && payment.merchant !== 'Unknown' ? payment.merchant : 'UPI payment';
    setSavingPayment(true);
    const result = await addExpense(confirmedAmount, 'Other', merchant.slice(0, 200), {
      source: 'upi_auto',
      occurredAt: new Date(payment.timestamp).toISOString(),
    });
    setSavingPayment(false);

    if (result.success) {
      await resolvePayment(payment.fingerprint);
    } else {
      // Keep it in the queue so the user can retry.
      setScanToast({ type: 'error', message: result.message || 'Could not save that payment.' });
    }
  };

  const firstName = (user?.full_name || user?.name || 'buddy').split(' ')[0];

  // ── RENDER ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black text-white pb-28">

      {/* UPI Toast */}
      <AnimatePresence>
        {pendingPayment && (
          <PaymentToast
            key={pendingPayment.fingerprint}
            payment={pendingPayment}
            queued={pending.length}
            saving={savingPayment}
            onAdd={handleLogUpiPayment}
            onDismiss={() => resolvePayment(pendingPayment.fingerprint)}
          />
        )}
      </AnimatePresence>

      {/* Scan Toast */}
      <AnimatePresence>
        {scanToast && (
          <motion.div
            initial={{ opacity: 0, y: -60, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -40, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            className={`fixed top-4 inset-x-4 z-[300] max-w-sm mx-auto
                       rounded-2xl p-4 shadow-xl backdrop-blur-xl border ${
                         scanToast.type === 'success'
                           ? 'bg-zinc-900 border-lime-500/30 shadow-[0_0_30px_rgba(57,255,20,0.15)]'
                           : 'bg-zinc-900 border-red-500/30 shadow-[0_0_30px_rgba(239,68,68,0.15)]'
                       }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                scanToast.type === 'success' ? 'bg-lime-500/15' : 'bg-red-500/15'
              }`}>
                {scanToast.type === 'success'
                  ? <CheckCircle className="w-5 h-5 text-lime-400" />
                  : <AlertCircle className="w-5 h-5 text-red-400" />}
              </div>
              <p className={`text-sm font-bold ${
                scanToast.type === 'success' ? 'text-lime-400' : 'text-red-400'
              }`}>{scanToast.message}</p>
              <button onClick={() => setScanToast(null)} className="ml-auto text-zinc-600 hover:text-zinc-400 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <AddExpenseModal
            onClose={() => setShowAddModal(false)}
            onAdd={handleAddExpense}
            loading={addLoading}
          />
        )}
      </AnimatePresence>

      {/* ─── MAIN CONTENT ─── */}
      <motion.div
        className="max-w-lg mx-auto px-4 pt-6 space-y-4"
        variants={pageVariants}
        initial="hidden"
        animate="visible"
      >
        {/* HEADER */}
        <motion.header variants={fadeUp} className="flex items-center justify-between pt-2 pb-1">
          <div>
            <h1 className="text-3xl font-black text-white leading-tight tracking-tight">
              {getGreeting()}, {firstName}
            </h1>
            <p className="text-[13px] text-[#a1a1aa] mt-1 font-bold uppercase tracking-wider">Financial Rizz Status</p>
          </div>
          <UserAvatar name={user?.full_name || user?.name} />
        </motion.header>

        {/* NOTIFICATION PERMISSION BANNER */}
        <PermissionBanner
          isSupported={isSupported}
          permissionGranted={permissionGranted}
          permissionChecked={permissionChecked}
          onEnable={openPermissionSettings}
        />

        {/* SAFE-TO-SPEND HERO */}
        <SafeToSpendCard safeData={safeToSpend} />

        {/* BUDGET CARD */}
        <BudgetCard totalSpent={totalSpent} monthlyBudget={monthlyBudget} />

        {/* BURN RATE ALERT */}
        <BurnRateCard burnData={burnRate} />

        {/* BENTO GRID */}
        <div className="grid grid-cols-2 gap-3">
          <StreakCard streakDays={streakDays} />
          <ChillarCard totalChillar={totalChillar} todayRoundup={todayRoundup} />
        </div>

        {/* SPEND SCORE */}
        <SpendScoreCard score={paisaScore} />

        {/* SCAN CTA */}
        <ScanBillCTA onScan={handleScanFile} loading={scanLoading} fileInputRef={fileInputRef} />

        {/* RECENT EXPENSES */}
        <RecentExpenses expenses={expenses} loading={loading} />

        {/* AI TIP */}
        <AiTipCard expenses={expenses} />

        <div className="h-4" />
      </motion.div>

      {/* FLOATING + FAB */}
      <motion.button
        onClick={() => setShowAddModal(true)}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.6, type: 'spring', stiffness: 380, damping: 20 }}
        whileTap={{ scale: 0.88 }}
        whileHover={{ scale: 1.08, boxShadow: '0 0 30px rgba(57,255,20,0.5)' }}
        className="fixed bottom-24 right-5 z-[100] w-14 h-14 rounded-full bg-lime-400 text-black
                   flex items-center justify-center shadow-[0_4px_24px_rgba(57,255,20,0.4)]
                   transition-shadow cursor-pointer"
        aria-label="Add expense"
      >
        <Plus className="w-7 h-7" strokeWidth={3} />
      </motion.button>


    </div>
  );
}
