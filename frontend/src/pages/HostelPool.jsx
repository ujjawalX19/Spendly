import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, X, Check, Loader2, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || 'https://spendly-t8s6.onrender.com/api';

// ─── Create Pool Modal ────────────────────────────────────────
function CreatePoolModal({ onClose, onCreate }) {
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setLoading(true);
        await onCreate(name.trim());
        setLoading(false);
        onClose();
    };

    return (
        <motion.div
            className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
            <motion.div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <motion.div
                className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-6 pb-8 shadow-2xl z-10"
                initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
                transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            >
                <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-5 sm:hidden" />
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-lg font-bold text-zinc-100">Create Spend Pool</h2>
                    <button onClick={onClose} className="p-2 rounded-xl bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-1.5 block">
                            Pool Name
                        </label>
                        <input
                            autoFocus type="text" placeholder="Goa Trip Expenses..."
                            value={name} onChange={e => setName(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 text-sm
                                       text-zinc-100 placeholder:text-zinc-600 outline-none
                                       focus:border-[var(--color-electric-blue)]/60 focus:ring-2 focus:ring-[var(--color-electric-blue)]/15 transition-all"
                            required
                        />
                    </div>
                    <motion.button
                        type="submit" disabled={loading || !name.trim()}
                        whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.01 }}
                        className="w-full bg-[var(--color-electric-blue)] text-black font-black py-3.5 rounded-2xl
                                   text-sm tracking-wide transition-all
                                   disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-2"
                    >
                        {loading
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <><Check className="w-4 h-4" /> Create Pool</>}
                    </motion.button>
                </form>
            </motion.div>
        </motion.div>
    );
}

// ─── Pool Card ────────────────────────────────────────────────
function PoolCard({ pool, userId }) {
    const totalExpenses = pool.group_expenses?.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0) || 0;
    const myContributions = pool.group_expenses
        ?.filter(e => e.paid_by === userId)
        .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0) || 0;
    const memberCount = pool.group_members?.length || 1;

    return (
        <motion.div
            variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
            className="glass-card flex flex-col group border-[var(--color-electric-blue)]/20 hover:border-[var(--color-electric-blue)]/50 transition-colors"
        >
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h2 className="text-xl font-bold text-[var(--color-text)]">{pool.name}</h2>
                    <p className="text-sm text-[var(--color-text)]/50 flex items-center gap-1 mt-1">
                        <Users className="w-3 h-3" /> {memberCount} Member{memberCount !== 1 ? 's' : ''}
                    </p>
                </div>
                <div className="p-3 bg-[var(--color-electric-blue)]/10 text-[var(--color-electric-blue)] rounded-xl font-bold text-xl">
                    💸
                </div>
            </div>

            <div className="my-4">
                <div className="flex justify-between text-sm mb-2">
                    <span className="text-[var(--color-text)]/70">Total Spent</span>
                    <span className="font-bold font-mono text-[var(--color-text)]">
                        ₹{totalExpenses.toLocaleString('en-IN')}
                    </span>
                </div>
                <div className="w-full bg-[var(--input-bg)] h-1.5 rounded-full overflow-hidden">
                    <motion.div
                        className="bg-gradient-to-r from-[var(--color-neon-green)] to-[var(--color-electric-blue)] h-full rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: totalExpenses > 0 ? '60%' : '0%' }}
                        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                    />
                </div>
            </div>

            <div className="flex justify-between items-center mt-auto pt-4 border-t border-[var(--glass-border)]">
                <div className="text-xs text-[var(--color-text)]/50">
                    <p>You paid: <span className="font-bold text-[var(--color-neon-green)]">
                        ₹{myContributions.toLocaleString('en-IN')}
                    </span></p>
                </div>
                <button className="bg-[var(--color-neon-green)] text-black font-bold py-2 px-5 rounded-xl hover:scale-[1.02] active:scale-95 transition-transform text-sm">
                    View Details
                </button>
            </div>
        </motion.div>
    );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────
export default function HostelPool() {
    const { session } = useAuth();
    const [pools, setPools]       = useState([]);
    const [loading, setLoading]   = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [error, setError]       = useState(null);

    const userId = session?.user?.id;

    // Helper to build Authorization header from session JWT
    const getHeaders = useCallback(() => {
        const token = session?.access_token;
        return token ? { Authorization: `Bearer ${token}` } : {};
    }, [session]);

    // ── Fetch groups (with members + expenses) via Express backend ──
    const fetchPools = useCallback(async () => {
        if (!userId || !session?.access_token) return;
        setLoading(true);
        setError(null);

        try {
            // 1. Fetch all groups the user belongs to (includes members)
            const { data: groupsRes } = await axios.get(`${API_BASE}/groups`, {
                headers: getHeaders(),
            });

            if (!groupsRes.success) {
                throw new Error(groupsRes.message || 'Failed to fetch pools');
            }

            const groups = groupsRes.groups || [];

            // 2. For each group, fetch its expenses in parallel
            const groupsWithExpenses = await Promise.all(
                groups.map(async (group) => {
                    try {
                        const { data: expensesRes } = await axios.get(
                            `${API_BASE}/groups/${group.id}/expenses`,
                            { headers: getHeaders() }
                        );
                        return {
                            ...group,
                            // Map backend shape → PoolCard expected shape
                            group_members: group.members || [],
                            group_expenses: expensesRes.success ? (expensesRes.expenses || []) : [],
                        };
                    } catch {
                        // If expenses fail for a single group, don't block the rest
                        return {
                            ...group,
                            group_members: group.members || [],
                            group_expenses: [],
                        };
                    }
                })
            );

            setPools(groupsWithExpenses);
        } catch (err) {
            console.error('Error fetching pools:', err);
            setError(err.response?.data?.message || err.message || 'Could not load pools.');
        } finally {
            setLoading(false);
        }
    }, [userId, session, getHeaders]);

    useEffect(() => {
        fetchPools();
    }, [fetchPools]);

    // ── Create new pool via Express backend ──────────────────────
    const handleCreatePool = async (name) => {
        if (!userId || !session?.access_token) return;

        try {
            const { data: createRes } = await axios.post(
                `${API_BASE}/groups`,
                { name },
                { headers: getHeaders() }
            );

            if (!createRes.success) {
                throw new Error(createRes.message || 'Failed to create pool');
            }

            // Optimistic update — new pool starts with creator as sole member, no expenses
            const newPool = {
                ...createRes.group,
                group_members: [{ user_id: userId, role: 'admin' }],
                group_expenses: [],
            };

            setPools(prev => [newPool, ...prev]);
        } catch (err) {
            console.error('Error creating pool:', err);
            setError(err.response?.data?.message || err.message || 'Could not create pool.');
        }
    };

    // ─────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 text-[var(--color-electric-blue)] animate-spin mx-auto mb-3" />
                    <p className="text-[var(--color-text)]/60 text-sm">Loading pools...</p>
                </div>
            </div>
        );
    }

    return (
        <motion.div
            className="space-y-6 pb-6"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
        >
            {/* Create Pool Modal */}
            <AnimatePresence>
                {showModal && (
                    <CreatePoolModal
                        onClose={() => setShowModal(false)}
                        onCreate={handleCreatePool}
                    />
                )}
            </AnimatePresence>

            {/* Header */}
            <motion.header
                variants={{ hidden: { opacity: 0, y: -10 }, visible: { opacity: 1, y: 0 } }}
                className="flex justify-between items-end"
            >
                <div>
                    <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Group Pool</h1>
                    <p className="text-[var(--color-text)]/60 mt-1">Split bills and track shared expenses.</p>
                </div>
                <motion.button
                    onClick={() => setShowModal(true)}
                    whileTap={{ scale: 0.93 }} whileHover={{ scale: 1.04 }}
                    className="bg-[var(--color-electric-blue)]/20 text-[var(--color-electric-blue)] hover:bg-[var(--color-electric-blue)] hover:text-black transition flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm"
                >
                    <Plus className="w-4 h-4" /> New Pool
                </motion.button>
            </motion.header>

            {/* Error Banner */}
            {error && (
                <div className="p-4 bg-red-500/15 border border-red-500/30 rounded-xl text-red-400 text-sm">
                    {error}
                </div>
            )}

            {/* Empty State */}
            {pools.length === 0 && !error ? (
                <motion.div
                    variants={{ hidden: { opacity: 0, scale: 0.96 }, visible: { opacity: 1, scale: 1 } }}
                    className="glass-card text-center py-14 border-dashed border-[var(--glass-border)]"
                >
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--color-electric-blue)]/10 flex items-center justify-center">
                        <TrendingUp className="w-8 h-8 text-[var(--color-electric-blue)]" />
                    </div>
                    <p className="text-[var(--color-text)]/60 mb-2 font-medium">No active pools right now.</p>
                    <p className="text-[var(--color-text)]/40 text-sm mb-5">Create one to start splitting bills with your squad.</p>
                    <button
                        onClick={() => setShowModal(true)}
                        className="bg-[var(--color-electric-blue)] text-black font-bold py-2.5 px-8 rounded-xl hover:scale-[1.02] active:scale-95 transition-transform"
                    >
                        Create your first pool
                    </button>
                </motion.div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {pools.map(pool => (
                        <PoolCard key={pool.id} pool={pool} userId={userId} />
                    ))}
                </div>
            )}
        </motion.div>
    );
}
