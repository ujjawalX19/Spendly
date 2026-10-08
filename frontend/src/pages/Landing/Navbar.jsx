import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Moon, Sun, X } from 'lucide-react';
import VittovaLogo from '../../components/VittovaLogo';
import { useTheme } from '../../contexts/ThemeContext';
import { WRAP } from './shared';

const LINKS = [
  { label: 'Product', href: '#features' },
  { label: 'How it works', href: '#how' },
  { label: 'Pricing', href: '#pro' },
  { label: 'Privacy', href: '#trust' },
  { label: 'FAQ', href: '#faq' },
];

/** Dark or light, remembered on this device (the same choice as Profile → Appearance). */
function ThemeToggle() {
  const { theme, setChoice } = useTheme();
  const next = theme === 'light' ? 'dark' : 'light';
  return (
    <button type="button" onClick={() => setChoice(next)} aria-label={`Switch to the ${next} look`} title={`Switch to ${next}`}
      className="l-press inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-2 hover:text-ink">
      {theme === 'light' ? <Moon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" /> : <Sun className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />}
    </button>
  );
}

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
    <header className={`fixed inset-x-0 top-0 z-50 border-b pt-[env(safe-area-inset-top)] transition-colors duration-200 ${scrolled || open ? 'border-line bg-bg' : 'border-transparent bg-transparent'}`}>
      <nav className={`${WRAP} flex h-16 items-center justify-between gap-2`} aria-label="Main">
        <a href="/" aria-label="Vittova home" className="flex min-h-[44px] shrink-0 items-center gap-2.5">
          <VittovaLogo size={30} />
          <span className="text-[17px] font-semibold tracking-[-0.01em] text-ink">Vittova</span>
        </a>

        <ul className="hidden items-center gap-7 lg:flex">
          {LINKS.map((l) => (
            <li key={l.href}><a href={l.href} className="inline-flex min-h-[44px] items-center text-sm font-medium text-ink-2 transition-colors hover:text-ink">{l.label}</a></li>
          ))}
        </ul>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Link to="/login" className="hidden min-h-[44px] items-center px-3 text-sm font-semibold text-ink-2 hover:text-ink sm:inline-flex">Sign in</Link>
          <Link to="/signup" className="l-press v-btn-primary min-h-10 shrink-0 whitespace-nowrap px-4 text-sm">Get started</Link>
          <button type="button" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-2 hover:text-ink lg:hidden"
            onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'}>
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </nav>

      {open && (
        <div id="mobile-menu" className="h-[calc(100dvh-4rem-env(safe-area-inset-top))] overflow-y-auto border-t border-line bg-bg px-5 pb-6 pt-1 sm:px-8 lg:hidden">
          <ul className="v-rows">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={() => setOpen(false)} className="flex min-h-[52px] items-center text-base font-medium text-ink">{l.label}</a>
              </li>
            ))}
          </ul>
          <Link to="/login" onClick={() => setOpen(false)} className="v-btn-secondary mt-4 min-h-12 w-full text-[15px]">Sign in</Link>
        </div>
      )}
    </header>
  );
}
