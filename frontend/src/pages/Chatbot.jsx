import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePro } from '../contexts/ProContext';
import { Link } from 'react-router-dom';
import { API_URL, apiFetch } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';

const MAX_CHARS = 500;

const SUGGESTIONS = [
    'Why did I spend more this month?',
    'Can I afford a ₹3,000 purchase this week?',
    'How does an emergency fund work?',
];

const GREETING = {
    id: 'greeting',
    role: 'bot',
    content: "Ask me about your spending — where it went, what you can afford, or how to save. I can also explain general money concepts. I don't recommend specific investments.",
};

/**
 * Spendly money coach.
 *
 * Limits are enforced by the server (free plan: 10 questions a day, plus
 * short-term rate limits). The page shows what the server reports and never
 * decides access itself. Replies never contain links or product
 * recommendations (see FINANCIAL_CONTENT_REVIEW.md).
 */
export default function Chatbot() {
    const { session } = useAuth();
    const { isPro, limits, applyQuota } = usePro();
    const [messages, setMessages] = useState([GREETING]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [limitReached, setLimitReached] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (!session?.access_token) return;
        let cancelled = false;
        (async () => {
            try {
                // GET is safe to retry while the server wakes up.
                const res = await apiFetch(`${API_URL}/ai/history`, {
                    headers: { Authorization: `Bearer ${session.access_token}` },
                });
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled && Array.isArray(data.history) && data.history.length > 0) {
                    setMessages([GREETING, ...data.history]);
                }
            } catch {
                // History is a convenience; the chat still works without it.
            }
        })();
        return () => { cancelled = true; };
    }, [session?.access_token]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const addBot = (content, extra = {}) =>
        setMessages((prev) => [...prev, { id: `bot-${Date.now()}`, role: 'bot', content, ...extra }]);

    const send = async (text) => {
        const query = text.trim();
        if (!query || isLoading || query.length > MAX_CHARS) return;

        setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: 'user', content: query }]);
        setInput('');
        setIsLoading(true);

        try {
            // Plain fetch: a question must not be sent twice by automatic retries.
            const res = await fetch(`${API_URL}/ai/invest-advice`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
                },
                body: JSON.stringify({ query }),
            });
            const data = await res.json().catch(() => ({}));

            if (res.status === 429 && data.code === 'QUOTA_EXCEEDED') {
                setLimitReached(true);
                addBot(data.message || "You've used today's free questions.", { isLimitAlert: true });
                return;
            }
            if (!res.ok || !data.success) {
                const err = Object.assign(new Error(data.message || `HTTP ${res.status}`), { status: res.status, data });
                addBot(friendlyError(err, "I couldn't answer that just now. Please try again."), { isError: true });
                return;
            }

            if (data.quota) applyQuota(data.quota);
            addBot(data.reply);
        } catch (err) {
            addBot(friendlyError(err, "I couldn't reach the server. Please check your connection."), { isError: true });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        send(input);
    };

    const remaining = !isPro && limits?.chatMessagesLimit != null
        ? Math.max(0, limits.chatMessagesLimit - (limits.chatMessagesUsed || 0))
        : null;

    return (
        <div className="flex flex-col h-[calc(100vh-80px)] md:h-[calc(100vh-40px)] bg-[var(--color-bg)]">
            <div className="flex items-center gap-4 p-4 border-b border-[var(--glass-border)] bg-black/40 backdrop-blur-md sticky top-0 z-10 rounded-t-2xl">
                <div className="w-12 h-12 rounded-full bg-[var(--color-neon-green)]/10 flex items-center justify-center border border-[var(--color-neon-green)]/30">
                    <Bot className="w-6 h-6 text-[var(--color-neon-green)]" />
                </div>
                <div className="min-w-0 flex-1">
                    <h1 className="text-xl font-extrabold text-[var(--color-neon-green)]">Money coach</h1>
                    <p className="text-sm text-[var(--color-text)]/70">
                        {remaining !== null ? `${remaining} free question${remaining === 1 ? '' : 's'} left today` : 'Answers based on your own spending'}
                    </p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <AnimatePresence initial={false}>
                    {messages.map((msg) => (
                        <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
                        >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 ${
                                msg.role === 'user'
                                    ? 'bg-[var(--color-electric-blue)]/20 text-[var(--color-electric-blue)]'
                                    : 'bg-[var(--color-neon-green)]/20 text-[var(--color-neon-green)]'
                            }`}>
                                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                            </div>

                            <div className="flex flex-col gap-2">
                                <div className={`p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                                    msg.role === 'user'
                                        ? 'bg-[var(--color-electric-blue)]/10 border border-[var(--color-electric-blue)]/30 text-[var(--color-text)] rounded-tr-none'
                                        : msg.isError
                                            ? 'bg-red-500/10 border border-red-500/20 text-red-200 rounded-tl-none'
                                            : 'bg-zinc-900 border border-[var(--glass-border)] text-[var(--color-text)]/90 rounded-tl-none'
                                }`}>
                                    {msg.content}
                                </div>
                                {msg.isLimitAlert && (
                                    <Link to="/pro" className="text-xs font-bold text-amber-300 underline">See what Spendly Pro will include</Link>
                                )}
                            </div>
                        </motion.div>
                    ))}

                    {isLoading && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3 max-w-[85%]" role="status" aria-label="Coach is typing">
                            <div className="w-8 h-8 rounded-full bg-[var(--color-neon-green)]/20 flex items-center justify-center shrink-0 mt-1 border border-[var(--color-neon-green)]/30">
                                <Bot className="w-4 h-4 text-[var(--color-neon-green)]" />
                            </div>
                            <div className="p-4 rounded-2xl bg-zinc-900 border border-[var(--glass-border)] rounded-tl-none flex items-center gap-1.5">
                                {[0, 150, 300].map((d) => (
                                    <span key={d} className="w-2 h-2 bg-[var(--color-neon-green)] rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-black/40 backdrop-blur-md border-t border-[var(--glass-border)] rounded-b-2xl">
                {messages.length <= 1 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                        {SUGGESTIONS.map((s) => (
                            <button key={s} type="button" onClick={() => send(s)} disabled={isLoading || limitReached}
                                className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 disabled:opacity-50">
                                {s}
                            </button>
                        ))}
                    </div>
                )}
                <form onSubmit={handleSubmit} className="relative flex items-center">
                    <input
                        type="text"
                        value={input}
                        maxLength={MAX_CHARS}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={limitReached ? 'Daily limit reached. Come back tomorrow.' : 'Ask about your spending…'}
                        aria-label="Your question"
                        className="w-full bg-[var(--input-bg)] border border-[var(--glass-border)] rounded-full pl-6 pr-14 py-4 text-sm outline-none focus:border-[var(--color-neon-green)] transition-colors text-[var(--color-text)]"
                        disabled={isLoading || limitReached}
                    />
                    <button
                        type="submit"
                        aria-label="Send"
                        disabled={!input.trim() || isLoading || limitReached}
                        className="absolute right-2 p-2.5 bg-[var(--color-neon-green)] text-black rounded-full hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 transition-all"
                    >
                        <Send className="w-5 h-5" />
                    </button>
                </form>
                <div className="mt-2 flex items-start justify-between gap-3 text-[10px] text-zinc-500">
                    <p className="flex items-start gap-1">
                        <Info className="mt-px h-3 w-3 shrink-0" />
                        General education, not investment advice. Spendly is not a SEBI-registered adviser. AI answers can be wrong.
                    </p>
                    {input.length > MAX_CHARS * 0.8 && <span className="shrink-0">{input.length}/{MAX_CHARS}</span>}
                </div>
            </div>
        </div>
    );
}
