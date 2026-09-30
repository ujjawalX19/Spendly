import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

/**
 * Every screen starts at its top. Pages scroll the window, and without this a
 * new page kept the previous one's position (Sign up → Privacy opened
 * halfway down). Links to an anchor (/#pro) keep their jump.
 */
export function ScrollToTopOnNavigate() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

/**
 * Android draws the app behind a transparent status bar, so scrolled content
 * ran under the clock and icons. Once the page scrolls, this fills the status
 * bar area with the app background; at the top it stays invisible so the
 * screens' own backgrounds show through unchanged. Below dialogs (z-200+).
 */
export function StatusBarScrim() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (!Capacitor.isNativePlatform()) return null;
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 top-0 z-[45] h-[env(safe-area-inset-top)] bg-[#0B1220]/95 backdrop-blur-md transition-opacity duration-150 ${scrolled ? 'opacity-100' : 'opacity-0'}`}
    />
  );
}
