import { useState, useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';

// ── Floating orbs background ──
function GlowOrb({ className }) {
  return (
    <div
      className={`absolute rounded-full blur-3xl opacity-20 pointer-events-none ${className}`}
    />
  );
}

// ── Tilted App Mockup ──
function AppMockup() {
  const cardRef = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [8, -8]), { stiffness: 150, damping: 20 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-8, 8]), { stiffness: 150, damping: 20 });

  const handleMouseMove = (e) => {
    const rect = cardRef.current.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  };
  const handleMouseLeave = () => { x.set(0); y.set(0); };

  return (
    <motion.div
      ref={cardRef}
      style={{ rotateX, rotateY, transformPerspective: 1000 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      animate={{ y: [0, -14, 0] }}
      transition={{ y: { repeat: Infinity, duration: 5, ease: 'easeInOut' } }}
      className="relative w-72 md:w-80 cursor-none select-none"
    >
      {/* Phone shell */}
      <div className="relative rounded-[2.5rem] border border-zinc-800 bg-zinc-900/90 p-1 shadow-2xl shadow-lime-400/10">
        {/* Inner screen */}
        <div className="flex min-h-[520px] flex-col gap-3 overflow-hidden rounded-[2.2rem] bg-black p-4">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-[10px] text-zinc-500">Total Balance</p>
              <p className="text-2xl font-bold text-white tracking-tight">₹1,24,800</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-lime-400 text-xs font-bold text-black">
              AK
            </div>
          </div>

          {/* Spending Card */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
            <p className="mb-1 text-[10px] font-semibold text-lime-400">↑ Saved this month</p>
            <p className="text-lg font-bold text-white">₹3,240</p>
            <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-lime-400 shadow-[0_0_10px_rgba(132,204,22,0.5)]"
                initial={{ width: '0%' }}
                animate={{ width: '68%' }}
                transition={{ delay: 0.8, duration: 1.2, ease: 'easeOut' }}
              />
            </div>
          </div>

          {/* Recent Transactions */}
          <p className="text-[10px] text-zinc-500 mt-1 font-semibold">RECENT TRANSACTIONS</p>
          {[
            { name: 'Swiggy', cat: 'Food', amt: '-₹320', color: 'text-rose-400', icon: '🍕' },
            { name: 'Netflix', cat: 'Entertainment', amt: '-₹199', color: 'text-purple-400', icon: '🎬' },
            { name: 'Salary', cat: 'Income', amt: '+₹45,000', color: 'text-emerald-400', icon: '💼' },
            { name: 'Round-Up', cat: 'Savings', amt: '+₹48', color: 'text-emerald-400', icon: '🪙' },
          ].map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.1 }}
              className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0"
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{t.icon}</span>
                <div>
                  <p className="text-[11px] font-semibold text-white">{t.name}</p>
                  <p className="text-[9px] text-zinc-500">{t.cat}</p>
                </div>
              </div>
              <span className={`text-[11px] font-bold ${t.color}`}>{t.amt}</span>
            </motion.div>
          ))}

          {/* AI Insight chip */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 }}
            className="mt-auto flex items-start gap-2 rounded-xl border border-lime-500/20 bg-lime-950/30 p-2.5"
          >
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-lime-400" />
            <p className="text-[10px] text-zinc-400 leading-tight">
              <span className="font-semibold text-lime-400">AI Insight: </span>
              You spend 23% less on food this week. Keep it up! 🎉
            </p>
          </motion.div>
        </div>
      </div>

      {/* Glow under the phone */}
      <div className="absolute -bottom-8 inset-x-8 h-8 rounded-full bg-lime-400/20 blur-2xl" />
    </motion.div>
  );
}

// ── Hero ──
export default function Hero() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
    }, 1200);
  };

  const fadeUp = (delay = 0) => ({
    initial: { opacity: 0, y: 30 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] },
  });

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-black px-5 pb-20 pt-24">
      {/* Background glow orbs */}
      <GlowOrb className="-top-20 -left-20 h-96 w-96 bg-lime-500" />
      <GlowOrb className="bottom-0 right-0 h-80 w-80 bg-emerald-500" />
      <GlowOrb className="top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 bg-lime-700" />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 max-w-7xl w-full mx-auto flex flex-col lg:flex-row items-center justify-between gap-16">
        {/* Left: Text Content */}
        <div className="flex-1 text-center lg:text-left max-w-xl">
          {/* Badge */}
          <motion.div {...fadeUp(0)} className="inline-flex items-center gap-2 mb-6">
            <span className="rounded-full border border-lime-500/30 bg-lime-950/40 px-4 py-1.5 text-xs font-semibold text-lime-400">
              🚀 Now in Early Access
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            {...fadeUp(0.1)}
            className="text-5xl md:text-6xl xl:text-7xl font-extrabold leading-[1.05] tracking-tight text-white mb-5"
          >
            Master Your Money.
            <br />
            <span className="text-lime-400">
              Split the Bills.
            </span>
            <br />
            Zero Stress.
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            {...fadeUp(0.2)}
            className="text-base md:text-lg text-zinc-400 leading-relaxed mb-8 max-w-lg mx-auto lg:mx-0"
          >
            Spendly is the ultimate financial companion. Track expenses effortlessly with{' '}
            <span className="font-semibold text-lime-400">Spendly AI</span>, automate your{' '}
            <span className="font-semibold text-lime-400">Round-Ups</span>, and settle{' '}
            <span className="font-semibold text-lime-400">Group Splits</span> instantly.
          </motion.p>

          {/* Waitlist Form */}
          <motion.div {...fadeUp(0.3)} id="waitlist">
            {!submitted ? (
              <form
                onSubmit={handleSubmit}
                className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto lg:mx-0"
              >
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-500 transition-colors focus:border-lime-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 whitespace-nowrap rounded-xl bg-lime-400 px-6 py-3 font-bold text-black transition-colors hover:bg-lime-300 disabled:opacity-70"
                >
                  <span className="flex items-center gap-2">
                    {loading ? (
                      <span className="w-4 h-4 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        Join the Waitlist
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </span>
                </button>
              </form>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-5 py-4 max-w-md mx-auto lg:mx-0"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <p className="text-sm text-emerald-300 font-medium">
                  You're on the list! We'll notify you at <strong>{email}</strong>
                </p>
              </motion.div>
            )}
          </motion.div>

          {/* Social proof */}
          <motion.div
            {...fadeUp(0.4)}
            className="mt-6 flex items-center gap-3 justify-center lg:justify-start text-xs text-zinc-500"
          >
            <div className="flex -space-x-2">
              {['A', 'R', 'S', 'M'].map((l) => (
                <div
                  key={l}
                  className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-black bg-lime-400 text-[9px] font-bold text-black"
                >
                  {l}
                </div>
              ))}
            </div>
            <span>2,400+ people already on the waitlist</span>
          </motion.div>
        </div>

        {/* Right: App Mockup */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="flex-1 flex items-center justify-center"
        >
          <AppMockup />
        </motion.div>
      </div>
    </section>
  );
}
