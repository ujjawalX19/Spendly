import Navbar from './Navbar';
import HeroSection from './HeroSection';
import Features from './Features';
import SecurityBanner from './SecurityBanner';
import Footer from './Footer';

export default function Landing() {
  return (
    <div className="min-h-screen bg-black font-sans text-white selection:bg-lime-400/30">
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
