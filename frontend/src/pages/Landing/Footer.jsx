import { Link } from 'react-router-dom';
import VittovaLogo from '../../components/VittovaLogo';
import { SUPPORT_EMAIL } from '../../lib/legal';
import { PrimaryCta, Reveal } from './shared';

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.06] px-4 sm:px-6">
      <Reveal className="mx-auto max-w-3xl py-20 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Your next money decision, made easier.</h2>
        <p className="mt-4 text-zinc-400">Free to start. Add your budget and a few expenses, and Vittova starts answering.</p>
        <PrimaryCta className="mt-8">Start free</PrimaryCta>
      </Reveal>

      <div className="mx-auto grid max-w-6xl gap-8 border-t border-white/[0.06] py-10 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <a href="/" aria-label="Vittova home" className="inline-flex min-h-[44px] items-center gap-2">
            <VittovaLogo size={26} />
            <span className="text-base font-bold text-white">Vittova</span>
          </a>
          <p className="mt-3 max-w-xs text-sm text-zinc-500">your money&apos;s pulse. Spending, bills and budget turned into clear decisions.</p>
        </div>
        <nav aria-label="Product">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Product</p>
          <ul className="mt-3 space-y-1 text-sm">
            <li><a className="inline-flex min-h-[36px] items-center text-zinc-300 hover:text-white" href="#features">Features</a></li>
            <li><a className="inline-flex min-h-[36px] items-center text-zinc-300 hover:text-white" href="#pro">Vittova Pro</a></li>
            <li><Link className="inline-flex min-h-[36px] items-center text-zinc-300 hover:text-white" to="/login">Sign in</Link></li>
          </ul>
        </nav>
        <nav aria-label="Legal and support">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Help and legal</p>
          <ul className="mt-3 space-y-1 text-sm">
            <li><a className="inline-flex min-h-[36px] items-center text-zinc-300 hover:text-white" href="/support">Support</a></li>
            <li><Link className="inline-flex min-h-[36px] items-center text-zinc-300 hover:text-white" to="/privacy">Privacy Policy</Link></li>
            <li><Link className="inline-flex min-h-[36px] items-center text-zinc-300 hover:text-white" to="/terms">Terms of Service</Link></li>
            <li><Link className="inline-flex min-h-[36px] items-center text-zinc-300 hover:text-white" to="/delete-account">Delete your account</Link></li>
          </ul>
        </nav>
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-2 border-t border-white/[0.06] py-6 text-xs text-zinc-600 sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} Vittova · <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex min-h-[32px] items-center hover:text-zinc-400">{SUPPORT_EMAIL}</a></p>
        <p>General financial education, not investment advice. Vittova is not a SEBI-registered investment adviser.</p>
      </div>
    </footer>
  );
}
