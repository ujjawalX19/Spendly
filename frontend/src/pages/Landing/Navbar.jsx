import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Menu, X } from 'lucide-react';
import { Link } from 'react-router-dom';

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Security', href: '#security' },
  { label: 'FAQ', href: '#faq' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
            ? 'bg-zinc-950/80 backdrop-blur-xl border-b border-white/5 shadow-xl shadow-black/40'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-5 md:px-8 flex items-center justify-between h-16">
          {/* Logo */}
          <a href="#" className="flex items-center gap-2 group">
            <img src="/spendly-logo.svg" alt="Spendly Logo" className="w-9 h-9 rounded-xl group-hover:scale-105 transition-transform duration-300" />
            <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
              Spendly
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
              onClick={() => handleNavClick('#waitlist')}
              className="relative px-5 py-2.5 text-sm font-semibold rounded-xl overflow-hidden group"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 group-hover:from-emerald-400 group-hover:to-teal-300" />
              <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-emerald-400/20 to-teal-300/20 blur-xl" />
              <span className="relative text-zinc-950">Get Early Access</span>
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
            className="fixed top-16 inset-x-0 z-40 bg-zinc-950/95 backdrop-blur-xl border-b border-white/5 px-5 py-6 flex flex-col gap-4"
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
              onClick={() => handleNavClick('#waitlist')}
              className="mt-2 w-full py-3 text-sm font-semibold rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-zinc-950"
            >
              Get Early Access
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
