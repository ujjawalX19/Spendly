/**
 * The frame for every public website page: navigation, footer, the page title
 * and description, and a download bar on phones.
 */
import { useEffect } from 'react';
import { Download } from 'lucide-react';
import Navbar from '../Landing/Navbar';
import Footer from '../Landing/Footer';
import { playUrl, trackPlayClick } from '../../lib/playStore';

function setMeta(title, description, path) {
  document.title = title;
  const set = (selector, attr, value) => { const el = document.querySelector(selector); if (el) el.setAttribute(attr, value); };
  set('meta[name="description"]', 'content', description);
  set('meta[property="og:title"]', 'content', title);
  set('meta[property="og:description"]', 'content', description);
  set('link[rel="canonical"]', 'href', `https://vittova.in${path}`);
  set('meta[property="og:url"]', 'content', `https://vittova.in${path}`);
}

export function MobileDownloadBar() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:hidden">
      <a href={playUrl('mobile_bar')} onClick={() => trackPlayClick('mobile_bar')} target="_blank" rel="noopener noreferrer" className="v-btn-primary flex min-h-12 w-full items-center justify-center gap-2 text-[15px]">
        <Download className="h-4 w-4" aria-hidden="true" /> Download on Google Play
      </a>
    </div>
  );
}

export default function SiteLayout({ title, description, path, children }) {
  useEffect(() => {
    setMeta(title, description, path);
    window.scrollTo(0, 0);
  }, [title, description, path]);
  return (
    <div className="min-h-screen overflow-x-clip bg-bg pb-20 font-sans text-ink sm:pb-0">
      <a href="#main" className="v-btn-primary sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60]">Skip to content</a>
      <Navbar />
      <main id="main" className="pt-16">{children}</main>
      <Footer />
      <MobileDownloadBar />
    </div>
  );
}
