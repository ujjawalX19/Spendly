/**
 * Public homepage (vittova.in). Story, in order: what Vittova decides for you
 * (hero + live example), why that differs from an expense list, how it works,
 * the features, the AI, Pro, and how your data is handled.
 */
import Navbar from './Navbar';
import HeroSection from './HeroSection';
import WhyVittova from './WhyVittova';
import HowItWorks from './HowItWorks';
import Features from './Features';
import AiSection from './AiSection';
import ProSection from './ProSection';
import TrustSection from './TrustSection';
import Footer from './Footer';

export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-clip bg-black font-sans text-white selection:bg-lime-400/30">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-lime-400 focus:px-3 focus:py-2 focus:text-black">Skip to content</a>
      <Navbar />
      <main id="main">
        <HeroSection />
        <WhyVittova />
        <HowItWorks />
        <Features />
        <AiSection />
        <ProSection />
        <TrustSection />
      </main>
      <Footer />
    </div>
  );
}
