import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import VittovaLogo from '../../components/VittovaLogo';

const LINKS = [
  { label: 'Product', href: '#product' },
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how' },
  { label: 'Pro', href: '#pro' },
  { label: 'Privacy', href: '#trust' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${scrolled || open ? 'border-b border-white/[0.06] bg-black/85 backdrop-blur-xl' : 'bg-transparent'}`}>
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6" aria-label="Main">
        <a href="/" aria-label="Vittova home" className="flex min-h-[44px] items-center gap-2">
          <VittovaLogo size={30} />
          <span className="text-lg font-bold tracking-tight text-white">Vittova</span>
        </a>

        <ul className="hidden items-center gap-7 lg:flex">
          {LINKS.map((l) => (
            <li key={l.href}><a href={l.href} className="inline-flex min-h-[40px] items-center text-sm font-medium text-zinc-400 transition-colors hover:text-white">{l.label}</a></li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Link to="/login" className="hidden min-h-[44px] items-center px-3 text-sm font-semibold text-zinc-300 hover:text-white sm:inline-flex">Sign in</Link>
          <Link to="/signup" className="l-press inline-flex h-10 items-center rounded-xl bg-lime-400 px-4 text-sm font-bold text-black hover:bg-lime-300">Get started</Link>
          <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-zinc-300 hover:text-white lg:hidden"
            onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {open && (
        <div id="mobile-menu" className="border-t border-white/[0.06] bg-black/95 px-4 pb-6 pt-2 lg:hidden">
          <ul>
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={() => setOpen(false)} className="flex min-h-[48px] items-center border-b border-white/5 text-base font-medium text-zinc-200">{l.label}</a>
              </li>
            ))}
          </ul>
          <Link to="/login" onClick={() => setOpen(false)} className="mt-4 flex h-12 items-center justify-center rounded-xl border border-white/15 text-sm font-semibold text-white">Sign in</Link>
        </div>
      )}
    </header>
  );
}
