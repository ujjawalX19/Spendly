/**
 * StartupSplash — the Vittova opening, continuing Android's launch screen.
 *
 * Android shows the mark the instant Vittova is tapped
 * (res/drawable/splash_mark.xml) and keeps it on screen until this component
 * has painted the SAME frame underneath: the same colour, the same vector mark
 * at the same size, at the same place on the screen (LaunchScreen.geometry).
 * Only then is Android's screen faded out (LaunchScreen.ready), so the logo
 * never blinks, jumps or changes shade.
 *
 * Then the pulse — Vittova is "your money's pulse", so the mark beats twice,
 * like a heartbeat, and each beat sends one soft ripple out from the mark:
 *     80 ms       first beat: the mark swells 3.5% and settles; ripple one
 *                 leaves the mark; the glow blooms
 *   120–760 ms    a light travels along the pulse line
 *    430 ms       second, softer beat (1.8%) and a fainter ripple
 *   640–1060 ms   "your money's pulse" rises in beneath
 *   1350 ms       wait, if needed, until the first screen is ready underneath
 *                 (lib/appReady; at most READY_WAIT_MS more), so the splash
 *                 never fades onto a loading spinner
 *   then 320 ms   the mark and tagline fade first, then the background
 *                 dissolves onto the app (already rendered below), so the two
 *                 never overlap in a double exposure
 * Two beats, then still: nothing loops, and nothing bounces.
 *
 * Only transforms, opacity and a stroke offset are animated (the glow is a
 * pre-blurred layer on its own GPU layer), so it stays smooth on low-end
 * phones. The beat starts and ends at scale 1, where Android left the mark.
 * Reduced motion: the mark and tagline, still, then the fade.
 * Shown once per app session (a cold start), never on navigation.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { markSplashShown } from '../lib/splash';
import { whenScreenReady } from '../lib/appReady';
import {
  GRADIENT, GRADIENT_Y, LAUNCH, LAUNCH_BACKGROUND, STROKE_DOWN, STROKE_UP, STROKE_WIDTH, launchCenterY,
} from '../lib/brandMark';
import { launchGeometry, releaseLaunchScreen } from '../plugins/LaunchScreen';

export { shouldShowSplash } from '../lib/splash';

const PLAY_MS = 1350;      // from hand-off to the start of the exit
const REDUCED_PLAY_MS = 350;
const READY_WAIT_MS = 2500; // the longest the still mark waits for the first screen
const EXIT_MS = 320;       // mark and tagline out (160 ms), then the background (200 ms, from 120 ms)
const LIGHT_WIDTH = 64;    // the sheen runs inside the 116-wide stroke

const nextFrames = () => new Promise((resolve) => {
  // Android does not draw the app while its launch screen is held, so frames
  // may not come: never wait more than a moment.
  const t = setTimeout(resolve, 150);
  requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); resolve(); }));
});

/** The launch box: identical geometry to splash_mark.xml. */
function LaunchMark({ uid, glow = false }) {
  const { viewport, sizeDp, translateX, translateY } = LAUNCH;
  const gradient = `${uid}-pulse`;
  const common = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };
  return (
    <svg width={sizeDp} height={sizeDp} viewBox={`0 0 ${viewport} ${viewport}`} aria-hidden="true" shapeRendering="geometricPrecision">
      <defs>
        <linearGradient id={gradient} x1="0" y1={GRADIENT_Y[0]} x2="0" y2={GRADIENT_Y[1]} gradientUnits="userSpaceOnUse">
          {GRADIENT.map((s) => <stop key={s.offset} offset={s.offset} stopColor={s.color} />)}
        </linearGradient>
        <linearGradient id={`${uid}-light`} x1="0" y1={GRADIENT_Y[0]} x2="0" y2={GRADIENT_Y[1]} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FDFFE8" />
          <stop offset="1" stopColor="#D9FFC2" />
        </linearGradient>
        {glow && (
          <filter id={`${uid}-blur`} filterUnits="userSpaceOnUse" x="0" y="0" width={viewport} height={viewport}>
            <feGaussianBlur stdDeviation="40" />
          </filter>
        )}
      </defs>
      <g transform={`translate(${translateX} ${translateY})`}>
        {glow ? (
          <g {...common} stroke="#7BEA2F" strokeWidth={STROKE_WIDTH + 24} filter={`url(#${uid}-blur)`}>
            <path d={STROKE_DOWN} />
            <path d={STROKE_UP} />
          </g>
        ) : (
          <>
            {/* As splash_mark.xml: falling stroke, then rising stroke on top. The
                light is a narrower sheen running inside each stroke. */}
            <path d={STROKE_DOWN} {...common} stroke={`url(#${gradient})`} strokeWidth={STROKE_WIDTH} />
            <path className="v-launch-light v-launch-light-down" d={STROKE_DOWN} pathLength="1" {...common} stroke={`url(#${uid}-light)`} strokeWidth={LIGHT_WIDTH} />
            <path d={STROKE_UP} {...common} stroke={`url(#${gradient})`} strokeWidth={STROKE_WIDTH} />
            <path className="v-launch-light v-launch-light-up" d={STROKE_UP} pathLength="1" {...common} stroke={`url(#${uid}-light)`} strokeWidth={LIGHT_WIDTH} />
          </>
        )}
      </g>
    </svg>
  );
}

export default function StartupSplash({ onDone }) {
  const uid = `launch${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // Where to centre the mark (px from the top). Unknown until Android reports
  // where the WebView sits; its launch screen covers everything until then.
  const [centerY, setCenterY] = useState(null);
  const [phase, setPhase] = useState('hold'); // hold → play → leave

  // Keep the latest callback without restarting the timers when the parent re-renders.
  const doneRef = useRef(onDone);
  useEffect(() => { doneRef.current = onDone; }, [onDone]);

  // 1. Place the mark exactly where Android drew it.
  useEffect(() => {
    let cancelled = false;
    launchGeometry().then((g) => {
      if (cancelled) return;
      const viewportHeight = window.innerHeight;
      setCenterY(g ? launchCenterY({ ...g, viewportHeight }) : viewportHeight / 2);
    });
    return () => { cancelled = true; };
  }, []);

  // 2. Once that frame is on the page, release Android's screen, and start the
  // pulse only when Android's screen has actually gone: started any earlier,
  // the animation plays underneath it where nobody can see it.
  useEffect(() => {
    if (centerY == null) return undefined;
    let cancelled = false;
    nextFrames()
      .then(() => { markSplashShown(); return releaseLaunchScreen(); })
      .then(() => { if (!cancelled) setPhase('play'); });
    return () => { cancelled = true; };
  }, [centerY]);

  // 3. Play, then fade onto the app. One timer per phase: a timer shared across
  // phases would be cancelled by the phase change and leave an invisible
  // overlay on top of the app.
  useEffect(() => {
    if (phase !== 'play') return undefined;
    let cancelled = false;
    const leave = setTimeout(() => {
      whenScreenReady(READY_WAIT_MS).then(() => { if (!cancelled) setPhase('leave'); });
    }, reduce ? REDUCED_PLAY_MS : PLAY_MS);
    return () => { cancelled = true; clearTimeout(leave); };
  }, [phase, reduce]);

  useEffect(() => {
    if (phase !== 'leave') return undefined;
    const done = setTimeout(() => doneRef.current?.(), EXIT_MS);
    return () => clearTimeout(done);
  }, [phase]);

  const top = centerY == null ? '50%' : `${Math.round(centerY)}px`;

  return (
    <div
      className={`v-splash fixed inset-0 z-[1000] ${phase === 'play' || phase === 'leave' ? 'v-splash-play' : ''} ${phase === 'leave' ? 'v-splash-out' : ''} ${reduce ? 'v-splash-static' : ''}`}
      style={{ backgroundColor: LAUNCH_BACKGROUND }}
      role="status"
      aria-label="Vittova, your money's pulse"
    >
      {centerY != null && (
        <div className="v-launch-content absolute inset-0">
          <div className="v-launch-glow absolute left-1/2" style={{ top, width: LAUNCH.sizeDp, height: LAUNCH.sizeDp, marginLeft: -LAUNCH.sizeDp / 2, marginTop: -LAUNCH.sizeDp / 2 }}>
            <LaunchMark uid={`${uid}g`} glow />
          </div>
          {/* The ripples start at the mark's own size and leave it: one per beat. */}
          <span className="v-launch-ring v-launch-ring-1 absolute left-1/2" style={{ top }} aria-hidden="true" />
          <span className="v-launch-ring v-launch-ring-2 absolute left-1/2" style={{ top }} aria-hidden="true" />
          <div className="v-launch-mark absolute left-1/2" style={{ top, width: LAUNCH.sizeDp, height: LAUNCH.sizeDp, marginLeft: -LAUNCH.sizeDp / 2, marginTop: -LAUNCH.sizeDp / 2 }}>
            <LaunchMark uid={uid} />
          </div>
          <p className="v-launch-tagline absolute inset-x-0 text-center text-[15px] font-semibold tracking-[0.08em] text-zinc-300" style={{ top: `calc(${top} + 84px)` }}>
            your money&rsquo;s <span className="text-lime-300">pulse</span>
          </p>
        </div>
      )}
    </div>
  );
}
