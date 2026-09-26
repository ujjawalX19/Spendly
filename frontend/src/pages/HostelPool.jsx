import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Plus, KeyRound, Loader2, ChevronRight, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiJson } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';
import { ErrorState, Skeleton } from '../components/ui';

const inr = (n) => `₹${Math.abs(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function BalanceText({ amount, className = '' }) {
    const n = Number(amount) || 0;
    if (Math.abs(n) < 0.005) return <span className={`text-zinc-400 ${className}`}>Settled up</span>;
    return n > 0
        ? <span className={`text-lime-400 ${className}`}>You're owed {inr(n)}</span>
        : <span className={`text-rose-400 ${className}`}>You owe {inr(n)}</span>;
}

function Sheet({ title, onClose, children }) {
    return (
        <motion.div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <motion.div
                role="dialog" aria-label={title}
                className="relative z-10 w-full max-w-md rounded-t-3xl border border-zinc-800 bg-zinc-900 p-6 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:rounded-3xl"
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            >
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white">{title}</h2>
                    <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl bg-zinc-800 p-2 text-zinc-400"><X className="h-4 w-4" /></button>
                </div>
                {children}
            </motion.div>
        </motion.div>
    );
}

export default function HostelPool() {
    const { session } = useAuth();
    const navigate = useNavigate();
    const [groups, setGroups] = useState(null);
    const [error, setError] = useState('');
    const [waking, setWaking] = useState(false);
    const [sheet, setSheet] = useState(null); // 'create' | 'join'
    const [value, setValue] = useState('');
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');

    const load = useCallback(async () => {
        if (!session?.access_token) return;
        setError('');
        try {
            const data = await apiJson('/groups', { session, onRetry: () => setWaking(true) });
            setGroups(data.groups || []);
        } catch (err) {
            setError(friendlyError(err, "We couldn't load your groups. Please try again."));
            setGroups((g) => g || []);
        } finally {
            setWaking(false);
        }
    }, [session]);

    useEffect(() => { load(); }, [load]);

    const submit = async (e) => {
        e.preventDefault();
        setFormError('');
        setBusy(true);
        try {
            if (sheet === 'create') {
                const data = await apiJson('/groups', { session, method: 'POST', body: { name: value.trim() } });
                navigate(`/pool/${data.group.id}`);
            } else {
                const data = await apiJson('/groups/join', { session, method: 'POST', body: { code: value.trim() } });
                navigate(`/pool/${data.group.id}`);
            }
        } catch (err) {
            setFormError(friendlyError(err, 'Something went wrong. Please try again.'));
        } finally {
            setBusy(false);
        }
    };

    const open = (kind) => { setSheet(kind); setValue(''); setFormError(''); };

    return (
        <div className="space-y-6 pb-6">
            <header className="flex items-end justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Group Pool</h1>
                    <p className="mt-1 text-sm text-zinc-500">Split shared bills with flatmates and friends, and settle up.</p>
                </div>
            </header>

            <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => open('create')} className="flex items-center justify-center gap-2 rounded-2xl bg-lime-400 py-3 text-sm font-black text-black">
                    <Plus className="h-4 w-4" /> New group
                </button>
                <button type="button" onClick={() => open('join')} className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-900 py-3 text-sm font-bold text-zinc-200">
                    <KeyRound className="h-4 w-4" /> Join with code
                </button>
            </div>

            {error && groups !== null && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}

            {groups === null && error ? (
                <ErrorState onRetry={load} />
            ) : groups === null ? (
                <div className="space-y-2" aria-busy="true" aria-label="Loading your groups">
                    {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[72px] w-full rounded-2xl" />)}
                    {waking && <p className="pt-2 text-center text-xs text-zinc-500">Waking the server up, this can take a moment…</p>}
                </div>
            ) : groups.length === 0 ? (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
                    <Users className="mx-auto mb-3 h-10 w-10 text-sky-400" />
                    <p className="font-bold text-white">No groups yet</p>
                    <p className="mt-1 text-sm text-zinc-500">Create a group and share its invite code, or join one with a code from a friend.</p>
                </div>
            ) : (
                <ul className="space-y-3">
                    {groups.map((g) => (
                        <li key={g.id}>
                            <Link to={`/pool/${g.id}`} className="flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-400/10"><Users className="h-5 w-5 text-sky-400" /></div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-bold text-white">{g.name}</p>
                                    <p className="text-xs text-zinc-500">{g.memberCount} member{g.memberCount === 1 ? '' : 's'} · {g.expenseCount} expense{g.expenseCount === 1 ? '' : 's'}</p>
                                    <BalanceText amount={g.myBalance} className="text-xs font-bold" />
                                </div>
                                <ChevronRight className="h-4 w-4 text-zinc-600" />
                            </Link>
                        </li>
                    ))}
                </ul>
            )}

            <AnimatePresence>
                {sheet && (
                    <Sheet title={sheet === 'create' ? 'Create a group' : 'Join a group'} onClose={() => setSheet(null)}>
                        <form onSubmit={submit} className="space-y-4">
                            <input
                                autoFocus
                                value={value}
                                onChange={(e) => setValue(sheet === 'join' ? e.target.value.toUpperCase() : e.target.value)}
                                maxLength={sheet === 'join' ? 8 : 60}
                                placeholder={sheet === 'create' ? 'e.g. Flat 4B, Goa trip' : '8-character invite code'}
                                aria-label={sheet === 'create' ? 'Group name' : 'Invite code'}
                                className="w-full rounded-2xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-zinc-100 outline-none focus:border-lime-500/60"
                            />
                            {formError && <p role="alert" className="text-sm text-rose-300">{formError}</p>}
                            <button type="submit" disabled={busy || (sheet === 'create' ? !value.trim() : value.trim().length !== 8)} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-lime-400 py-3 text-sm font-black text-black disabled:opacity-50">
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : sheet === 'create' ? 'Create group' : 'Join group'}
                            </button>
                        </form>
                    </Sheet>
                )}
            </AnimatePresence>
        </div>
    );
}

export { Sheet };
