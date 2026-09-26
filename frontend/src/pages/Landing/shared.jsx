/**
 * Small building blocks for the homepage sections. CSS-only motion (see
 * "Landing" in index.css), so the page ships no animation library and
 * prefers-reduced-motion switches everything off.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

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
      {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime-400">{eyebrow}</p>}
      <h2 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">{title}</h2>
      {children && <p className="mt-4 text-base leading-relaxed text-zinc-400 sm:text-lg">{children}</p>}
    </Reveal>
  );
}

export function PrimaryCta({ children = 'Start free', className = '' }) {
  return (
    <Link to="/signup" className={`l-press inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-lime-400 px-6 text-[15px] font-bold text-black transition-colors hover:bg-lime-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300 ${className}`}>
      {children} <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

export function SecondaryCta({ href, children, className = '' }) {
  return (
    <a href={href} className={`l-press inline-flex h-12 items-center justify-center rounded-xl border border-white/15 px-6 text-[15px] font-bold text-zinc-100 transition-colors hover:border-lime-400/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-300 ${className}`}>
      {children}
    </a>
  );
}
