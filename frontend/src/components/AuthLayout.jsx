import { motion, useReducedMotion } from 'framer-motion';
import VittovaLogo from './VittovaLogo';

/**
 * Shared frame for sign-in, sign-up and password screens, following the
 * Vittova brand board: deep navy (#0B1220), flowing lime waves, the pulse app
 * icon, "Vittova — Your Money's Pulse".
 *
 * Decorative only: no invented balances or statistics are shown here.
 */
function Waves() {
  const reduce = useReducedMotion();
  const drift = (d, delay) => (reduce ? {} : {
    animate: { x: [0, d, 0], y: [0, -d / 2, 0] },
    transition: { duration: 12, delay, repeat: Infinity, ease: 'easeInOut' },
  });

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="wave-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#A3E635" stopOpacity="0" />
          <stop offset="60%" stopColor="#65C22B" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#A3E635" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="wave-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2BD460" stopOpacity="0" />
          <stop offset="100%" stopColor="#3FA535" stopOpacity="0.45" />
        </linearGradient>
        <radialGradient id="corner-glow" cx="0%" cy="0%" r="60%">
          <stop offset="0%" stopColor="#A3E635" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#A3E635" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="800" fill="url(#corner-glow)" />
      <motion.path d="M-40 520 C 80 470, 160 640, 300 560 S 460 470, 460 470 L460 820 L-40 820 Z" fill="url(#wave-b)" {...drift(10, 0)} />
      <motion.path d="M-60 610 C 90 540, 170 720, 310 640 S 470 560, 470 560" fill="none" stroke="url(#wave-a)" strokeWidth="3" {...drift(14, 1.5)} />
      <motion.path d="M60 820 C 180 700, 250 690, 320 610 S 430 470, 470 440 L470 820 Z" fill="url(#wave-a)" opacity="0.55" {...drift(8, 0.8)} />
    </svg>
  );
}

export default function AuthLayout({ children }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0B1220] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-white">
      <Waves />

      <div className="relative mx-auto grid min-h-screen max-w-6xl grid-cols-1 lg:grid-cols-2">
        {/* Brand */}
        <motion.aside
          initial={{ y: 16 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="flex flex-col items-center justify-center px-6 pt-14 pb-6 text-center lg:pb-14"
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 160, damping: 18 }}
            className="drop-shadow-[0_18px_40px_rgba(163,230,53,0.18)]"
          >
            <VittovaLogo size={112} animated className="lg:hidden" />
            <VittovaLogo size={168} animated className="hidden lg:block" />
          </motion.div>
          <h1 className="mt-5 font-['Poppins',_'Inter',_system-ui,_sans-serif] text-4xl font-bold tracking-tight lg:text-6xl">Vittova</h1>
          <p className="mt-1 text-base font-medium tracking-[0.06em] text-zinc-200 lg:text-2xl">
            Your Money&apos;s <span className="text-[#A3E635]">Pulse</span>
          </p>
          <p className="mt-4 hidden text-xs font-semibold tracking-[0.32em] text-zinc-400 lg:block">
            TRACK &nbsp;|&nbsp; UNDERSTAND &nbsp;|&nbsp; SAVE &nbsp;|&nbsp; GROW
          </p>
          <motion.div
            className="mt-6 hidden h-0.5 w-12 rounded bg-[#A3E635] lg:block"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 1.2, duration: 0.5 }}
          />
        </motion.aside>

        {/* Form */}
        <section className="flex items-start justify-center px-5 pb-10 lg:items-center lg:py-12">
          <motion.div
            initial={{ y: 24 }}
            animate={{ y: 0 }}
            transition={{ delay: 0.25, duration: 0.55, ease: 'easeOut' }}
            className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0B1220]/70 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8"
          >
            {children}
          </motion.div>
        </section>
      </div>

      <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-[10px] font-semibold tracking-[0.3em] text-zinc-500 lg:hidden">
        BETTER HABITS · BRIGHTER TOMORROW
      </p>
    </main>
  );
}
