/**
 * Small building blocks for the homepage sections. They use the same colour
 * roles and controls as the app (index.css), so the site follows the dark and
 * light looks and reads as the same product. CSS-only motion (see "Landing"
 * in index.css): no animation library, and prefers-reduced-motion switches
 * everything off.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Download } from 'lucide-react';

/** The page's column: one width and one gutter for every section. */
export const WRAP = 'mx-auto w-full max-w-6xl px-5 sm:px-8';

/** Fades its children up once they scroll into view. */
export function Reveal({ as: Tag = 'div', className = '', delay = 0, children, ...rest }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setShown(true); return undefined; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setShown(true); io.disconnect(); }
    }, { rootMargin: '0px 0px -60px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={`l-reveal ${shown ? 'is-shown' : ''} ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined} {...rest}>
      {children}
    </Tag>
  );
}

export function SectionHeading({ eyebrow, title, children, center = false }) {
  return (
    <Reveal className={`max-w-2xl ${center ? 'mx-auto text-center' : ''}`}>
      {eyebrow && <p className="text-sm font-medium text-ink-2">{eyebrow}</p>}
      <h2 className="mt-2 text-[1.75rem] font-semibold leading-[1.12] tracking-[-0.025em] text-ink sm:text-4xl">{title}</h2>
      {children && <p className="mt-4 text-base leading-relaxed text-ink-2 sm:text-lg">{children}</p>}
    </Reveal>
  );
}

export function PrimaryCta({ children = 'Start free', className = '' }) {
  return (
    <Link to="/signup" className={`l-press v-btn-primary px-6 ${className}`}>
      {children} <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

export function SecondaryCta({ href, children, className = '' }) {
  return <a href={href} className={`l-press v-btn-secondary min-h-12 px-6 text-[15px] ${className}`}>{children}</a>;
}

/** The Android app's Google Play listing. */
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.vittova.app';

/** Opens the Google Play listing in a new tab. */
export function PlayStoreCta({ className = '' }) {
  return (
    <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className={`l-press v-btn-secondary min-h-12 px-6 text-[15px] ${className}`}>
      <Download className="h-4 w-4" aria-hidden="true" /> Download on Google Play
    </a>
  );
}

/** A short list of plain statements, each with a tick. */
export function Ticks({ items, className = '' }) {
  return (
    <ul className={`space-y-2.5 ${className}`}>
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-[15px] leading-relaxed text-ink-soft">
          <Check className="mt-1 h-4 w-4 shrink-0 text-ink-2" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One product story: words on one side, the matching screen on the other.
 * `flip` puts the screen first on wide screens.
 */
export function Split({ id, eyebrow, title, body, points, flip = false, children }) {
  return (
    <div id={id} className="grid scroll-mt-24 items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <Reveal className={flip ? 'lg:order-2' : ''}>
        <p className="text-sm font-medium text-ink-2">{eyebrow}</p>
        <h3 className="mt-2 text-2xl font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[1.75rem]">{title}</h3>
        <p className="mt-3 text-base leading-relaxed text-ink-2">{body}</p>
        {points && <Ticks items={points} className="mt-5" />}
      </Reveal>
      <Reveal delay={100} className={flip ? 'lg:order-1' : ''}>{children}</Reveal>
    </div>
  );
}
