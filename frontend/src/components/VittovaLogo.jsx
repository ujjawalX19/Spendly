import { useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// The official Vittova pulse mark (see public/vittova-logo.svg). Two
// interlocking strokes in the 1254×1254 artboard.
const STROKE_UP = 'M252 657 H398 Q430 657 446 624 L566 380 Q586 350 614 350 Q646 350 660 386 L744 636';
const STROKE_DOWN = 'M590 618 L672 872 Q688 908 716 908 Q744 908 762 874 L870 674 Q888 648 918 648 H998';

/**
 * Vittova logo.
 *
 * @param {number}  size      rendered width/height in px
 * @param {boolean} tile      draw the dark rounded app-icon tile behind the mark
 * @param {boolean} animated  draw the strokes in, then pulse the glow gently
 */
export default function VittovaLogo({ size = 40, tile = true, animated = false, className = '', title = 'Vittova' }) {
  const id = useId().replace(/:/g, '');
  const reduce = useReducedMotion();
  const animate = animated && !reduce;

  const draw = (delay) => (animate
    ? {
      initial: { pathLength: 0.001 },
      animate: { pathLength: 1 },
      transition: { pathLength: { duration: 1.1, delay, ease: [0.65, 0, 0.35, 1] } },
    }
    : {});

  const viewBox = tile ? '0 0 1254 1254' : '160 250 930 760';

  return (
    <svg
      width={size}
      height={tile ? size : Math.round(size * (760 / 930))}
      viewBox={viewBox}
      role="img"
      aria-label={title}
      className={className}
    >
      <defs>
        <radialGradient id={`${id}-tile`} cx="45%" cy="22%" r="90%">
          <stop offset="0%" stopColor="#0F2329" />
          <stop offset="55%" stopColor="#07141A" />
          <stop offset="100%" stopColor="#04070C" />
        </radialGradient>
        <linearGradient id={`${id}-pulse`} x1="0" y1="320" x2="0" y2="950" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E6FF4C" />
          <stop offset="48%" stopColor="#8FF03A" />
          <stop offset="100%" stopColor="#2BD460" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="30" />
        </filter>
      </defs>

      {tile && <rect x="66" y="62" width="1122" height="1128" rx="262" fill={`url(#${id}-tile)`} />}

      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <motion.g
          stroke="#7BEA2F"
          strokeWidth="116"
          filter={`url(#${id}-glow)`}
          initial={animate ? { opacity: 0.3 } : false}
          animate={animate ? { opacity: [0.3, 0.38, 0.2, 0.38] } : { opacity: 0.3 }}
          transition={animate ? { duration: 3.2, delay: 1.1, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' } : undefined}
        >
          <path d={STROKE_UP} />
          <path d={STROKE_DOWN} />
        </motion.g>
        <motion.path d={STROKE_DOWN} stroke={`url(#${id}-pulse)`} strokeWidth="116" {...draw(0.45)} />
        <motion.path d={STROKE_UP} stroke={tile ? '#07131A' : '#0B1220'} strokeWidth="134" {...draw(0)} />
        <motion.path d={STROKE_UP} stroke={`url(#${id}-pulse)`} strokeWidth="116" {...draw(0)} />
      </g>
    </svg>
  );
}
