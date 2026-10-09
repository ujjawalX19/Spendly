import PulseMark from '../../components/PulseMark';
import { HomeMock } from './Mocks';
import { PlayStoreCta, PrimaryCta, WRAP } from './shared';

export default function HeroSection() {
  return (
    <section id="product" className="pb-16 pt-28 sm:pt-32 lg:pb-24 lg:pt-40">
      <div className={`${WRAP} grid items-center gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10`}>
        <div className="text-center lg:text-left">
          <p className="l-hero inline-flex items-center gap-2 text-sm font-medium text-ink-2">
            <PulseMark width={20} className="text-ink" /> Vittova · your money&apos;s pulse
          </p>
          <h1 className="l-hero mt-5 text-[clamp(2.25rem,9.5vw,4.25rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-ink" style={{ animationDelay: '60ms' }}>
            Know what your money can do next.
          </h1>
          <p className="l-hero mx-auto mt-6 max-w-xl text-lg leading-relaxed text-ink-2 lg:mx-0" style={{ animationDelay: '140ms' }}>
            Vittova shows where your money goes, what is safe to spend today, and what to do about it, worked out from your own budget, bills and spending.
          </p>
          <div className="l-hero mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start" style={{ animationDelay: '220ms' }}>
            <PrimaryCta>Start free</PrimaryCta>
            <PlayStoreCta />
          </div>
          <p className="l-hero mt-5 text-xs text-ink-3" style={{ animationDelay: '300ms' }}>Free to start · Android and web · Not investment advice · <a href="#how" className="l-link">See how it works</a></p>
        </div>
        <div className="l-hero-late">
          <HomeMock />
        </div>
      </div>
    </section>
  );
}
