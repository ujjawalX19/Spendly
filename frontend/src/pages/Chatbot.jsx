import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, Info, RotateCcw, TrendingUp, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePro } from '../contexts/ProContext';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { API_URL, apiFetch } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';
import { track } from '../lib/telemetry';
import VittovaLogo from '../components/VittovaLogo';

const MAX_CHARS = 500;
const REQUEST_TIMEOUT_MS = 45000;
const UNAVAILABLE = 'Vittova AI is temporarily unavailable. Your financial data is safe. Please try again in a moment.';

// Shown until the server's personalised suggestions arrive.
const FALLBACK_SUGGESTIONS = [
    { label: 'What should I improve first?' },
    { label: 'Can I afford this?', prefill: 'Can I afford ₹' },
    { label: 'How much can I safely spend?' },
    { label: 'Where am I overspending?' },
    { label: 'Build my emergency fund' },
    { label: 'Review my subscriptions' },
];

// One-tap starting points: the questions people bring to a money app most.
const QUICK_ACTIONS = [
    'Can I afford ₹2,500?',
    'Why did I spend more this month?',
    'How can I recover my budget?',
    'What can I safely spend this week?',
];

const GREETING = {
    id: 'greeting',
    role: 'bot',
    content: "I'm your money mentor. Before I answer, I look at your budget, spending, bills, recurring charges and savings target in Vittova, and every number I give comes from that data.\n\nIncome, bank balances and debts aren't tracked yet, so I'll say when something is missing. General education, not investment advice.",
};

/** Inline **bold** and ₹ amounts, rendered as React nodes (never HTML). */
function Inline({ text }) {
    const parts = String(text).split(/(\*\*[^*]+\*\*|₹\s?[\d,]+(?:\.\d+)?)/g).filter(Boolean);
    return parts.map((part, i) => {
        if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
        if (/^₹/.test(part)) return <span key={i} className="font-semibold tabular-nums text-white">{part}</span>;
        return <span key={i}>{part}</span>;
    });
}

/**
 * The mentor's answer: "**Heading**" lines become section labels, "• " / "- "
 * lines bullets, "1. " lines numbered steps. Everything else is a paragraph.
 */
function AnswerText({ text }) {
    const blocks = String(text || '').split(/\n{2,}/);
    return (
        <div className="space-y-3">
            {blocks.map((block, i) => {
                const lines = block.split('\n').filter((l) => l.trim() !== '');
                if (!lines.length) return null;
                const heading = /^\*\*(.+?)\*\*:?$/.exec(lines[0].trim());
                const body = heading ? lines.slice(1) : lines;
                return (
                    <div key={i}>
                        {heading && <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[.14em] text-[#A3E635]">{heading[1]}</p>}
                        <div className="space-y-1">
                            {body.map((line, j) => {
                                const bullet = /^\s*[•-]\s+(.*)$/.exec(line);
                                const numbered = /^\s*(\d+)\.\s+(.*)$/.exec(line);
                                if (bullet) {
                                    return <p key={j} className="flex gap-2"><span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#A3E635]/70" aria-hidden /><span><Inline text={bullet[1]} /></span></p>;
                                }
                                if (numbered) {
                                    return <p key={j} className="flex gap-2"><span className="w-4 shrink-0 font-semibold text-[#A3E635]">{numbered[1]}.</span><span><Inline text={numbered[2]} /></span></p>;
                                }
                                return <p key={j} className={i === 0 && !heading ? 'text-[15px] font-medium text-white' : ''}><Inline text={line} /></p>;
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

const TONE = {
    alert: { ring: 'border-red-500/30', badge: 'bg-red-500/15 text-red-300', icon: AlertTriangle, label: 'Needs attention' },
    watch: { ring: 'border-amber-400/25', badge: 'bg-amber-400/15 text-amber-200', icon: TrendingUp, label: 'Watch this' },
    good: { ring: 'border-[#A3E635]/25', badge: 'bg-[#A3E635]/15 text-[#A3E635]', icon: CheckCircle2, label: 'On track' },
    neutral: { ring: 'border-white/10', badge: 'bg-white/10 text-zinc-300', icon: Sparkles, label: 'Getting started' },
};

function InsightCard({ insight, loading }) {
    if (loading) {
        return <div className="h-40 animate-pulse rounded-2xl border border-white/5 bg-zinc-900/70" aria-label="Loading your money insight" />;
    }
    if (!insight) return null;
    const tone = TONE[insight.tone] || TONE.neutral;
    const Icon = tone.icon;
    return (
        <section aria-label="Your money today" className={`rounded-2xl border ${tone.ring} bg-gradient-to-br from-[#10190a] via-zinc-950 to-zinc-950 p-4`}>
            <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-[.16em] text-zinc-400">Your money today</p>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone.badge}`}><Icon className="h-3 w-3" aria-hidden />{tone.label}</span>
            </div>
            <p className="mt-2 text-[15px] font-semibold leading-snug text-white">{insight.headline}</p>
            <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-black tabular-nums text-[#A3E635]">₹{Number(insight.figure?.value || 0).toLocaleString('en-IN')}</span>
                <span className="text-xs text-zinc-400">{insight.figure?.label}</span>
            </div>
            {insight.opportunity && <p className="mt-2 text-sm text-zinc-300"><Inline text={insight.opportunity} /></p>}
            {insight.nextMove && (
                <div className="mt-3 rounded-xl bg-white/[.04] px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#A3E635]">Next move</p>
                    <p className="mt-0.5 text-sm text-zinc-200"><Inline text={insight.nextMove} /></p>
                </div>
            )}
        </section>
    );
}

/**
 * Vittova AI — personal finance mentor.
 *
 * Every figure is calculated by the server from the user's own data; the
 * language model only words the answer, and the server discards replies with
 * figures it did not calculate. Limits are enforced by the server (free plan:
 * 10 questions a day, plus short-term rate limits); this page only displays
 * them. Replies never contain links or product recommendations.
 */
export default function Chatbot() {
    const { session, refreshProfile } = useAuth();
    const { isPro, limits, applyQuota } = usePro();
    const [messages, setMessages] = useState([GREETING]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [limitReached, setLimitReached] = useState(false);
    const [insight, setInsight] = useState(null);
    const [insightLoading, setInsightLoading] = useState(true);
    const [suggestions, setSuggestions] = useState(FALLBACK_SUGGESTIONS);
    const scrollRef = useRef(null);
    const inputRef = useRef(null);
    const askedFromState = useRef(false);
    const location = useLocation();
    const navigate = useNavigate();
    const token = session?.access_token;

    const scrollToBottom = useCallback((behavior = 'smooth') => {
        const el = scrollRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior });
    }, []);

    const loadInsights = useCallback(async () => {
        if (!token) return;
        setInsightLoading(true);
        try {
            const res = await apiFetch(`${API_URL}/ai/insights`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                setInsight(data.insight);
                if (Array.isArray(data.suggestions) && data.suggestions.length) setSuggestions(data.suggestions);
            } else if (data.code === 'PROFILE_NOT_FOUND') {
                refreshProfile?.();
            }
        } catch {
            // The insight card is optional; questions still work without it.
        } finally {
            setInsightLoading(false);
        }
    }, [token, refreshProfile]);

    useEffect(() => { loadInsights(); }, [loadInsights]);
    useEffect(() => { track('ai_mentor_opened'); }, []);

    useEffect(() => {
        if (!token) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const res = await apiFetch(`${API_URL}/ai/history`, { headers: { Authorization: `Bearer ${token}` } });
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled && Array.isArray(data.history) && data.history.length > 0) {
                    setMessages([GREETING, ...data.history]);
                    requestAnimationFrame(() => scrollToBottom('auto'));
                }
            } catch {
                // History is a convenience; the chat still works without it.
            }
        })();
        return () => { cancelled = true; };
    }, [token, scrollToBottom]);

    useEffect(() => { scrollToBottom(); }, [messages, isLoading, scrollToBottom]);

    const addBot = (content, extra = {}) =>
        setMessages((prev) => [...prev, { id: `bot-${Date.now()}-${Math.random()}`, role: 'bot', content, ...extra }]);

    const send = async (text) => {
        const query = String(text || '').trim();
        if (!query || isLoading || query.length > MAX_CHARS || limitReached) return;

        setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: 'user', content: query }]);
        setInput('');
        setIsLoading(true);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            // Plain fetch, no automatic retry: a question must not be charged twice.
            const res = await fetch(`${API_URL}/ai/invest-advice`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ query }),
                signal: controller.signal,
            });
            const data = await res.json().catch(() => ({}));

            if (res.status === 429 && data.code === 'QUOTA_EXCEEDED') {
                setLimitReached(true);
                addBot("You've reached your free AI questions for today. You can continue tomorrow.", { isLimitAlert: true });
                return;
            }
            if (res.status === 404 && data.code === 'PROFILE_NOT_FOUND') {
                addBot(data.message, { isError: true, retry: query, repairProfile: true });
                return;
            }
            if (res.status >= 500) {
                // Only show the server's text when it is the mentor's own friendly message.
                addBot(data.code === 'AI_UNAVAILABLE' && data.message ? data.message : UNAVAILABLE, { isError: true, retry: query });
                return;
            }
            if (!res.ok || !data.success) {
                const err = Object.assign(new Error(data.message || `HTTP ${res.status}`), { status: res.status, data });
                addBot(friendlyError(err, UNAVAILABLE), { isError: true, retry: res.status === 429 ? null : query });
                return;
            }

            if (data.quota) applyQuota(data.quota);
            addBot(data.reply, { source: data.source, aiFallback: data.aiFallback });
        } catch (err) {
            const timedOut = err?.name === 'AbortError';
            addBot(timedOut ? 'That took longer than expected. Your financial data is safe; please try again.' : friendlyError(err, UNAVAILABLE), { isError: true, retry: query });
        } finally {
            clearTimeout(timer);
            setIsLoading(false);
        }
    };

    // A question passed from another screen (Home's "See why") is asked once.
    const pendingAsk = location.state?.ask;
    useEffect(() => {
        if (!token || !pendingAsk || askedFromState.current) return;
        askedFromState.current = true;
        navigate(location.pathname, { replace: true, state: null });
        send(pendingAsk);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, pendingAsk]);

    const retry = async (msg) => {
        if (msg.repairProfile) await refreshProfile?.();
        setMessages((prev) => prev.filter((m) => m.id !== msg.id));
        send(msg.retry);
    };

    const pickSuggestion = (s) => {
        if (s.prefill) {
            setInput(s.prefill);
            requestAnimationFrame(() => {
                inputRef.current?.focus();
                inputRef.current?.setSelectionRange(s.prefill.length, s.prefill.length);
            });
            return;
        }
        send(s.label);
    };

    const onKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send(input);
        }
    };

    // Auto-grow the question box up to four lines.
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
    }, [input]);

    const fresh = messages.length === 1 && !isLoading;

    const remaining = !isPro && limits?.chatMessagesLimit != null
        ? Math.max(0, limits.chatMessagesLimit - (limits.chatMessagesUsed || 0))
        : null;

    return (
        <div className="chat-shell -mx-4 -mt-3 flex h-[calc(100dvh-4.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col bg-black text-zinc-100 md:m-0 md:h-[calc(100dvh-4rem)] md:rounded-2xl md:border md:border-white/10">
            <header className="flex items-center gap-3 border-b border-white/10 bg-zinc-950/95 px-4 py-3">
                <VittovaLogo size={32} />
                <div className="min-w-0 flex-1">
                    <h1 className="text-base font-extrabold leading-tight text-white">Ask Vittova</h1>
                    <p className="text-xs text-zinc-400">Answers from your own numbers</p>
                </div>
                {remaining !== null && (
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${remaining === 0 ? 'bg-red-500/15 text-red-300' : 'bg-white/[.06] text-zinc-300'}`}>
                        {remaining} left today
                    </span>
                )}
            </header>

            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
                <InsightCard insight={insight} loading={insightLoading} />

                {fresh && (
                    <section aria-labelledby="quick-asks" className="v-enter">
                        <h2 id="quick-asks" className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[.16em] text-zinc-500">Tap to ask</h2>
                        <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-[20px] border border-white/[0.06] bg-[#111113]">
                            {QUICK_ACTIONS.map((q) => (
                                <li key={q}>
                                    <button type="button" onClick={() => send(q)} disabled={limitReached}
                                        className="v-press flex min-h-[52px] w-full items-center justify-between gap-3 px-4 text-left text-[15px] font-semibold text-zinc-100 disabled:opacity-40">
                                        {q}<ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" aria-hidden />
                                    </button>
                                </li>
                            ))}
                        </ul>
                        <p className="mt-3 px-1 text-xs leading-5 text-zinc-500">I read your budget, spending, bills and savings target in Vittova. Income and bank balances aren't tracked, so I'll say when something is missing.</p>
                    </section>
                )}

                <div aria-live="polite" className="space-y-4">
                    <AnimatePresence initial={false}>
                        {messages.filter((msg) => !(fresh && msg.id === 'greeting')).map((msg) => (
                            <motion.div
                                key={msg.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.18 }}
                                className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                            >
                                {msg.role === 'user' ? (
                                    <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-[#A3E635] px-4 py-2.5 text-[15px] font-medium text-black">
                                        {msg.content}
                                    </div>
                                ) : (
                                    <div className="w-full max-w-[95%]">
                                        <div className={`break-words rounded-2xl rounded-bl-md border px-4 py-3 text-sm leading-relaxed ${
                                            msg.isError
                                                ? 'border-red-500/25 bg-red-950/40 text-red-100'
                                                : msg.isLimitAlert
                                                    ? 'border-amber-400/25 bg-amber-950/30 text-amber-50'
                                                    : 'border-white/10 bg-zinc-900 text-zinc-200'
                                        }`}>
                                            {msg.isError || msg.isLimitAlert ? <p>{msg.content}</p> : <AnswerText text={msg.content} />}
                                        </div>
                                        <div className="mt-1.5 flex flex-wrap items-center gap-3 px-1 text-[11px] text-zinc-500">
                                            {msg.source === 'ai' && <span>Based on your Vittova data</span>}
                                            {msg.source === 'calculated' && <span>{msg.aiFallback ? 'Calculated from your data (AI wording unavailable)' : 'Calculated from your data'}</span>}
                                            {msg.retry && (
                                                <button type="button" onClick={() => retry(msg)} disabled={isLoading} className="inline-flex min-h-8 items-center gap-1 font-semibold text-[#A3E635] disabled:opacity-50">
                                                    <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Try again
                                                </button>
                                            )}
                                            {msg.isLimitAlert && <Link to="/pro" className="font-semibold text-amber-300 underline">See what Vittova Pro will include</Link>}
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {isLoading && (
                        <div className="flex items-center gap-3 rounded-2xl rounded-bl-md border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-zinc-400" role="status">
                            <span className="flex gap-1" aria-hidden>
                                {[0, 150, 300].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#A3E635]" style={{ animationDelay: `${d}ms` }} />)}
                            </span>
                            Checking your numbers…
                        </div>
                    )}
                </div>
            </div>

            <div className="border-t border-white/10 bg-zinc-950/95 px-4 pb-3 pt-2.5">
                {!fresh && <div className="-mx-4 mb-2.5 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
                    {suggestions.map((s) => (
                        <button
                            key={s.label}
                            type="button"
                            onClick={() => pickSuggestion(s)}
                            disabled={isLoading || limitReached}
                            className="min-h-9 shrink-0 rounded-full border border-white/10 bg-zinc-900 px-3.5 text-[13px] font-medium text-zinc-200 transition-colors hover:border-[#A3E635]/50 active:bg-zinc-800 disabled:opacity-40"
                        >
                            {s.label}
                        </button>
                    ))}
                </div>}
                <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-end gap-2">
                    <label htmlFor="mentor-question" className="sr-only">Your question</label>
                    <textarea
                        id="mentor-question"
                        ref={inputRef}
                        rows={1}
                        value={input}
                        maxLength={MAX_CHARS}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder={limitReached ? 'Daily limit reached. Come back tomorrow.' : 'Or type your own question…'}
                        disabled={limitReached}
                        className="max-h-28 min-h-12 flex-1 resize-none rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-[15px] leading-6 text-white outline-none placeholder:text-zinc-500 focus:border-[#A3E635]/60 disabled:opacity-60"
                    />
                    <button
                        type="submit"
                        aria-label="Send question"
                        disabled={!input.trim() || isLoading || limitReached}
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#A3E635] text-black transition-transform active:scale-95 disabled:bg-zinc-800 disabled:text-zinc-500"
                    >
                        <Send className="h-5 w-5" />
                    </button>
                </form>
                <div className="mt-2 flex items-start justify-between gap-3 text-[11px] leading-4 text-zinc-500">
                    <p className="flex items-start gap-1">
                        <Info className="mt-px h-3 w-3 shrink-0" aria-hidden />
                        General education, not investment advice. Vittova is not a SEBI-registered adviser.
                    </p>
                    {input.length > MAX_CHARS * 0.8 && <span className="shrink-0 tabular-nums">{input.length}/{MAX_CHARS}</span>}
                </div>
            </div>
        </div>
    );
}
