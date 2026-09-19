import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import VittovaLogo from '../../components/VittovaLogo';
import { Link, useNavigate } from 'react-router-dom';

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Security', href: '#security' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleNavClick = (href) => {
    setMobileOpen(false);
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <motion.nav
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'border-b border-zinc-800/60 bg-black/90 shadow-xl shadow-black/40 backdrop-blur-xl'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-5 md:px-8 flex items-center justify-between h-16">
          {/* Logo */}
          <a href="/" aria-label="Vittova home" className="flex items-center gap-2 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime-400/10">
              <VittovaLogo size={28} />
            </div>
            <span className="text-xl font-bold tracking-tight text-lime-400">
              Vittova
            </span>
          </a>

          {/* Desktop Links */}
          <ul className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <li key={link.label}>
                <button
                  onClick={() => handleNavClick(link.href)}
                  className="text-sm font-medium text-zinc-400 hover:text-white transition-colors duration-200 cursor-pointer"
                >
                  {link.label}
                </button>
              </li>
            ))}
          </ul>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-4">
            <Link to="/login" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
              Sign In
            </Link>
            <button
              onClick={() => { setMobileOpen(false); navigate('/signup'); }}
              className="rounded-xl bg-lime-400 px-5 py-2.5 text-sm font-bold text-black shadow-[0_0_15px_rgba(132,204,22,0.3)] transition-all hover:bg-lime-300"
            >
              Get started
            </button>
          </div>

          {/* Mobile Hamburger */}
          <button
            className="md:hidden text-zinc-400 hover:text-white p-2"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </motion.nav>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25 }}
            className="fixed top-16 inset-x-0 z-40 flex flex-col gap-4 border-b border-zinc-800/60 bg-black/95 px-5 py-6 backdrop-blur-xl"
          >
            {navLinks.map((link) => (
              <button
                key={link.label}
                onClick={() => handleNavClick(link.href)}
                className="text-left text-base font-medium text-zinc-300 hover:text-white py-2 border-b border-white/5 last:border-0 transition-colors"
              >
                {link.label}
              </button>
            ))}
            <Link
              to="/login"
              onClick={() => setMobileOpen(false)}
              className="mt-4 w-full py-3 text-sm font-semibold rounded-xl bg-zinc-800 text-white border border-zinc-700 text-center"
            >
              Sign In / Log In
            </Link>
            <button
              onClick={() => { setMobileOpen(false); navigate('/signup'); }}
              className="mt-2 w-full rounded-xl bg-lime-400 py-3 text-sm font-bold text-black transition-colors hover:bg-lime-300"
            >
              Get started
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
