/**
 * Feature showcase: what Vittova does, with real app screenshots for what is on
 * Google Play now and clearly marked previews for the next update.
 */
import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import SiteLayout from './SiteLayout';
import { FEATURES, isAvailable } from '../../lib/siteFeatures';
import { WRAP } from '../Landing/shared';
import { playUrl, trackPlayClick } from '../../lib/playStore';
import { track } from '../../lib/telemetry';

function Feature({ f, index }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { track('site_feature_view', { code: f.id.replace(/-/g, '_') }); io.disconnect(); } }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [f.id]);
  const available = isAvailable(f);
  const placement = `feature_${f.id.replace(/-/g, '_')}`;
  return (
    <section ref={ref} id={f.id} aria-labelledby={`${f.id}-title`} className="scroll-mt-20 border-t border-line py-14 lg:py-20">
      <div className={`${WRAP} grid items-center gap-10 lg:grid-cols-2 lg:gap-16`}>
        <div className={index % 2 ? 'lg:order-2' : ''}>
          {!available && <p className="mb-3 inline-block rounded-md bg-surface-2 px-2 py-1 text-xs font-medium text-ink-2">Coming in the next update</p>}
          <h2 id={`${f.id}-title`} className="text-[1.6rem] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-3xl">{f.name}</h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-2">{f.summary}</p>
          <ul className="mt-5 space-y-2">
            {f.benefits.map((b) => <li key={b} className="flex gap-3 text-[15px] text-ink-soft"><Check className="mt-1 h-4 w-4 shrink-0 text-ink-2" aria-hidden="true" />{b}</li>)}
          </ul>
          {available && (
            <a href={playUrl(placement)} onClick={() => trackPlayClick(placement)} target="_blank" rel="noopener noreferrer" className="l-link mt-6 inline-flex min-h-[44px] items-center text-sm font-semibold">
              Experience this in the app
            </a>
          )}
        </div>
        <figure className="mx-auto w-full max-w-[320px]">
          {available && f.shot ? (
            <img src={f.shot} alt={`${f.name} in the Vittova app`} loading="lazy" decoding="async" width="1080" height="1920" className="w-full rounded-[1.5rem] border border-line-strong" />
          ) : (
            <div className="rounded-[1.5rem] border border-line-strong bg-surface p-5" aria-label={`Sample output: ${f.name}`} role="img">
              <p className="text-xs font-medium text-ink-3">{available ? 'Example' : 'Preview of the next update'}</p>
              <ul className="mt-3 space-y-2" aria-hidden="true">
                {f.sample.map((s) => <li key={s} className="rounded-xl bg-surface-2 px-3 py-3 text-sm text-ink">{s}</li>)}
              </ul>
            </div>
          )}
          <figcaption className="mt-3 text-center text-xs text-ink-3">Example figures</figcaption>
        </figure>
      </div>
    </section>
  );
}

export default function FeaturesPage() {
  return (
    <SiteLayout title="Features · Vittova expense tracker for Android" path="/features"
      description="Expense tracking from bank SMS, Safe-to-Spend, Can I Afford, Vittova AI, group bills and more. See what Vittova does, then get it on Google Play.">
      <div className={`${WRAP} pb-10 pt-14 lg:pt-20`}>
        <h1 className="max-w-3xl text-[clamp(2rem,6vw,3.25rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">Everything Vittova does, in one place.</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-2">Screens marked as examples use fictional figures. Your own figures appear in the Android app.</p>
        <nav aria-label="Features" className="mt-8 flex flex-wrap gap-2">
          {FEATURES.map((f) => <a key={f.id} href={`#${f.id}`} className="rounded-full border border-line px-3 py-2 text-sm text-ink-2 hover:text-ink">{f.name}</a>)}
        </nav>
      </div>
      {FEATURES.map((f, i) => <Feature key={f.id} f={f} index={i} />)}
    </SiteLayout>
  );
}
