import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, TrendingUp, ShieldCheck, Banknote } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// Pre-defined Action Chips based on keyword matching
const CHIPS = [
    {
        keyword: 'Mutual Funds',
        label: 'Explore Mutual Funds',
        icon: <TrendingUp className="w-4 h-4" />,
        link: 'https://zerodha.com/fundhouse'
    },
    {
        keyword: 'Gold',
        label: 'Buy Digital Gold',
        icon: <ShieldCheck className="w-4 h-4" />,
        link: 'https://paytm.com/digital-gold'
    },
    {
        keyword: 'FD',
        label: 'High-Yield FDs',
        icon: <Banknote className="w-4 h-4" />,
        link: 'https://www.stablemoney.in/'
    }
];

export default function Chatbot() {
    const { session } = useAuth();
    const [messages, setMessages] = useState([
        { 
            id: 1, 
            role: 'bot', 
            content: "What’s up, boss? Ask me where to invest your money and I’ll use this month’s actual spending — no generic gyaan.",
            chips: []
        }
    ]);
    const [input, setInput] = useState('');
    const [goal, setGoal] = useState('habit');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async (e) => {
        e?.preventDefault();
        if (!input.trim()) return;

        const userMsg = { id: Date.now(), role: 'user', content: input, chips: [] };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || 'https://spendly-t8s6.onrender.com/api'}/ai/invest-advice`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
                },
                body: JSON.stringify({ query: input, goal })
            });
            const data = await res.json();
            
            const reply = data.reply || "Error: AI is broke right now.";

            // Detect keywords for Action Chips
            const activeChips = CHIPS.filter(chip => 
                reply.toLowerCase().includes(chip.keyword.toLowerCase())
            );

            const botMsg = { 
                id: Date.now() + 1, 
                role: 'bot', 
                content: reply,
                chips: activeChips
            };

            setMessages(prev => [...prev, botMsg]);
        } catch (error) {
            setMessages(prev => [...prev, { 
                id: Date.now() + 1, 
                role: 'bot', 
                content: "Bhai, server is down. Keep your money under the mattress for now.",
                chips: []
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-80px)] md:h-[calc(100vh-40px)] bg-[var(--color-bg)]">
            
            {/* Header */}
            <div className="flex items-center gap-4 p-4 border-b border-[var(--glass-border)] bg-black/40 backdrop-blur-md sticky top-0 z-10 rounded-t-2xl">
                <div className="w-12 h-12 rounded-full bg-[var(--color-neon-green)]/10 flex items-center justify-center border border-[var(--color-neon-green)]/30">
                    <Bot className="w-6 h-6 text-[var(--color-neon-green)]" />
                </div>
                <div>
                    <h1 className="text-xl font-extrabold text-[var(--color-neon-green)]">Spendly AI</h1>
                    <p className="text-sm text-[var(--color-text)]/70">Your intelligent finance assistant</p>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <AnimatePresence initial={false}>
                    {messages.map((msg) => (
                        <motion.div 
                            key={msg.id}
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
                        >
                            {/* Avatar */}
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 ${
                                msg.role === 'user' 
                                    ? 'bg-[var(--color-electric-blue)]/20 text-[var(--color-electric-blue)]' 
                                    : 'bg-[var(--color-neon-green)]/20 text-[var(--color-neon-green)]'
                            }`}>
                                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                            </div>

                            {/* Message Bubble */}
                            <div className="flex flex-col gap-2">
                                <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
                                    msg.role === 'user'
                                        ? 'bg-[var(--color-electric-blue)]/10 border border-[var(--color-electric-blue)]/30 text-[var(--color-text)] rounded-tr-none'
                                        : 'bg-zinc-900 border border-[var(--glass-border)] text-[var(--color-text)]/90 rounded-tl-none'
                                } whitespace-pre-wrap`}>
                                    {msg.content}
                                </div>

                                {/* Action Chips */}
                                {msg.chips?.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-1">
                                        {msg.chips.map((chip, idx) => (
                                            <motion.a
                                                key={idx}
                                                href={chip.link}
                                                target="_blank"
                                                rel="noreferrer"
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 border border-[var(--color-neon-green)]/40 rounded-full text-xs font-bold text-[var(--color-neon-green)] hover:bg-[var(--color-neon-green)]/10 transition-colors"
                                            >
                                                {chip.icon}
                                                {chip.label}
                                            </motion.a>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ))}
                    
                    {isLoading && (
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex gap-3 max-w-[85%]"
                        >
                            <div className="w-8 h-8 rounded-full bg-[var(--color-neon-green)]/20 flex items-center justify-center shrink-0 mt-1 border border-[var(--color-neon-green)]/30">
                                <Bot className="w-4 h-4 text-[var(--color-neon-green)]" />
                            </div>
                            <div className="p-4 rounded-2xl bg-zinc-900 border border-[var(--glass-border)] rounded-tl-none flex items-center gap-1.5">
                                <span className="w-2 h-2 bg-[var(--color-neon-green)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-2 h-2 bg-[var(--color-neon-green)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-2 h-2 bg-[var(--color-neon-green)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-black/40 backdrop-blur-md border-t border-[var(--glass-border)] rounded-b-2xl">
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2" htmlFor="investment-goal">This month’s goal</label>
                <select
                    id="investment-goal"
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                    disabled={isLoading}
                    className="mb-3 w-full bg-[var(--input-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-neon-green)]"
                >
                    <option value="habit">Build an investing habit</option>
                    <option value="passive growth">Passive growth with mutual funds</option>
                    <option value="active learning">Learn direct stocks safely</option>
                </select>
                <form onSubmit={handleSend} className="relative flex items-center">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Where should I invest 5000 rs?"
                        className="w-full bg-[var(--input-bg)] border border-[var(--glass-border)] rounded-full pl-6 pr-14 py-4 text-sm outline-none focus:border-[var(--color-neon-green)] transition-colors text-[var(--color-text)]"
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="absolute right-2 p-2.5 bg-[var(--color-neon-green)] text-black rounded-full hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 transition-all"
                    >
                        <Send className="w-5 h-5" />
                    </button>
                </form>
            </div>
        </div>
    );
}
