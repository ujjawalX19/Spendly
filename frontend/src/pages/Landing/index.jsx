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

export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-clip bg-bg font-sans text-ink">
      <a href="#main" className="v-btn-primary sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60]">Skip to content</a>
      <Navbar />
      <main id="main">
        <HeroSection />
        <WhyVittova />
        <HowItWorks />
        <Features />
        <ProSection />
        <TrustSection />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
