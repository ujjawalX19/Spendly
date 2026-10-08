import { Link } from 'react-router-dom';
import VittovaLogo from '../../components/VittovaLogo';
import { SUPPORT_EMAIL } from '../../lib/legal';
import { PrimaryCta, Reveal, WRAP } from './shared';

const LINK = 'inline-flex min-h-[40px] items-center text-ink-2 transition-colors hover:text-ink';

export default function Footer() {
  return (
    <footer className="border-t border-line">
      <div className={WRAP}>
        <Reveal className="v-hero-card my-16 px-6 py-12 text-center sm:px-10 sm:py-16 lg:my-24">
          <h2 className="mx-auto max-w-2xl text-3xl font-semibold leading-[1.1] tracking-[-0.025em] sm:text-4xl">Your next money decision, made easier.</h2>
          <p className="mx-auto mt-4 max-w-xl text-white/80">Free to start. Add your budget and a few expenses, and Vittova starts answering.</p>
          <PrimaryCta className="mt-8">Start free</PrimaryCta>
        </Reveal>

        <div className="grid gap-10 border-t border-line py-12 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div>
            <a href="/" aria-label="Vittova home" className="inline-flex min-h-[44px] items-center gap-2.5">
              <VittovaLogo size={28} />
              <span className="text-base font-semibold text-ink">Vittova</span>
            </a>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-2">Your money&apos;s pulse. Spending, bills and budget turned into clear decisions.</p>
          </div>
          <nav aria-label="Product">
            <p className="text-sm font-semibold text-ink">Product</p>
            <ul className="mt-3 text-sm">
              <li><a className={LINK} href="#features">Features</a></li>
              <li><a className={LINK} href="#pro">Pricing</a></li>
              <li><a className={LINK} href="#faq">FAQ</a></li>
              <li><Link className={LINK} to="/login">Sign in</Link></li>
            </ul>
          </nav>
          <nav aria-label="Who it is for">
            <p className="text-sm font-semibold text-ink">Who it&apos;s for</p>
            <ul className="mt-3 text-sm">
              <li><a className={LINK} href="/students">Students</a></li>
              <li><a className={LINK} href="/young-professionals">Young professionals</a></li>
            </ul>
          </nav>
          <nav aria-label="Legal and support">
            <p className="text-sm font-semibold text-ink">Help and legal</p>
            <ul className="mt-3 text-sm">
              <li><a className={LINK} href="/support">Support</a></li>
              <li><Link className={LINK} to="/privacy">Privacy Policy</Link></li>
              <li><Link className={LINK} to="/terms">Terms of Service</Link></li>
              <li><Link className={LINK} to="/delete-account">Delete your account</Link></li>
            </ul>
          </nav>
        </div>

        <div className="flex flex-col gap-2 border-t border-line pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 text-xs text-ink-3 sm:flex-row sm:justify-between sm:gap-8">
          <p className="shrink-0">© {new Date().getFullYear()} Vittova · <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex min-h-[32px] items-center hover:text-ink">{SUPPORT_EMAIL}</a></p>
          <p className="sm:text-right">General financial education, not investment advice. Vittova is not a SEBI-registered investment adviser.</p>
        </div>
      </div>
    </footer>
  );
}
