import AffordDemo from './AffordDemo';
import { PrimaryCta, SecondaryCta } from './shared';

export default function HeroSection() {
  return (
    <section id="product" className="relative overflow-hidden px-4 pb-20 pt-28 sm:px-6 lg:pb-28 lg:pt-36">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-lime-400/[0.07] blur-3xl" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="l-hero text-center lg:text-left">
          <p className="inline-flex items-center gap-2 rounded-full border border-lime-400/25 bg-lime-400/[0.06] px-3.5 py-1.5 text-xs font-semibold text-lime-300">
            <span className="h-1.5 w-1.5 rounded-full bg-lime-400" aria-hidden="true" /> your money&apos;s pulse
          </p>
          <h1 className="mt-6 text-[2.6rem] font-extrabold leading-[1.04] tracking-tight text-white sm:text-6xl">
            Know what your money can do <span className="text-lime-400">next.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-zinc-400 lg:mx-0">
            Vittova turns your real spending, bills and budget into simple decisions, so you know when to spend, when to wait and how much you can set aside.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
            <PrimaryCta>Start free</PrimaryCta>
            <SecondaryCta href="#how">See how it works</SecondaryCta>
          </div>
          <p className="mt-5 text-xs text-zinc-500">Free to start · Android and web · Not investment advice</p>
        </div>
        <div className="l-hero-late flex justify-center lg:justify-end">
          <AffordDemo />
        </div>
      </div>
    </section>
  );
}
