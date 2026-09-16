import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ArrowLeft, Copy, Share2, Plus, HandCoins, Loader2, Receipt, ArrowRight, LogOut, Check } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../contexts/AuthContext';
import { apiJson } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';
import { Sheet, BalanceText } from './HostelPool';

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
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-zinc-100 outline-none focus:border-lime-500/60" />
                <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-zinc-400">₹</span>
                    <input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" aria-label="Amount"
                        className="w-full rounded-2xl border border-zinc-700 bg-zinc-800 py-3 pl-8 pr-4 font-mono text-zinc-100 outline-none focus:border-lime-500/60" />
                </div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Paid by
                    <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className="mt-1 w-full rounded-2xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm normal-case tracking-normal text-zinc-100">
                        {members.map((m) => <option key={m.id} value={m.id}>{m.id === me ? `${m.name} (you)` : m.name}</option>)}
                    </select>
                </label>
                <fieldset>
                    <legend className="text-xs font-bold uppercase tracking-wider text-zinc-500">Split equally between</legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {members.map((m) => {
                            const on = participants.includes(m.id);
                            return (
                                <button type="button" key={m.id} onClick={() => toggle(m.id)} aria-pressed={on}
                                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold ${on ? 'border-lime-400 bg-lime-400 text-black' : 'border-zinc-700 bg-zinc-800 text-zinc-400'}`}>
                                    {on && <Check className="h-3 w-3" />}{m.id === me ? 'You' : m.name}
                                </button>
                            );
                        })}
                    </div>
                    {valid && <p className="mt-2 text-xs text-zinc-500">About {inr(share)} each</p>}
                </fieldset>
                {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
                <button type="submit" disabled={!valid || busy} className="flex w-full items-center justify-center rounded-2xl bg-lime-400 py-3 text-sm font-black text-black disabled:opacity-50">
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
                <p className="text-sm text-zinc-400">
                    {iPay ? <>You paid <strong className="text-white">{suggestion.to.name}</strong></> : <><strong className="text-white">{suggestion.from.name}</strong> paid you</>}
                </p>
                <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-zinc-400">₹</span>
                    <input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount"
                        className="w-full rounded-2xl border border-zinc-700 bg-zinc-800 py-3 pl-8 pr-4 font-mono text-zinc-100 outline-none focus:border-lime-500/60" />
                </div>
                <p className="text-xs text-zinc-500">Vittova only records the payment. Pay each other through your usual UPI app.</p>
                {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
                <button type="submit" disabled={busy || !(Number(amount) > 0)} className="flex w-full items-center justify-center rounded-2xl bg-lime-400 py-3 text-sm font-black text-black disabled:opacity-50">
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

    if (!data) {
        return (
            <div className="space-y-4">
                <Link to="/pool" className="inline-flex items-center gap-2 text-sm text-zinc-500"><ArrowLeft className="h-4 w-4" /> Groups</Link>
                {error ? <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</p> : (
                    <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500" role="status">
                        <Loader2 className="h-5 w-5 animate-spin text-lime-400" /> {waking ? 'Waking the server up…' : 'Loading group…'}
                    </div>
                )}
            </div>
        );
    }

    const myBalance = data.balances.find((b) => b.id === me)?.balance || 0;
    const mySettlements = data.settleUp.filter((s) => s.from.id === me || s.to.id === me);

    return (
        <div className="space-y-5 pb-20">
            <Link to="/pool" className="inline-flex items-center gap-2 text-sm text-zinc-500"><ArrowLeft className="h-4 w-4" /> Groups</Link>

            <header className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                <h1 className="text-2xl font-black text-white">{data.group.name}</h1>
                <p className="mt-1 text-sm text-zinc-500">{data.members.length} member{data.members.length === 1 ? '' : 's'} · {inr(data.totalSpent)} spent together</p>
                <BalanceText amount={myBalance} className="mt-3 block text-lg font-black" />
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-zinc-700 bg-zinc-950 px-3 py-2">
                    <span className="text-xs text-zinc-500">Invite code</span>
                    <span className="font-mono text-sm font-bold tracking-widest text-lime-300">{data.group.inviteCode}</span>
                    <button type="button" onClick={shareCode} className="ml-auto flex items-center gap-1 text-xs font-bold text-zinc-300" aria-label="Share invite code">
                        {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : Capacitor.isNativePlatform() || navigator.share ? <><Share2 className="h-3.5 w-3.5" /> Share</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                    </button>
                </div>
            </header>

            {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}

            <section>
                <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-zinc-500">Settle up</h2>
                {data.settleUp.length === 0 ? (
                    <p className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">Everyone is settled up.</p>
                ) : (
                    <ul className="space-y-2">
                        {data.settleUp.map((s, i) => {
                            const mine = s.from.id === me || s.to.id === me;
                            return (
                                <li key={i} className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
                                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">
                                        <strong className="text-white">{s.from.id === me ? 'You' : s.from.name}</strong>
                                        <ArrowRight className="mx-1.5 inline h-3.5 w-3.5 text-zinc-500" />
                                        <strong className="text-white">{s.to.id === me ? 'You' : s.to.name}</strong>
                                    </span>
                                    <span className="font-mono text-sm font-bold text-white">{inr(s.amount)}</span>
                                    {mine && (
                                        <button type="button" onClick={() => setSheet({ type: 'settle', suggestion: s })} className="rounded-xl bg-lime-400 px-3 py-1.5 text-xs font-black text-black">Record</button>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
                {mySettlements.length === 0 && data.settleUp.length > 0 && <p className="mt-2 px-1 text-xs text-zinc-500">You're not part of any open payment.</p>}
            </section>

            <section>
                <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-zinc-500">Balances</h2>
                <ul className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-900">
                    {data.balances.map((b) => (
                        <li key={b.id} className="flex items-center justify-between px-4 py-3 text-sm">
                            <span className="text-zinc-200">{b.id === me ? `${b.name} (you)` : b.name}</span>
                            <span className={`font-mono font-bold ${b.balance > 0 ? 'text-lime-400' : b.balance < 0 ? 'text-rose-400' : 'text-zinc-500'}`}>
                                {b.balance > 0 ? `gets ${inr(b.balance)}` : b.balance < 0 ? `owes ${inr(b.balance)}` : 'settled'}
                            </span>
                        </li>
                    ))}
                </ul>
            </section>

            <section>
                <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-zinc-500">History</h2>
                {data.history.length === 0 ? (
                    <p className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">No shared expenses yet. Add the first one below.</p>
                ) : (
                    <ul className="space-y-2">
                        {data.history.map((h) => (
                            <li key={`${h.type}-${h.id}`} className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
                                <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${h.type === 'expense' ? 'bg-sky-400/10' : 'bg-lime-400/10'}`}>
                                    {h.type === 'expense' ? <Receipt className="h-4 w-4 text-sky-400" /> : <HandCoins className="h-4 w-4 text-lime-400" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    {h.type === 'expense' ? (
                                        <>
                                            <p className="truncate text-sm font-bold text-white">{h.description}</p>
                                            <p className="text-xs text-zinc-500">{h.paidBy.id === me ? 'You' : h.paidBy.name} paid · split with {h.participants.map((p) => (p.id === me ? 'you' : p.name)).join(', ')}</p>
                                        </>
                                    ) : (
                                        <p className="text-sm text-zinc-300">{h.from.id === me ? 'You' : h.from.name} paid {h.to.id === me ? 'you' : h.to.name}</p>
                                    )}
                                    <p className="text-[11px] text-zinc-600">{when(h.createdAt)}</p>
                                </div>
                                <span className="font-mono text-sm font-bold text-white">{inr(h.amount)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <button type="button" onClick={leave} className="flex items-center gap-2 px-1 text-xs font-bold text-zinc-500 hover:text-rose-300">
                <LogOut className="h-3.5 w-3.5" /> Leave group
            </button>

            <button type="button" onClick={() => setSheet({ type: 'expense' })} aria-label="Add shared expense"
                className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-[100] flex h-14 w-14 items-center justify-center rounded-full bg-lime-400 text-black shadow-[0_4px_24px_rgba(163,230,53,0.4)] md:bottom-8">
                <Plus className="h-7 w-7" strokeWidth={3} />
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
