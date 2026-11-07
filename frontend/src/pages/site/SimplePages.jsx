/**
 * Smaller public pages: Download, Vittova Pro, About, and the message shown
 * for app screens opened on the website.
 */
import { Check, Smartphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import SiteLayout from './SiteLayout';
import { WRAP } from '../Landing/shared';
import { playUrl, trackPlayClick } from '../../lib/playStore';
import { track } from '../../lib/telemetry';
import ProSection from '../Landing/ProSection';

function PlayButton({ placement, children = 'Download on Google Play', className = '' }) {
  return (
    <a href={playUrl(placement)} onClick={() => trackPlayClick(placement)} target="_blank" rel="noopener noreferrer" className={`v-btn-primary inline-flex min-h-12 items-center justify-center px-6 text-[15px] ${className}`}>{children}</a>
  );
}

export function DownloadPage() {
  return (
    <SiteLayout title="Download Vittova for Android · Google Play" path="/download"
      description="Get Vittova, the expense tracker and budget planner for India, free on Google Play for Android phones.">
      <div className={`${WRAP} grid gap-12 py-14 lg:grid-cols-2 lg:py-20`}>
        <div>
          <h1 className="text-[clamp(2rem,6vw,3rem)] font-semibold leading-[1.05] tracking-[-0.03em]">Get Vittova on your Android phone.</h1>
          <p className="mt-4 text-lg text-ink-2">Free to download. Vittova is currently available on Android through Google Play. It is not available for iPhone.</p>
          <ol className="mt-8 space-y-3 text-[15px] text-ink-soft">
            <li>1. Open Google Play on your Android phone, or scan the code.</li>
            <li>2. Install Vittova and create your free account.</li>
            <li>3. Add your monthly budget and a first expense.</li>
          </ol>
          <PlayButton placement="download_page" className="mt-8" />
        </div>
        <div className="hidden justify-center sm:flex">
          <a href={playUrl('qr')} onClick={() => track('site_qr_click')} target="_blank" rel="noopener noreferrer" className="rounded-2xl border border-line bg-white p-5 text-center">
            <img src="/play-qr.svg" alt="QR code to open Vittova on Google Play" width="220" height="220" />
            <span className="mt-3 block text-sm font-medium text-black">Scan with your Android phone</span>
          </a>
        </div>
      </div>
    </SiteLayout>
  );
}

export function ProPage() {
  return (
    <SiteLayout title="Vittova Pro · plans and launch offer" path="/pro"
      description="What Vittova Pro adds, its price and renewal terms. Pro is bought in the Vittova app through Google Play.">
      <h1 className="sr-only">Vittova Pro</h1>
      <ProSection />
    </SiteLayout>
  );
}

export function AboutPage() {
  return (
    <SiteLayout title="About Vittova" path="/about"
      description="Vittova is a personal finance app for India that turns spending, bills and budget into clear decisions.">
      <div className={`${WRAP} max-w-3xl py-14 lg:py-20`}>
        <h1 className="text-[clamp(2rem,6vw,3rem)] font-semibold leading-[1.05] tracking-[-0.03em]">About Vittova</h1>
        <div className="mt-6 space-y-4 text-lg leading-relaxed text-ink-2">
          <p>Vittova is a personal finance app built in India. It helps you see where your money goes, what is safe to spend today, and whether a purchase fits your month.</p>
          <p>It does not connect to your bank or ask for a bank password. It is general financial education, not investment advice, and Vittova is not a SEBI-registered investment adviser.</p>
          <p>Questions? Visit <a href="/support" className="l-link">Help and support</a>.</p>
        </div>
        <PlayButton placement="about" className="mt-8" />
      </div>
    </SiteLayout>
  );
}

const POINTS = ['Track real expenses and budgets', 'Ask Vittova about your own money', 'Split bills with your groups', 'Get Vittova Pro through Google Play'];

/** Shown when an app screen (sign-in, Home, Reports and so on) is opened on the website. */
export function AppOnlyPage() {
  return (
    <SiteLayout title="Vittova is an Android app" path="/download"
      description="Your Vittova account and money tools are in the Android app on Google Play.">
      <div className={`${WRAP} max-w-2xl py-16 text-center lg:py-24`}>
        <Smartphone className="mx-auto h-10 w-10 text-ink-2" aria-hidden="true" />
        <h1 className="mt-5 text-[clamp(1.75rem,5vw,2.5rem)] font-semibold leading-tight tracking-[-0.025em]">The full Vittova experience is in the Android app.</h1>
        <p className="mt-4 text-lg text-ink-2">Signing in and managing your money happen in the app. Your existing account works there.</p>
        <ul className="mx-auto mt-6 inline-block space-y-2 text-left">
          {POINTS.map((p) => <li key={p} className="flex gap-3 text-[15px] text-ink-soft"><Check className="mt-1 h-4 w-4 text-ink-2" aria-hidden="true" />{p}</li>)}
        </ul>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <PlayButton placement="app_only" />
          <Link to="/demo" className="v-btn-secondary inline-flex min-h-12 items-center px-6 text-[15px]">Try the demo</Link>
        </div>
      </div>
    </SiteLayout>
  );
}
