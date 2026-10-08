import { useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// The official Vittova pulse mark (see public/vittova-logo.svg and lib/brandMark.js).
import { STROKE_DOWN, STROKE_UP, STROKE_WIDTH, TILE_GRADIENT } from '../lib/brandMark';

/**
 * Vittova logo: the white pulse on the maroon-to-orange tile.
 *
 * @param {number}  size      rendered width/height in px
 * @param {boolean} tile      draw the tile behind the pulse; without it the
 *                            pulse takes the text colour of where it sits
 * @param {boolean} animated  draw the strokes in once
 */
export default function VittovaLogo({ size = 40, tile = true, animated = false, className = '', title = 'Vittova' }) {
  const id = useId().replace(/:/g, '');
  const reduce = useReducedMotion();
  const animate = animated && !reduce;

  const draw = (delay) => (animate
    ? {
      initial: { pathLength: 0.001 },
      animate: { pathLength: 1 },
      transition: { pathLength: { duration: 0.9, delay, ease: [0.65, 0, 0.35, 1] } },
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
      {tile && (
        <defs>
          <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="1" y2="1">
            {TILE_GRADIENT.map((s) => <stop key={s.offset} offset={s.offset} stopColor={s.color} />)}
          </linearGradient>
        </defs>
      )}

      {tile && <rect x="66" y="62" width="1122" height="1128" rx="262" fill={`url(#${id}-tile)`} />}

      <g fill="none" stroke={tile ? '#FFFFFF' : 'currentColor'} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round">
        <motion.path d={STROKE_DOWN} {...draw(0.35)} />
        <motion.path d={STROKE_UP} {...draw(0)} />
      </g>
    </svg>
  );
}
