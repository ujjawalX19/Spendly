import Navbar from './Navbar';
import HeroSection from './HeroSection';
import Features from './Features';
import SecurityBanner from './SecurityBanner';
import Footer from './Footer';

export default function Landing() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white selection:bg-emerald-500/30 font-sans">
      <Navbar />
      <main>
        <HeroSection />
        <Features />
        <SecurityBanner />
      </main>
      <Footer />
    </div>
  );
}
