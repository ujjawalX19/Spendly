/**
 * BottomNav.jsx — Mobile bottom navigation bar.
 * ─────────────────────────────────────────────────────────────
 * Rendered inside Layout so it appears on ALL authenticated pages.
 * Uses useLocation() for real active-tab highlighting instead of
 * a hardcoded value.
 *
 * A plain bar, part of the page: the selected tab is marked by the accent on
 * its icon and label only. No floating pill, no blur, no bounce.
 */

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Link, useLocation } from 'react-router-dom';
import { Home, Receipt, BarChart2, Users, UserRound } from 'lucide-react';

// Five destinations. Everything else (Ask Vittova, subscription audit,
// challenges, import, Pro) is one tap deeper, from Home, Wealth or Profile.
const tabs = [
  { id: '/dash',         label: 'Home',     icon: Home,      match: ['/dash', '/save-to-earn'] },
  { id: '/transactions', label: 'Activity', icon: Receipt,   match: ['/transactions'] },
  { id: '/wealth',       label: 'Wealth',   icon: BarChart2, match: ['/wealth'] },
  { id: '/pool',         label: 'Groups',   icon: Users,     match: ['/pool'] },
  { id: '/settings',     label: 'Profile',  icon: UserRound, match: ['/settings', '/subscription-audit', '/challenges', '/graveyard', '/import'] },
];

export default function BottomNav() {
  const { pathname } = useLocation();
  // While the keyboard is open the bar would eat a fifth of the visible
  // screen, which matters most on the AI screen.
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isField = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    const show = () => setTyping(false);
    const hide = (e) => { if (isField(e.target)) setTyping(true); };
    document.addEventListener('focusin', hide);
    document.addEventListener('focusout', show);

    // Android: closing the keyboard with Back keeps the field focused, so no
    // focusout arrives and the bar would stay hidden. When the WebView grows
    // back to (nearly) full height, the keyboard is gone: drop the focus.
    let fullHeight = window.innerHeight;
    const onResize = () => {
      const height = window.innerHeight;
      if (height > fullHeight) fullHeight = height;
      const el = document.activeElement;
      if (height >= fullHeight - 80 && isField(el)) el.blur();
    };
    const native = Capacitor.isNativePlatform();
    if (native) window.addEventListener('resize', onResize);

    return () => {
      document.removeEventListener('focusin', hide);
      document.removeEventListener('focusout', show);
      if (native) window.removeEventListener('resize', onResize);
    };
  }, []);

  // Lets the layout release the space it reserves for this bar (index.css).
  useEffect(() => {
    document.documentElement.toggleAttribute('data-typing', typing);
    return () => document.documentElement.removeAttribute('data-typing');
  }, [typing]);

  if (typing) return null;

  return (
    <nav
      aria-label="Main"
      className="md:hidden fixed bottom-0 inset-x-0 z-50 flex items-stretch border-t border-line bg-bg px-1
                 pb-[calc(0.375rem+env(safe-area-inset-bottom))] pt-1.5"
    >
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = tab.match.some((p) => pathname === p || pathname.startsWith(`${p}/`));
        return (
          <Link key={tab.id} to={tab.id} aria-label={tab.label} aria-current={isActive ? 'page' : undefined}
            className={`v-press flex min-h-[48px] min-w-0 flex-1 flex-col items-center justify-center gap-1 ${isActive ? 'text-accent' : 'text-ink-3'}`}>
            <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.25 : 1.75} aria-hidden="true" />
            <span className="text-[11px] font-semibold leading-none">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
