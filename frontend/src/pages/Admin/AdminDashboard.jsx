/**
 * AdminDashboard.jsx — Spendly Admin Portal
 * ─────────────────────────────────────────────────────────────
 * High-level telemetry stats + User Management + Expense Audit.
 * Stack: React 19 + Tailwind CSS 4 + Framer Motion + Lucide React
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Users, Receipt, Ban, CheckCircle,
  Trash2, AlertTriangle, RefreshCw, ChevronDown,
  UserCheck, UserX, DollarSign, Activity
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || 'https://spendly-t8s6.onrender.com/api';

// ─── ANIMATION VARIANTS ───────────────────────────────────────
const pageVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring', stiffness: 260, damping: 22 },
  },
};
const rowVariants = {
  hidden: { opacity: 0, x: -14 },
  visible: (i) => ({
    opacity: 1, x: 0,
    transition: { delay: i * 0.04, type: 'spring', stiffness: 300, damping: 24 },
  }),
};

// ─── UTILITY ──────────────────────────────────────────────────
function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function truncateId(id) {
  if (!id) return '—';
  return `${id.slice(0, 8)}…`;
}

// ─── STAT CARD ────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, accent, bgAccent }) {
  return (
    <motion.div
      variants={cardVariants}
      className="rounded-2xl p-5 bg-zinc-900 border border-zinc-800 relative overflow-hidden group"
    >
      <div className={`absolute -right-6 -top-6 w-24 h-24 ${bgAccent} blur-2xl rounded-full
                        pointer-events-none group-hover:scale-125 transition-transform duration-500`} />
      <div className={`w-10 h-10 rounded-xl ${bgAccent} flex items-center justify-center mb-3 relative z-10`}>
        <Icon className={`w-5 h-5 ${accent}`} />
      </div>
      <div className="relative z-10">
        <p className={`text-3xl font-black ${accent} tabular-nums`}>{value}</p>
        <p className="text-xs text-zinc-500 font-semibold uppercase tracking-widest mt-1">{label}</p>
      </div>
    </motion.div>
  );
}

// ─── CONFIRM MODAL ────────────────────────────────────────────
function ConfirmModal({ title, message, confirmLabel, onConfirm, onCancel, danger }) {
  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <motion.div
        className="relative bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl z-10"
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            danger ? 'bg-red-500/15' : 'bg-lime-500/15'
          }`}>
            <AlertTriangle className={`w-5 h-5 ${danger ? 'text-red-400' : 'text-lime-400'}`} />
          </div>
          <h3 className="text-lg font-bold text-zinc-100">{title}</h3>
        </div>
        <p className="text-sm text-zinc-400 mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-400 text-sm font-bold
                       hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onConfirm}
            className={`flex-1 py-2.5 rounded-xl text-sm font-black transition-colors cursor-pointer ${
              danger
                ? 'bg-red-500 text-white hover:bg-red-400'
                : 'bg-lime-400 text-black hover:bg-lime-300'
            }`}
          >
            {confirmLabel}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function AdminDashboard() {
  const { session } = useAuth();

  const [users, setUsers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingExpenses, setLoadingExpenses] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);  // user-id or expense-id
  const [confirmAction, setConfirmAction] = useState(null);   // { type, id, ... }
  const [error, setError] = useState(null);

  // ── Auth Header ────────────────────────────────────────────
  const authHeader = useCallback(() => {
    const token = session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [session]);

  // ── Fetch Users ────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    setError(null);
    try {
      const { data } = await axios.get(`${API_BASE}/admin/users`, {
        headers: authHeader(),
      });
      if (data.success) setUsers(data.users);
    } catch (err) {
      console.error('Failed to fetch users:', err);
      setError('Failed to load users. Make sure you have admin privileges.');
    } finally {
      setLoadingUsers(false);
    }
  }, [authHeader]);

  // ── Fetch Expenses ─────────────────────────────────────────
  const fetchExpenses = useCallback(async () => {
    setLoadingExpenses(true);
    try {
      const { data } = await axios.get(`${API_BASE}/admin/expenses/recent`, {
        headers: authHeader(),
      });
      if (data.success) setExpenses(data.expenses);
    } catch (err) {
      console.error('Failed to fetch expenses:', err);
    } finally {
      setLoadingExpenses(false);
    }
  }, [authHeader]);

  useEffect(() => {
    fetchUsers();
    fetchExpenses();
  }, [fetchUsers, fetchExpenses]);

  // ── Toggle Ban ─────────────────────────────────────────────
  const handleToggleBan = async (userId) => {
    setActionLoading(userId);
    try {
      const { data } = await axios.post(
        `${API_BASE}/admin/users/${userId}/ban`,
        {},
        { headers: authHeader() }
      );
      if (data.success && data.user) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, ...data.user } : u))
        );
      }
    } catch (err) {
      console.error('Failed to toggle ban:', err);
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  // ── Delete Expense ─────────────────────────────────────────
  const handleDeleteExpense = async (expenseId) => {
    setActionLoading(expenseId);
    try {
      const { data } = await axios.delete(
        `${API_BASE}/admin/expenses/${expenseId}`,
        { headers: authHeader() }
      );
      if (data.success) {
        setExpenses((prev) => prev.filter((e) => e.id !== expenseId));
      }
    } catch (err) {
      console.error('Failed to delete expense:', err);
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  // ── Derived Stats ──────────────────────────────────────────
  const totalUsers = users.length;
  const bannedUsers = users.filter((u) => u.is_banned).length;
  const totalExpenses = expenses.length;
  const totalSpend = expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);

  // ── RENDER ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Confirm Modal */}
      <AnimatePresence>
        {confirmAction && (
          <ConfirmModal
            title={confirmAction.type === 'ban' ? (confirmAction.isBanned ? 'Unban User' : 'Ban User') : 'Delete Expense'}
            message={
              confirmAction.type === 'ban'
                ? confirmAction.isBanned
                  ? `Are you sure you want to unban "${confirmAction.name}"? They will regain access.`
                  : `Are you sure you want to ban "${confirmAction.name}"? They will lose access to the platform.`
                : 'This will permanently delete this expense record. This action cannot be undone.'
            }
            confirmLabel={
              confirmAction.type === 'ban'
                ? confirmAction.isBanned ? 'Unban' : 'Ban'
                : 'Delete'
            }
            danger={confirmAction.type === 'ban' ? !confirmAction.isBanned : true}
            onConfirm={() =>
              confirmAction.type === 'ban'
                ? handleToggleBan(confirmAction.id)
                : handleDeleteExpense(confirmAction.id)
            }
            onCancel={() => setConfirmAction(null)}
          />
        )}
      </AnimatePresence>

      <motion.div
        className="max-w-6xl mx-auto px-4 md:px-8 pt-6 pb-16 space-y-6"
        variants={pageVariants}
        initial="hidden"
        animate="visible"
      >
        {/* ── HEADER ── */}
        <motion.header variants={cardVariants} className="flex items-center justify-between pt-2 pb-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600
                            flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.3)]">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Admin Portal</h1>
              <p className="text-sm text-zinc-500 font-medium">Spendly Operations Dashboard</p>
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => { fetchUsers(); fetchExpenses(); }}
            className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400
                       hover:text-lime-400 hover:border-lime-500/30 transition-all cursor-pointer"
          >
            <RefreshCw className="w-5 h-5" />
          </motion.button>
        </motion.header>

        {/* ── ERROR BANNER ── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-2xl bg-red-500/10 border border-red-500/30 p-4 flex items-center gap-3"
            >
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── TELEMETRY STAT CARDS ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Users} label="Total Users" value={totalUsers}
            accent="text-blue-400" bgAccent="bg-blue-500/15" />
          <StatCard icon={UserX} label="Banned" value={bannedUsers}
            accent="text-red-400" bgAccent="bg-red-500/15" />
          <StatCard icon={Receipt} label="Recent Expenses" value={totalExpenses}
            accent="text-amber-400" bgAccent="bg-amber-500/15" />
          <StatCard icon={DollarSign} label="Total Spend"
            value={`₹${Math.round(totalSpend).toLocaleString('en-IN')}`}
            accent="text-lime-400" bgAccent="bg-lime-500/15" />
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* USER MANAGEMENT TABLE                                  */}
        {/* ═══════════════════════════════════════════════════════ */}
        <motion.section variants={cardVariants}
          className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
          <div className="p-5 flex items-center justify-between border-b border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center">
                <Users className="w-4.5 h-4.5 text-blue-400" />
              </div>
              <h2 className="text-lg font-bold text-zinc-100">User Management</h2>
              <span className="text-xs font-bold text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded-full">
                {totalUsers}
              </span>
            </div>
          </div>

          {loadingUsers ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-4 animate-pulse">
                  <div className="w-10 h-10 rounded-xl bg-zinc-800" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-zinc-800 rounded w-2/5" />
                    <div className="h-2 bg-zinc-800/60 rounded w-3/5" />
                  </div>
                  <div className="h-8 w-16 bg-zinc-800 rounded-lg" />
                </div>
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="p-10 text-center">
              <UserCheck className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-500 text-sm font-medium">No users found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-widest text-zinc-600 bg-zinc-950/60">
                    <th className="px-5 py-3 font-semibold">User</th>
                    <th className="px-5 py-3 font-semibold hidden sm:table-cell">Email</th>
                    <th className="px-5 py-3 font-semibold text-center">Role</th>
                    <th className="px-5 py-3 font-semibold text-center">Karma</th>
                    <th className="px-5 py-3 font-semibold text-center">Status</th>
                    <th className="px-5 py-3 font-semibold text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {users.map((user, idx) => (
                    <motion.tr
                      key={user.id}
                      custom={idx}
                      variants={rowVariants}
                      initial="hidden"
                      animate="visible"
                      className="hover:bg-zinc-800/30 transition-colors"
                    >
                      {/* User info */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                            user.is_banned
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-gradient-to-br from-violet-500/20 to-blue-500/20 text-violet-300'
                          }`}>
                            {(user.full_name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <p className={`font-semibold truncate ${
                              user.is_banned ? 'text-zinc-500 line-through' : 'text-zinc-200'
                            }`}>
                              {user.full_name || 'Unnamed'}
                            </p>
                            <p className="text-[11px] text-zinc-600 font-mono sm:hidden truncate">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-5 py-3.5 hidden sm:table-cell">
                        <span className="text-zinc-400 font-mono text-xs truncate block max-w-[200px]">
                          {user.email}
                        </span>
                      </td>

                      {/* Role */}
                      <td className="px-5 py-3.5 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide ${
                          user.role === 'admin'
                            ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                            : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                        }`}>
                          {user.role === 'admin' && <Shield className="w-3 h-3" />}
                          {user.role}
                        </span>
                      </td>

                      {/* Karma */}
                      <td className="px-5 py-3.5 text-center">
                        <span className={`font-mono font-bold text-sm ${
                          user.karma_score >= 500 ? 'text-lime-400'
                            : user.karma_score >= 200 ? 'text-amber-400'
                            : 'text-red-400'
                        }`}>
                          ⭐ {user.karma_score}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5 text-center">
                        {user.is_banned ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px]
                                           font-black bg-red-500/15 text-red-400 border border-red-500/25">
                            <Ban className="w-3 h-3" /> BANNED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px]
                                           font-black bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                            <CheckCircle className="w-3 h-3" /> ACTIVE
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-5 py-3.5 text-center">
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          disabled={actionLoading === user.id || user.role === 'admin'}
                          onClick={() =>
                            setConfirmAction({
                              type: 'ban',
                              id: user.id,
                              name: user.full_name || user.email,
                              isBanned: user.is_banned,
                            })
                          }
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold
                                      transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                            user.is_banned
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/25'
                              : 'bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25'
                          }`}
                        >
                          {actionLoading === user.id ? (
                            <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : user.is_banned ? (
                            <>
                              <CheckCircle className="w-3.5 h-3.5" /> Unban
                            </>
                          ) : (
                            <>
                              <Ban className="w-3.5 h-3.5" /> Ban
                            </>
                          )}
                        </motion.button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.section>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* RECENT GLOBAL EXPENSES TABLE                           */}
        {/* ═══════════════════════════════════════════════════════ */}
        <motion.section variants={cardVariants}
          className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
          <div className="p-5 flex items-center justify-between border-b border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <Receipt className="w-4.5 h-4.5 text-amber-400" />
              </div>
              <h2 className="text-lg font-bold text-zinc-100">Recent Global Expenses</h2>
              <span className="text-xs font-bold text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded-full">
                Latest 50
              </span>
            </div>
          </div>

          {loadingExpenses ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4 animate-pulse">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-zinc-800 rounded w-2/5" />
                    <div className="h-2 bg-zinc-800/60 rounded w-1/4" />
                  </div>
                  <div className="h-8 w-8 bg-zinc-800 rounded-lg" />
                </div>
              ))}
            </div>
          ) : expenses.length === 0 ? (
            <div className="p-10 text-center">
              <Receipt className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-500 text-sm font-medium">No expenses recorded yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-widest text-zinc-600 bg-zinc-950/60">
                    <th className="px-5 py-3 font-semibold">Amount</th>
                    <th className="px-5 py-3 font-semibold">Description</th>
                    <th className="px-5 py-3 font-semibold hidden sm:table-cell">Category</th>
                    <th className="px-5 py-3 font-semibold hidden md:table-cell">Source</th>
                    <th className="px-5 py-3 font-semibold">User ID</th>
                    <th className="px-5 py-3 font-semibold hidden sm:table-cell">Date</th>
                    <th className="px-5 py-3 font-semibold text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {expenses.map((exp, idx) => {
                    const merchant = exp.receipt_data?.merchantName || exp.description || '—';
                    return (
                      <motion.tr
                        key={exp.id}
                        custom={idx}
                        variants={rowVariants}
                        initial="hidden"
                        animate="visible"
                        className="hover:bg-zinc-800/30 transition-colors"
                      >
                        {/* Amount */}
                        <td className="px-5 py-3.5">
                          <span className="font-mono font-bold text-rose-400 tabular-nums">
                            ₹{parseFloat(exp.amount).toLocaleString('en-IN')}
                          </span>
                        </td>

                        {/* Description / Merchant */}
                        <td className="px-5 py-3.5">
                          <p className="text-zinc-200 font-medium truncate max-w-[180px]">{merchant}</p>
                        </td>

                        {/* Category */}
                        <td className="px-5 py-3.5 hidden sm:table-cell">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase
                                           bg-zinc-800 text-zinc-400 border border-zinc-700">
                            {exp.category}
                          </span>
                        </td>

                        {/* Source */}
                        <td className="px-5 py-3.5 hidden md:table-cell">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            exp.source === 'ai_scan'
                              ? 'bg-violet-500/15 text-violet-400 border border-violet-500/25'
                              : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                          }`}>
                            {exp.source === 'ai_scan' ? '🤖 AI Scan' : '✍️ Manual'}
                          </span>
                        </td>

                        {/* User ID */}
                        <td className="px-5 py-3.5">
                          <span className="font-mono text-xs text-zinc-500" title={exp.user_id}>
                            {truncateId(exp.user_id)}
                          </span>
                        </td>

                        {/* Date */}
                        <td className="px-5 py-3.5 hidden sm:table-cell">
                          <span className="text-xs text-zinc-500">{formatDate(exp.created_at)}</span>
                        </td>

                        {/* Delete Action */}
                        <td className="px-5 py-3.5 text-center">
                          <motion.button
                            whileTap={{ scale: 0.85 }}
                            disabled={actionLoading === exp.id}
                            onClick={() =>
                              setConfirmAction({ type: 'delete', id: exp.id })
                            }
                            className="inline-flex items-center justify-center w-8 h-8 rounded-xl
                                       bg-red-500/10 text-red-400 border border-red-500/20
                                       hover:bg-red-500/25 hover:border-red-500/40
                                       transition-all cursor-pointer disabled:opacity-40"
                            title="Delete expense"
                          >
                            {actionLoading === exp.id ? (
                              <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </motion.button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </motion.section>
      </motion.div>
    </div>
  );
}
