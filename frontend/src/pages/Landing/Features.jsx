import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Bot, Users, ShieldAlert, TrendingUp, MessageSquare, Coins, ArrowUpRight } from 'lucide-react';

// ── Reveal animation hook ──
function useReveal(delay = 0) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return {
    ref,
    initial: { opacity: 0, y: 40 },
    animate: inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 },
    transition: { duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] },
  };
}

// ── AI Chat Bubble Mockup ──
function AIChatMockup() {
  return (
    <div className="mt-4 flex flex-col gap-2">
      {[
        { text: 'How much did I spend on food this week?', from: 'user' },
        { text: '₹1,240 on food — 18% less than last week! 🎉', from: 'ai' },
      ].map((m, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: m.from === 'user' ? 15 : -15 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 + i * 0.2 }}
          className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[80%] px-3 py-2 rounded-2xl text-xs leading-snug font-medium ${
              m.from === 'user'
                ? 'bg-emerald-500 text-zinc-950 rounded-tr-sm'
                : 'bg-zinc-800 text-zinc-200 rounded-tl-sm border border-white/5'
            }`}
          >
            {m.from === 'ai' && (
              <span className="text-emerald-400 font-bold block text-[9px] mb-0.5 uppercase tracking-wide">Spendly AI</span>
            )}
            {m.text}
          </div>
        </motion.div>
      ))}
      {/* Typing indicator */}
      <div className="flex justify-start">
        <div className="bg-zinc-800 border border-white/5 px-3 py-2 rounded-2xl rounded-tl-sm flex gap-1 items-center">
          {[0, 0.2, 0.4].map((d, i) => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-emerald-400"
              animate={{ y: [0, -4, 0] }}
              transition={{ repeat: Infinity, duration: 0.8, delay: d }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Split UI Mockup ──
function SplitMockup() {
  const people = [
    { name: 'You', paid: true, amt: '₹840' },
    { name: 'Raj', paid: false, amt: '₹420' },
    { name: 'Priya', paid: false, amt: '₹420' },
  ];
  return (
    <div className="mt-4 space-y-2">
      <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wide">Dinner split — ₹1,680</p>
      {people.map((p, i) => (
        <motion.div
          key={p.name}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 + i * 0.1 }}
          className="flex items-center justify-between rounded-xl bg-zinc-900/60 border border-white/5 px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-lime-400 text-[10px] font-bold text-black">
              {p.name[0]}
            </div>
            <span className="text-xs text-zinc-300 font-medium">{p.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white">{p.amt}</span>
            {p.paid ? (
              <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 px-2 py-0.5 rounded-full font-semibold">Paid</span>
            ) : (
              <span className="text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-semibold">Owes</span>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ── Budget Guard Mockup ──
function BudgetMockup() {
  return (
    <div className="mt-4 space-y-3">
      {[
        { cat: 'Food & Dining', used: 78, color: 'from-amber-400 to-orange-400', warn: true },
        { cat: 'Entertainment', used: 45, color: 'from-purple-400 to-pink-400', warn: false },
        { cat: 'Transport', used: 92, color: 'from-rose-500 to-red-500', warn: true },
      ].map((b, i) => (
        <motion.div
          key={b.cat}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 + i * 0.15 }}
        >
          <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
            <span>{b.cat}</span>
            <span className={b.warn ? 'text-amber-400 font-bold' : 'text-zinc-400'}>{b.used}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <motion.div
              className={`h-full rounded-full bg-gradient-to-r ${b.color}`}
              initial={{ width: 0 }}
              animate={{ width: `${b.used}%` }}
              transition={{ delay: 0.4 + i * 0.1, duration: 0.9, ease: 'easeOut' }}
            />
          </div>
          {b.warn && (
            <p className="text-[9px] text-amber-400 mt-0.5">⚠️ Almost at limit!</p>
          )}
        </motion.div>
      ))}
    </div>
  );
}

// ── Round-Up Mockup ──
function RoundUpMockup() {
  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between bg-zinc-900/60 border border-white/5 rounded-xl px-3 py-2">
        <div>
          <p className="text-[10px] text-zinc-500">Invested via Round-Ups</p>
          <p className="text-base font-bold text-white">₹1,248</p>
        </div>
        <Coins className="h-8 w-8 text-lime-400 opacity-80" />
      </div>
      {[
        { tx: 'Coffee ₹68', roundup: '+₹2' },
        { tx: 'Auto ₹54', roundup: '+₹6' },
        { tx: 'Grocery ₹243', roundup: '+₹7' },
      ].map((r, i) => (
        <motion.div
          key={r.tx}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 + i * 0.1 }}
          className="flex items-center justify-between text-[10px] text-zinc-500 px-1"
        >
          <span>{r.tx}</span>
          <span className="font-bold text-lime-400">{r.roundup} saved</span>
        </motion.div>
      ))}
    </div>
  );
}

// ── Feature Card ──
function FeatureCard({ icon: Icon, iconColor, title, description, children, className = '', delay = 0 }) {
  const reveal = useReveal(delay);
  return (
    <motion.div
      ref={reveal.ref}
      initial={reveal.initial}
      animate={reveal.animate}
      transition={reveal.transition}
      className={`group relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/90 p-6
        hover:-translate-y-1 hover:border-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/5 transition-all duration-300 ${className}`}
    >
      {/* Card glow on hover */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-lime-400/5 via-transparent to-emerald-400/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

      <div className={`inline-flex p-2.5 rounded-xl mb-4 ${iconColor}`}>
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="text-base font-bold text-white mb-1.5">{title}</h3>
      <p className="text-sm text-zinc-400 leading-relaxed">{description}</p>
      {children}
    </motion.div>
  );
}

// ── Features Section ──
export default function Features() {
  const headingReveal = useReveal(0);

  return (
    <section id="features" className="relative overflow-hidden bg-black px-5 py-28">
      {/* Background decoration */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
      <div className="pointer-events-none absolute -top-40 right-0 h-96 w-96 rounded-full bg-lime-700/10 blur-3xl" />

      <div className="max-w-6xl mx-auto">
        {/* Heading */}
        <motion.div
          ref={headingReveal.ref}
          initial={headingReveal.initial}
          animate={headingReveal.animate}
          transition={headingReveal.transition}
          className="text-center mb-16"
        >
          <span className="inline-block px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 mb-4">
            Everything you need
          </span>
          <h2 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight mb-4">
            Built for the way you actually{' '}
            <span className="text-lime-400">
              live & spend
            </span>
          </h2>
          <p className="text-zinc-400 text-base max-w-xl mx-auto">
            Four powerful features, one seamless experience. No spreadsheets. No stress.
          </p>
        </motion.div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Card 1 — AI (large, spans 2 cols on lg) */}
          <FeatureCard
            icon={Bot}
            iconColor="bg-emerald-500/15 text-emerald-400"
            title="Spendly AI"
            description="Chat with your money. Smart receipt scanning and instant categorization powered by AI."
            className="lg:col-span-2"
            delay={0.05}
          >
            <AIChatMockup />
          </FeatureCard>

          {/* Card 2 — Round-Ups */}
          <FeatureCard
            icon={TrendingUp}
            iconColor="bg-lime-400/15 text-lime-400"
            title="Round-Ups"
            description="Save while you spend by auto-investing your spare change into a micro-savings vault."
            delay={0.1}
          >
            <RoundUpMockup />
          </FeatureCard>

          {/* Card 3 — Budget Guard */}
          <FeatureCard
            icon={ShieldAlert}
            iconColor="bg-amber-500/15 text-amber-400"
            title="Aukatt Alert"
            description="Real-time alerts before you overspend. Know your aukatt, stay on track — Spendly has your back."
            delay={0.15}
          >
            <BudgetMockup />
          </FeatureCard>

          {/* Card 4 — Group Splits */}
          <FeatureCard
            icon={Users}
            iconColor="bg-purple-500/15 text-purple-400"
            title="Group Splits"
            description="No more awkward math. Split expenses with friends instantly and settle with one tap."
            className="lg:col-span-2"
            delay={0.2}
          >
            <SplitMockup />
          </FeatureCard>
        </div>
      </div>
    </section>
  );
}
