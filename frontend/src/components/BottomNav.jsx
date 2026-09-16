/**
 * BottomNav.jsx — Mobile bottom navigation bar.
 * ─────────────────────────────────────────────────────────────
 * Rendered inside Layout so it appears on ALL authenticated pages.
 * Uses useLocation() for real active-tab highlighting instead of
 * a hardcoded value.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { Link, useLocation } from 'react-router-dom';
import { LayoutGrid, Receipt, Bot, BarChart2, Settings as SettingsIcon } from 'lucide-react';

const tabs = [
  { id: '/dash',     label: 'Dashboard',  icon: LayoutGrid   },
  { id: '/transactions', label: 'History', icon: Receipt      },
  { id: '/bot',      label: 'Vittova AI', icon: Bot           },
  { id: '/wealth',   label: 'Wealth',     icon: BarChart2     },
  { id: '/settings', label: 'Settings',   icon: SettingsIcon  },
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
    <motion.nav
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.5, type: 'spring', stiffness: 300, damping: 28 }}
      className="md:hidden fixed bottom-0 inset-x-0 z-50
                 bg-[#181818]/90 backdrop-blur-md border-t border-white/5
                 flex items-center justify-around px-2 pt-2 rounded-t-3xl
                 pb-[calc(0.5rem+env(safe-area-inset-bottom))]"
    >
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = pathname === tab.id;
        return (
          <Link key={tab.id} to={tab.id} className="flex-1">
            <motion.div
              whileTap={{ scale: 0.88 }}
              className="flex flex-col items-center gap-0.5"
            >
              <div className={`px-4 py-1 rounded-full transition-all ${isActive ? 'bg-[#a3e635]' : 'bg-transparent'}`}>
                <Icon
                  className={`w-6 h-6 transition-colors ${isActive ? 'text-black' : 'text-[#71717a]'}`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
              </div>
              <span className={`text-[11px] font-bold tracking-wide transition-colors ${
                isActive ? 'text-[#a3e635]' : 'text-[#71717a]'
              }`}>{tab.label}</span>
            </motion.div>
          </Link>
        );
      })}
    </motion.nav>
  );
}
