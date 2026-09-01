import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, X, Check, Loader2, TrendingUp, Trash2, UserPlus, ArrowRight, Calculator } from 'lucide-react';
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
                                       focus:border-lime-400/60 focus:ring-2 focus:ring-lime-400/15 transition-all"
                            required
                        />
                    </div>
                    <motion.button
                        type="submit" disabled={loading || !name.trim()}
                        whileTap={{ scale: 0.97 }} whileHover={{ scale: 1.01 }}
                        className="w-full bg-lime-400 text-black font-black py-3.5 rounded-2xl
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

// ─── Settle-Up Calculator ─────────────────────────────────────
function SettleUpSummary({ members }) {
    if (members.length < 2) return null;

    const totalSpend = members.reduce((s, m) => s + m.spent, 0);
    const fairShare = totalSpend / members.length;

    // Calculate balances: positive = owed money, negative = owes money
    const balances = members.map(m => ({
        name: m.name,
        balance: m.spent - fairShare,
    }));

    // Generate settlement pairs using greedy algorithm
    const debtors = balances.filter(b => b.balance < 0).map(b => ({ ...b, balance: Math.abs(b.balance) }));
    const creditors = balances.filter(b => b.balance > 0).map(b => ({ ...b }));

    const settlements = [];
    let di = 0, ci = 0;
    while (di < debtors.length && ci < creditors.length) {
        const amount = Math.min(debtors[di].balance, creditors[ci].balance);
        if (amount > 0.5) { // skip negligible amounts
            settlements.push({
                from: debtors[di].name,
                to: creditors[ci].name,
                amount: Math.round(amount * 100) / 100,
            });
        }
        debtors[di].balance -= amount;
        creditors[ci].balance -= amount;
        if (debtors[di].balance < 0.01) di++;
        if (creditors[ci].balance < 0.01) ci++;
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 rounded-2xl bg-black/40 border border-lime-400/15 p-4"
        >
            <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-lime-400/15 flex items-center justify-center">
                    <Calculator className="w-4 h-4 text-lime-400" />
                </div>
                <div>
                    <p className="text-sm font-bold text-white">Settle Up</p>
                    <p className="text-[11px] text-zinc-500">Fair share: ₹{Math.round(fairShare).toLocaleString('en-IN')} each</p>
                </div>
            </div>

            {settlements.length === 0 ? (
                <p className="text-xs text-lime-400 font-semibold text-center py-2">✓ Everyone is settled up!</p>
            ) : (
                <div className="space-y-2">
                    {settlements.map((s, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.06 }}
                            className="flex items-center gap-2 bg-zinc-900/80 rounded-xl px-3 py-2.5 border border-zinc-800"
                        >
                            <span className="text-sm font-bold text-[#f43f5e] truncate max-w-[90px]">{s.from}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                            <span className="text-sm font-bold text-lime-400 truncate max-w-[90px]">{s.to}</span>
                            <span className="ml-auto text-sm font-mono font-bold text-white whitespace-nowrap">
                                ₹{s.amount.toLocaleString('en-IN')}
                            </span>
                        </motion.div>
                    ))}
                </div>
            )}
        </motion.div>
    );
}

// ─── Pool Card with Members Section ───────────────────────────
function PoolCard({ pool, userId }) {
    const [expanded, setExpanded] = useState(false);
    const [members, setMembers] = useState(() => {
        // Initialize from existing pool members if available
        const existingMembers = pool.group_members || [];
        return existingMembers.map((m, i) => ({
            id: m.user_id || `member-${i}`,
            name: m.display_name || m.email || `Member ${i + 1}`,
            spent: pool.group_expenses
                ?.filter(e => e.paid_by === m.user_id)
                .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0) || 0,
        }));
    });
    const [newMemberName, setNewMemberName] = useState('');

    const totalExpenses = members.reduce((sum, m) => sum + m.spent, 0);
    const memberCount = members.length || 1;

    const handleAddMember = () => {
        if (!newMemberName.trim()) return;
        setMembers(prev => [...prev, {
            id: `local-${Date.now()}`,
            name: newMemberName.trim(),
            spent: 0,
        }]);
        setNewMemberName('');
    };

    const handleRemoveMember = (id) => {
        setMembers(prev => prev.filter(m => m.id !== id));
    };

    const handleSpendChange = (id, value) => {
        const numValue = parseFloat(value) || 0;
        setMembers(prev => prev.map(m => m.id === id ? { ...m, spent: numValue } : m));
    };

    return (
        <motion.div
            variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
            className="rounded-2xl bg-[#141414] border border-zinc-800 hover:border-lime-400/30 transition-colors p-5 flex flex-col"
        >
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h2 className="text-xl font-bold text-white">{pool.name}</h2>
                    <p className="text-sm text-zinc-500 flex items-center gap-1 mt-1">
                        <Users className="w-3 h-3" /> {memberCount} Member{memberCount !== 1 ? 's' : ''}
                    </p>
                </div>
                <div className="p-3 bg-lime-400/10 text-lime-400 rounded-xl font-bold text-xl">
                    💸
                </div>
            </div>

            {/* Total Spend */}
            <div className="my-3">
                <div className="flex justify-between text-sm mb-2">
                    <span className="text-zinc-400">Total Spend</span>
                    <span className="font-bold font-mono text-white">
                        ₹{totalExpenses.toLocaleString('en-IN')}
                    </span>
                </div>
                <div className="w-full bg-black h-1.5 rounded-full overflow-hidden">
                    <motion.div
                        className="bg-gradient-to-r from-lime-500 to-lime-400 h-full rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: totalExpenses > 0 ? '60%' : '0%' }}
                        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                    />
                </div>
            </div>

            {/* Expand Button */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="mt-2 bg-lime-400 text-black font-bold py-2.5 px-5 rounded-xl hover:bg-lime-300 active:scale-95 transition-all text-sm w-full"
            >
                {expanded ? 'Collapse' : 'View Details & Split'}
            </button>

            {/* Expanded Members Section */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                        className="overflow-hidden"
                    >
                        <div className="pt-4 mt-4 border-t border-zinc-800">
                            {/* Section Header */}
                            <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold mb-3">
                                Members & Spending
                            </p>

                            {/* Member List with Spend Inputs */}
                            <div className="space-y-2">
                                {members.map((member, idx) => (
                                    <motion.div
                                        key={member.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.04 }}
                                        className="flex items-center gap-2 bg-black/40 rounded-xl px-3 py-2 border border-zinc-800"
                                    >
                                        <div className="w-7 h-7 rounded-full bg-lime-400/15 flex items-center justify-center text-xs font-bold text-lime-400 shrink-0">
                                            {member.name.charAt(0).toUpperCase()}
                                        </div>
                                        <span className="text-sm font-semibold text-zinc-200 truncate min-w-0 flex-1">
                                            {member.name}
                                        </span>
                                        <div className="relative shrink-0">
                                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-bold">₹</span>
                                            <input
                                                type="number"
                                                value={member.spent || ''}
                                                onChange={(e) => handleSpendChange(member.id, e.target.value)}
                                                placeholder="0"
                                                className="w-24 bg-zinc-900 border border-zinc-700 rounded-lg pl-6 pr-2 py-1.5 text-xs
                                                           text-white font-mono outline-none focus:border-lime-400/50 transition-colors text-right"
                                                min="0"
                                                step="0.01"
                                            />
                                        </div>
                                        <button
                                            onClick={() => handleRemoveMember(member.id)}
                                            className="p-1 text-zinc-600 hover:text-red-400 transition-colors shrink-0"
                                            title="Remove member"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </motion.div>
                                ))}
                            </div>

                            {/* Add Member Input */}
                            <div className="flex items-center gap-2 mt-3">
                                <div className="relative flex-1">
                                    <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                                    <input
                                        type="text"
                                        value={newMemberName}
                                        onChange={(e) => setNewMemberName(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddMember()}
                                        placeholder="Add member name..."
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl pl-9 pr-3 py-2.5 text-xs
                                                   text-zinc-100 placeholder:text-zinc-600 outline-none
                                                   focus:border-lime-400/50 transition-colors"
                                    />
                                </div>
                                <motion.button
                                    whileTap={{ scale: 0.9 }}
                                    onClick={handleAddMember}
                                    disabled={!newMemberName.trim()}
                                    className="p-2.5 bg-lime-400 text-black rounded-xl disabled:opacity-30 transition-opacity"
                                >
                                    <Plus className="w-4 h-4" />
                                </motion.button>
                            </div>

                            {/* Settle-Up Summary */}
                            <SettleUpSummary members={members} />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
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
                    <Loader2 className="w-8 h-8 text-lime-400 animate-spin mx-auto mb-3" />
                    <p className="text-zinc-500 text-sm">Loading pools...</p>
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
                    <p className="text-zinc-500 mt-1">Split bills and track shared expenses.</p>
                </div>
                <motion.button
                    onClick={() => setShowModal(true)}
                    whileTap={{ scale: 0.93 }} whileHover={{ scale: 1.04 }}
                    className="bg-lime-400/20 text-lime-400 hover:bg-lime-400 hover:text-black transition flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm"
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
                    className="rounded-2xl bg-[#141414] border border-dashed border-zinc-700 text-center py-14 px-6"
                >
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-lime-400/10 flex items-center justify-center">
                        <TrendingUp className="w-8 h-8 text-lime-400" />
                    </div>
                    <p className="text-zinc-400 mb-2 font-medium">No active pools right now.</p>
                    <p className="text-zinc-600 text-sm mb-5">Create one to start splitting bills with your squad.</p>
                    <button
                        onClick={() => setShowModal(true)}
                        className="bg-lime-400 text-black font-bold py-2.5 px-8 rounded-xl hover:bg-lime-300 active:scale-95 transition-all"
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
