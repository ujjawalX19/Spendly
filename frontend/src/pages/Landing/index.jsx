/**
 * Public homepage (vittova.in). Story, in order: what Vittova tells you (hero
 * and the home screen), why that differs from an expense list (with a live
 * example), how it works, the product screen by screen, pricing, how your data
 * is handled, and common questions.
 *
 * It uses the app's design tokens and follows the same dark or light look
 * (dark by default; the switch is in the navigation).
 */
import Navbar from './Navbar';
import HeroSection from './HeroSection';
import WhyVittova from './WhyVittova';
import HowItWorks from './HowItWorks';
import Features from './Features';
import ProSection from './ProSection';
import TrustSection from './TrustSection';
import Faq from './Faq';
import Footer from './Footer';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { track } from '../../lib/telemetry';
import { MobileDownloadBar } from '../site/SiteLayout';
import { Reveal, WRAP } from './shared';

/** A short invitation to the sample-data demo. */
function DemoTeaser() {
  return (
    <section id="demo" className="border-t border-line py-20 lg:py-24">
      <Reveal className={`${WRAP} flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between`}>
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-ink-2">Interactive demo</p>
          <h2 className="mt-2 text-[1.75rem] font-semibold leading-[1.12] tracking-[-0.025em] sm:text-4xl">Try it with a sample month first.</h2>
          <p className="mt-4 text-lg text-ink-2">See Safe-to-Spend, budgets, Can I Afford and Vittova AI with fictional figures. No sign-up, nothing saved.</p>
        </div>
        <Link to="/demo" className="l-press v-btn-secondary min-h-12 shrink-0 px-6 text-[15px]">Open the demo</Link>
      </Reveal>
    </section>
  );
}

export default function Landing() {
  useEffect(() => { track('site_home_view'); }, []);
  return (
    <div className="min-h-screen overflow-x-clip bg-bg pb-20 font-sans text-ink sm:pb-0">
      <a href="#main" className="v-btn-primary sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60]">Skip to content</a>
      <Navbar />
      <main id="main">
        <HeroSection />
        <WhyVittova />
        <HowItWorks />
        <Features />
        <DemoTeaser />
        <ProSection />
        <TrustSection />
        <Faq />
      </main>
      <Footer />
      <MobileDownloadBar />
    </div>
  );
}
