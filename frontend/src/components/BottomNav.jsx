/**
 * BottomNav.jsx — Mobile bottom navigation bar.
 * ─────────────────────────────────────────────────────────────
 * Rendered inside Layout so it appears on ALL authenticated pages.
 * Uses useLocation() for real active-tab highlighting instead of
 * a hardcoded value.
 */

import { motion } from 'framer-motion';
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

  return (
    <motion.nav
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.5, type: 'spring', stiffness: 300, damping: 28 }}
      className="md:hidden fixed bottom-0 inset-x-0 z-50
                 bg-[#181818]/90 backdrop-blur-md border-t border-white/5
                 flex items-center justify-around py-3 px-2 rounded-t-3xl"
    >
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = pathname === tab.id;
        return (
          <Link key={tab.id} to={tab.id} className="flex-1">
            <motion.div
              whileTap={{ scale: 0.88 }}
              className="flex flex-col items-center gap-1"
            >
              <div className={`px-4 py-1.5 rounded-full transition-all ${isActive ? 'bg-[#a3e635]' : 'bg-transparent'}`}>
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
