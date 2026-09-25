/**
 * StartupSplash — the short Vittova brand moment on a cold start.
 *
 *   0–550 ms     logo: fade in, 0.92 → 1 scale, 6 px rise
 *   280–820 ms   "your money's pulse": fade in, 8 px rise
 *   1150–1400 ms whole splash fades out; the app is already rendered beneath
 *
 * It is an overlay: auth, routing and data loading start underneath at the
 * same time, so the splash never delays the first real screen by more than
 * its own 1.4 s. Pure CSS keyframes on an inline SVG: no video, no network,
 * no extra library. Reduced motion: a static logo for 0.4 s, then a fade.
 * Shown once per app session (a cold start), never on navigation.
 */

import { useEffect, useRef, useState } from 'react';
import VittovaLogo from './VittovaLogo';
import { markSplashShown } from '../lib/splash';

export { shouldShowSplash } from '../lib/splash';

const FULL_MS = 1400;
const REDUCED_MS = 550;

export default function StartupSplash({ onDone }) {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const total = reduce ? REDUCED_MS : FULL_MS;
  const [leaving, setLeaving] = useState(false);

  // Keep the latest callback without restarting the timers when the parent re-renders.
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    markSplashShown();
    const fade = setTimeout(() => setLeaving(true), total - 250);
    const done = setTimeout(() => doneRef.current?.(), total);
    return () => { clearTimeout(fade); clearTimeout(done); };
  }, [total]);

  return (
    <div
      className={`v-splash fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-[#050607] ${leaving ? 'v-splash-out' : ''} ${reduce ? 'v-splash-static' : ''}`}
      role="status"
      aria-label="Vittova, your money's pulse"
    >
      <div className="v-splash-logo">
        <VittovaLogo size={96} />
      </div>
      <p className="v-splash-tagline mt-5 text-[15px] font-semibold tracking-[0.08em] text-zinc-300">
        your money&rsquo;s <span className="text-lime-300">pulse</span>
      </p>
    </div>
  );
}
