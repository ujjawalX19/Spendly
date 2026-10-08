import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ArrowLeft, Copy, Share2, Plus, Loader2, ArrowRight, LogOut, Check } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../contexts/AuthContext';
import { apiJson } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';
import { Sheet, BalanceText } from './HostelPool';
import { ErrorState, Skeleton } from '../components/ui';

const inr = (n) => `₹${Math.abs(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const when = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

function AddExpenseSheet({ group, members, me, onClose, onSaved, session }) {
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [paidBy, setPaidBy] = useState(me);
    const [participants, setParticipants] = useState(() => members.map((m) => m.id));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const value = Number(amount);
    const valid = description.trim() && value > 0 && participants.length > 0;
    const share = valid ? value / participants.length : 0;

    const toggle = (id) => setParticipants((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

    const save = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            await apiJson(`/groups/${group.id}/expenses`, { session, method: 'POST', body: { description: description.trim(), amount: value, paidBy, participants } });
            onSaved();
        } catch (err) {
            setError(friendlyError(err, "Couldn't add that expense."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Sheet title="Add shared expense" onClose={onClose}>
            <form onSubmit={save} className="space-y-4">
                <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="What was it for?" aria-label="Description"
                    className="v-input" />
                <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-3">₹</span>
                    <input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" aria-label="Amount"
                        className="v-input pl-8 font-mono" />
                </div>
                <label className="v-field-label mb-0">
                    Paid by
                    <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className="v-input mt-1.5 font-normal">
                        {members.map((m) => <option key={m.id} value={m.id}>{m.id === me ? `${m.name} (you)` : m.name}</option>)}
                    </select>
                </label>
                <fieldset>
                    <legend className="v-field-label">Split equally between</legend>
                    <div className="flex flex-wrap gap-2">
                        {members.map((m) => {
                            const on = participants.includes(m.id);
                            return (
                                <button type="button" key={m.id} onClick={() => toggle(m.id)} aria-pressed={on}
                                    className={`flex min-h-[36px] items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium ${on ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2'}`}>
                                    {on && <Check className="h-3 w-3" aria-hidden="true" />}{m.id === me ? 'You' : m.name}
                                </button>
                            );
                        })}
                    </div>
                    {valid && <p className="mt-2 text-xs text-ink-3">About {inr(share)} each</p>}
                </fieldset>
                {error && <p role="alert" className="text-sm text-danger">{error}</p>}
                <button type="submit" disabled={!valid || busy} className="v-press v-btn-primary w-full">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add expense'}
                </button>
            </form>
        </Sheet>
    );
}

function SettleSheet({ group, suggestion, me, onClose, onSaved, session }) {
    const [amount, setAmount] = useState(String(suggestion.amount));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const iPay = suggestion.from.id === me;

    const save = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
            await apiJson(`/groups/${group.id}/settle`, { session, method: 'POST', body: { fromUserId: suggestion.from.id, toUserId: suggestion.to.id, amount: Number(amount) } });
            onSaved();
        } catch (err) {
            setError(friendlyError(err, "Couldn't record that payment."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Sheet title="Record a payment" onClose={onClose}>
            <form onSubmit={save} className="space-y-4">
                <p className="text-sm text-ink-2">
                    {iPay ? <>You paid <strong className="font-semibold text-ink">{suggestion.to.name}</strong></> : <><strong className="font-semibold text-ink">{suggestion.from.name}</strong> paid you</>}
                </p>
                <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-3">₹</span>
                    <input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount"
                        className="v-input pl-8 font-mono" />
                </div>
                <p className="text-xs text-ink-3">Vittova only records the payment. Pay each other through your usual UPI app.</p>
                {error && <p role="alert" className="text-sm text-danger">{error}</p>}
                <button type="submit" disabled={busy || !(Number(amount) > 0)} className="v-press v-btn-primary w-full">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Record payment'}
                </button>
            </form>
        </Sheet>
    );
}

export default function GroupDetail() {
    const { groupId } = useParams();
    const { session } = useAuth();
    const navigate = useNavigate();
    const me = session?.user?.id;
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [waking, setWaking] = useState(false);
    const [sheet, setSheet] = useState(null);
    const [copied, setCopied] = useState(false);

    const load = useCallback(async () => {
        if (!session?.access_token) return;
        try {
            const res = await apiJson(`/groups/${groupId}`, { session, onRetry: () => setWaking(true) });
            setData(res);
            setError('');
        } catch (err) {
            setError(err.status === 403 || err.status === 400 ? "This group doesn't exist or you're not a member." : friendlyError(err, "We couldn't load this group."));
        } finally {
            setWaking(false);
        }
    }, [groupId, session]);

    useEffect(() => { load(); }, [load]);

    const saved = () => { setSheet(null); load(); };

    const shareCode = async () => {
        const text = `Join my "${data.group.name}" group on Vittova with invite code ${data.group.inviteCode}`;
        try {
            if (Capacitor.isNativePlatform()) {
                const { Share } = await import('@capacitor/share');
                await Share.share({ title: 'Vittova group invite', text });
            } else if (navigator.share) {
                await navigator.share({ text });
            } else {
                await navigator.clipboard.writeText(data.group.inviteCode);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }
        } catch { /* dismissed */ }
    };

    const leave = async () => {
        if (!window.confirm('Leave this group?')) return;
        try {
            await apiJson(`/groups/${groupId}/members/me`, { session, method: 'DELETE' });
            navigate('/pool', { replace: true });
        } catch (err) {
            setError(friendlyError(err, "Couldn't leave the group."));
        }
    };

    const back = <Link to="/pool" className="-ml-1 inline-flex min-h-[44px] items-center gap-1 px-1 text-sm text-ink-2"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Groups</Link>;

    if (!data) {
        return (
            <div className="space-y-4">
                {back}
                {error ? <ErrorState onRetry={load} /> : (
                    <div className="space-y-3" aria-busy="true" aria-label="Loading group">
                        <Skeleton className="h-8 w-40" />
                        <Skeleton className="h-28 w-full rounded-2xl" />
                        <Skeleton className="h-16 w-full rounded-2xl" />
                        <Skeleton className="h-16 w-full rounded-2xl" />
                        {waking && <p className="text-center text-xs text-ink-3">Waking the server up…</p>}
                    </div>
                )}
            </div>
        );
    }

    const myBalance = data.balances.find((b) => b.id === me)?.balance || 0;
    const mySettlements = data.settleUp.filter((s) => s.from.id === me || s.to.id === me);

    return (
        <div className="space-y-6 pb-20 text-ink">
            <div>
                {back}
                <header>
                    <h1 className="text-2xl font-bold">{data.group.name}</h1>
                    <p className="mt-1 text-sm text-ink-2">{data.members.length} member{data.members.length === 1 ? '' : 's'} · {inr(data.totalSpent)} spent together</p>
                    <BalanceText amount={myBalance} className="mt-3 block font-display text-xl font-bold" />
                </header>
            </div>

            <div className="v-block flex items-center gap-3 px-4 py-2">
                <span className="text-[13px] text-ink-2">Invite code</span>
                <span className="font-mono text-sm font-semibold tracking-widest text-ink">{data.group.inviteCode}</span>
                <button type="button" onClick={shareCode} className="v-press v-btn-text ml-auto -mr-2" aria-label="Share invite code">
                    {copied ? <><Check className="h-4 w-4" aria-hidden="true" /> Copied</> : Capacitor.isNativePlatform() || navigator.share ? <><Share2 className="h-4 w-4" aria-hidden="true" /> Share</> : <><Copy className="h-4 w-4" aria-hidden="true" /> Copy</>}
                </button>
            </div>

            {error && <p role="alert" className="v-error">{error}</p>}

            <section>
                <h2 className="v-label mb-2">Settle up</h2>
                {data.settleUp.length === 0 ? (
                    <p className="text-sm text-ink-2">Everyone is settled up.</p>
                ) : (
                    <ul className="v-block v-rows">
                        {data.settleUp.map((s, i) => {
                            const mine = s.from.id === me || s.to.id === me;
                            return (
                                <li key={i} className="flex min-h-[56px] items-center gap-3 px-4 py-2">
                                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                                        <span className="font-medium">{s.from.id === me ? 'You' : s.from.name}</span>
                                        <ArrowRight className="mx-1.5 inline h-3.5 w-3.5 text-ink-3" aria-label="pays" />
                                        <span className="font-medium">{s.to.id === me ? 'You' : s.to.name}</span>
                                    </span>
                                    <span className="font-mono text-sm font-semibold tabular-nums text-ink">{inr(s.amount)}</span>
                                    {mine && (
                                        <button type="button" onClick={() => setSheet({ type: 'settle', suggestion: s })} className="v-press v-btn-secondary px-3 text-[13px]">Record</button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
                {mySettlements.length === 0 && data.settleUp.length > 0 && <p className="mt-2 text-xs text-ink-3">You're not part of any open payment.</p>}
            </section>

            <section>
                <h2 className="v-label mb-2">Balances</h2>
                <ul className="v-block v-rows">
                    {data.balances.map((b) => (
                        <li key={b.id} className="flex min-h-[48px] items-center justify-between gap-3 px-4 py-2 text-sm">
                            <span className="truncate text-ink">{b.id === me ? `${b.name} (you)` : b.name}</span>
                            <span className={`shrink-0 font-mono font-semibold tabular-nums ${b.balance > 0 ? 'text-accent' : b.balance < 0 ? 'text-danger' : 'text-ink-3'}`}>
                                {b.balance > 0 ? `gets ${inr(b.balance)}` : b.balance < 0 ? `owes ${inr(b.balance)}` : 'settled'}
                            </span>
                        </li>
                    ))}
                </ul>
            </section>

            <section>
                <h2 className="v-label mb-2">History</h2>
                {data.history.length === 0 ? (
                    <p className="text-sm text-ink-2">No shared expenses yet. Add the first one below.</p>
                ) : (
                    <ul className="v-rows">
                        {data.history.map((h) => (
                            <li key={`${h.type}-${h.id}`} className="flex items-start gap-3 py-3">
                                <div className="min-w-0 flex-1">
                                    {h.type === 'expense' ? (
                                        <>
                                            <p className="truncate text-[15px] font-medium text-ink">{h.description}</p>
                                            <p className="mt-0.5 text-xs text-ink-3">{h.paidBy.id === me ? 'You' : h.paidBy.name} paid · split with {h.participants.map((p) => (p.id === me ? 'you' : p.name)).join(', ')}</p>
                                        </>
                                    ) : (
                                        <p className="text-[15px] text-ink-soft">{h.from.id === me ? 'You' : h.from.name} paid {h.to.id === me ? 'you' : h.to.name}</p>
                                    )}
                                    <p className="mt-0.5 text-[11px] text-ink-3">{when(h.createdAt)}</p>
                                </div>
                                <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-ink">{inr(h.amount)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <button type="button" onClick={leave} className="v-press v-btn-text -ml-2 text-ink-3">
                <LogOut className="h-4 w-4" aria-hidden="true" /> Leave group
            </button>

            <button type="button" onClick={() => setSheet({ type: 'expense' })} aria-label="Add shared expense"
                className="v-press fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-[100] flex h-14 w-14 items-center justify-center rounded-full bg-ink text-bg shadow-[var(--v-shadow-pop)] md:bottom-8">
                <Plus className="h-6 w-6" strokeWidth={2.5} />
            </button>

            <AnimatePresence>
                {sheet?.type === 'expense' && (
                    <AddExpenseSheet group={data.group} members={data.members} me={me} session={session} onClose={() => setSheet(null)} onSaved={saved} />
                )}
                {sheet?.type === 'settle' && (
                    <SettleSheet group={data.group} suggestion={sheet.suggestion} me={me} session={session} onClose={() => setSheet(null)} onSaved={saved} />
                )}
            </AnimatePresence>
        </div>
    );
}
