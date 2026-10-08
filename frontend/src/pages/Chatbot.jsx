import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, Info, RotateCcw, ChevronRight } from 'lucide-react';
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
        if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong>;
        if (/^₹/.test(part)) return <span key={i} className="font-semibold tabular-nums text-ink">{part}</span>;
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
                        {heading && <p className="mb-1.5 text-[13px] font-semibold text-ink">{heading[1]}</p>}
                        <div className="space-y-1">
                            {body.map((line, j) => {
                                const bullet = /^\s*[•-]\s+(.*)$/.exec(line);
                                const numbered = /^\s*(\d+)\.\s+(.*)$/.exec(line);
                                if (bullet) {
                                    return <p key={j} className="flex gap-2"><span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-ink-3" aria-hidden /><span><Inline text={bullet[1]} /></span></p>;
                                }
                                if (numbered) {
                                    return <p key={j} className="flex gap-2"><span className="w-4 shrink-0 tabular-nums text-ink-3">{numbered[1]}.</span><span><Inline text={numbered[2]} /></span></p>;
                                }
                                return <p key={j} className={i === 0 && !heading ? 'text-[15px] font-medium text-ink' : ''}><Inline text={line} /></p>;
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// A status is plain coloured text, never a badge.
const TONE = {
    alert: { text: 'text-danger', label: 'Needs attention' },
    watch: { text: 'text-warn', label: 'Watch this' },
    good: { text: 'text-accent', label: 'On track' },
    neutral: { text: 'text-ink-2', label: 'Getting started' },
};

function InsightCard({ insight, loading }) {
    if (loading) {
        return <div className="h-36 animate-pulse rounded-2xl bg-surface" aria-label="Loading your money insight" />;
    }
    if (!insight) return null;
    const tone = TONE[insight.tone] || TONE.neutral;
    return (
        <section aria-label="Your money today" className="v-block p-4">
            <div className="flex items-center justify-between gap-2">
                <p className="v-label">Your money today</p>
                <span className={`text-xs font-semibold ${tone.text}`}>{tone.label}</span>
            </div>
            <p className="mt-2 text-[15px] font-medium leading-snug text-ink">{insight.headline}</p>
            <div className="mt-3 flex items-baseline gap-2">
                <span className="font-display text-3xl font-bold tabular-nums text-ink">₹{Number(insight.figure?.value || 0).toLocaleString('en-IN')}</span>
                <span className="text-xs text-ink-2">{insight.figure?.label}</span>
            </div>
            {insight.opportunity && <p className="mt-2 text-sm text-ink-2"><Inline text={insight.opportunity} /></p>}
            {insight.nextMove && (
                <div className="mt-3 border-t border-line pt-3">
                    <p className="text-xs font-semibold text-ink-3">Next move</p>
                    <p className="mt-0.5 text-sm text-ink-soft"><Inline text={insight.nextMove} /></p>
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
        <div className="chat-shell -mx-4 -mt-3 flex h-[calc(100dvh-4.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col bg-bg text-ink-soft md:m-0 md:h-[calc(100dvh-4rem)] md:rounded-2xl md:border md:border-line">
            <header className="flex items-center gap-3 border-b border-line px-4 py-3">
                <VittovaLogo size={28} />
                <div className="min-w-0 flex-1">
                    <h1 className="text-base font-bold leading-tight text-ink">Ask Vittova</h1>
                    <p className="text-xs text-ink-2">Answers from your own numbers</p>
                </div>
                {remaining !== null && (
                    <span className={`shrink-0 text-xs font-medium tabular-nums ${remaining === 0 ? 'text-danger' : 'text-ink-2'}`}>
                        {remaining} left today
                    </span>
                )}
            </header>

            <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4">
                <InsightCard insight={insight} loading={insightLoading} />

                {fresh && (
                    <section aria-labelledby="quick-asks" className="v-enter">
                        <h2 id="quick-asks" className="v-label mb-2">Tap to ask</h2>
                        <ul className="v-block v-rows overflow-hidden">
                            {QUICK_ACTIONS.map((q) => (
                                <li key={q}>
                                    <button type="button" onClick={() => send(q)} disabled={limitReached}
                                        className="v-press flex min-h-[52px] w-full items-center justify-between gap-3 px-4 text-left text-[15px] font-medium text-ink disabled:opacity-40">
                                        {q}<ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />
                                    </button>
                                </li>
                            ))}
                        </ul>
                        <p className="mt-3 text-xs leading-5 text-ink-3">I read your budget, spending, bills and savings target in Vittova. Income and bank balances aren't tracked, so I'll say when something is missing.</p>
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
                                    <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-surface-2 px-4 py-2.5 text-[15px] text-ink">
                                        {msg.content}
                                    </div>
                                ) : (
                                    <div className="w-full max-w-[95%]">
                                        <div className={`break-words text-sm leading-relaxed ${
                                            msg.isError
                                                ? 'v-error'
                                                : msg.isLimitAlert
                                                    ? 'rounded-xl bg-surface px-3 py-2.5 text-ink-soft'
                                                    : 'text-ink-soft'
                                        }`}>
                                            {msg.isError || msg.isLimitAlert ? <p>{msg.content}</p> : <AnswerText text={msg.content} />}
                                        </div>
                                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-ink-3">
                                            {msg.source === 'ai' && <span>Based on your Vittova data</span>}
                                            {msg.source === 'calculated' && <span>{msg.aiFallback ? 'Calculated from your data (AI wording unavailable)' : 'Calculated from your data'}</span>}
                                            {msg.retry && (
                                                <button type="button" onClick={() => retry(msg)} disabled={isLoading} className="inline-flex min-h-8 items-center gap-1 font-semibold text-ink disabled:opacity-50">
                                                    <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Try again
                                                </button>
                                            )}
                                            {msg.isLimitAlert && <Link to="/pro" className="font-semibold text-ink underline">See what Vittova Pro will include</Link>}
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {isLoading && (
                        <div className="flex items-center gap-3 text-sm text-ink-2" role="status">
                            <span className="flex gap-1" aria-hidden>
                                {[0, 150, 300].map((d) => <span key={d} className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-3" style={{ animationDelay: `${d}ms` }} />)}
                            </span>
                            Checking your numbers…
                        </div>
                    )}
                </div>
            </div>

            <div className="border-t border-line bg-bg px-4 pb-3 pt-2.5">
                {!fresh && <div className="-mx-4 mb-2.5 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
                    {suggestions.map((s) => (
                        <button
                            key={s.label}
                            type="button"
                            onClick={() => pickSuggestion(s)}
                            disabled={isLoading || limitReached}
                            className="min-h-9 shrink-0 rounded-full bg-surface-2 px-3.5 text-[13px] font-medium text-ink-soft transition-colors active:bg-surface-3 disabled:opacity-40"
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
                        className="v-input max-h-28 flex-1 resize-none rounded-2xl px-4 py-3 leading-6 disabled:opacity-60"
                    />
                    <button
                        type="submit"
                        aria-label="Send question"
                        disabled={!input.trim() || isLoading || limitReached}
                        className="v-press flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-on-fill disabled:bg-surface-2 disabled:text-ink-3"
                    >
                        <ArrowUp className="h-5 w-5" strokeWidth={2.5} />
                    </button>
                </form>
                <div className="mt-2 flex items-start justify-between gap-3 text-[11px] leading-4 text-ink-3">
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
