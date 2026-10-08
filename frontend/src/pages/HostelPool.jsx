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
    if (Math.abs(n) < 0.005) return <span className={`text-ink-2 ${className}`}>Settled up</span>;
    return n > 0
        ? <span className={`text-accent ${className}`}>You're owed {inr(n)}</span>
        : <span className={`text-danger ${className}`}>You owe {inr(n)}</span>;
}

function Sheet({ title, onClose, children }) {
    return (
        <motion.div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="v-scrim absolute inset-0" onClick={onClose} />
            <motion.div
                role="dialog" aria-label={title}
                className="v-sheet relative z-10 w-full max-w-md p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'tween', duration: 0.24, ease: 'easeOut' }}
            >
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-ink">{title}</h2>
                    <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-2"><X className="h-5 w-5" /></button>
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
        <div className="space-y-6 pb-6 text-ink">
            <header>
                <h1 className="text-2xl font-bold">Group Pool</h1>
                <p className="mt-1 text-sm text-ink-2">Split shared bills with flatmates and friends, and settle up.</p>
            </header>

            <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => open('create')} className="v-press v-btn-primary px-3">
                    <Plus className="h-4 w-4" aria-hidden="true" /> New group
                </button>
                <button type="button" onClick={() => open('join')} className="v-press v-btn-secondary min-h-12 px-3">
                    <KeyRound className="h-4 w-4" aria-hidden="true" /> Join with code
                </button>
            </div>

            {error && groups !== null && <p role="alert" className="v-error">{error}</p>}

            {groups === null && error ? (
                <ErrorState onRetry={load} />
            ) : groups === null ? (
                <div className="space-y-2" aria-busy="true" aria-label="Loading your groups">
                    {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[72px] w-full rounded-2xl" />)}
                    {waking && <p className="pt-2 text-center text-xs text-ink-3">Waking the server up, this can take a moment…</p>}
                </div>
            ) : groups.length === 0 ? (
                <div className="px-4 py-8 text-center">
                    <Users className="mx-auto mb-3 h-6 w-6 text-ink-3" aria-hidden="true" />
                    <p className="text-base font-semibold">No groups yet</p>
                    <p className="mx-auto mt-1 max-w-xs text-sm text-ink-2">Create a group and share its invite code, or join one with a code from a friend.</p>
                </div>
            ) : (
                <section>
                    <h2 className="v-label mb-2">Your groups</h2>
                    <ul className="v-block v-rows">
                        {groups.map((g) => (
                            <li key={g.id}>
                                <Link to={`/pool/${g.id}`} className="v-press flex min-h-[64px] items-center gap-3 px-4 py-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-[15px] font-semibold text-ink">{g.name}</p>
                                        <p className="mt-0.5 text-xs text-ink-3">{g.memberCount} member{g.memberCount === 1 ? '' : 's'} · {g.expenseCount} expense{g.expenseCount === 1 ? '' : 's'}</p>
                                    </div>
                                    <BalanceText amount={g.myBalance} className="shrink-0 text-xs font-semibold" />
                                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>
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
                                className="v-input"
                            />
                            {formError && <p role="alert" className="text-sm text-danger">{formError}</p>}
                            <button type="submit" disabled={busy || (sheet === 'create' ? !value.trim() : value.trim().length !== 8)} className="v-press v-btn-primary w-full">
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
