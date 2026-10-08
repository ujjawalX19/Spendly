// The Vittova pulse as a single-colour line (it takes the text colour), for
// places where the full-colour logo would fight the surface it sits on, such
// as the gradient card. Same drawing as the logo (lib/brandMark.js).
import { STROKE_DOWN, STROKE_UP, STROKE_WIDTH } from '../lib/brandMark';

/**
 * @param {{ width?: number, draw?: boolean, className?: string }} props
 *        `draw`: the line draws itself in once (off with reduced motion).
 */
export default function PulseMark({ width = 30, draw = false, className = '' }) {
  return (
    <svg
      width={width}
      height={Math.round(width * (760 / 930))}
      viewBox="160 250 930 760"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${draw ? 'v-mark-draw' : ''} ${className}`}
    >
      <path d={STROKE_DOWN} pathLength="1" />
      <path d={STROKE_UP} pathLength="1" />
    </svg>
  );
}
