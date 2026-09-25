import { motion, useReducedMotion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
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
          className="flex flex-col items-center justify-center px-6 pt-10 pb-5 text-center lg:pb-14"
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 160, damping: 18 }}
            className="drop-shadow-[0_18px_40px_rgba(163,230,53,0.18)]"
          >
            <VittovaLogo size={80} animated className="lg:hidden" />
            <VittovaLogo size={168} animated className="hidden lg:block" />
          </motion.div>
          <p className="mt-4 font-['Poppins',_'Inter',_system-ui,_sans-serif] text-3xl font-bold tracking-tight lg:text-6xl">Vittova</p>
          <p className="mt-1 text-base font-medium tracking-[0.04em] text-zinc-300 lg:text-2xl">
            your money&apos;s <span className="text-[#A3E635]">pulse</span>
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
        <section className="flex items-start justify-center px-4 pb-14 lg:items-center lg:py-12">
          <motion.div
            initial={{ y: 24 }}
            animate={{ y: 0 }}
            transition={{ delay: 0.25, duration: 0.55, ease: 'easeOut' }}
            className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0B1220]/70 p-5 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8"
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

/** "OR" between the email form and Google. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3" role="separator" aria-label="or">
      <span className="h-px flex-1 bg-white/10" />
      <span className="text-xs font-bold text-zinc-500">OR</span>
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}

/** Continue with Google: native Credential Manager on Android, the browser elsewhere (see AuthContext). */
export function GoogleButton({ onClick, loading, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled || loading}
      className="v-press inline-flex h-12 w-full items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white/[.06] text-[15px] font-bold text-white transition hover:bg-white/[.10] focus:outline-none focus:ring-4 focus:ring-white/10 disabled:cursor-not-allowed disabled:opacity-50">
      {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : (
        <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
      )}
      Continue with Google
    </button>
  );
}
