import { Bot, LayoutDashboard, LogOut, TrendingUp, FileText, Repeat, Settings, Receipt, Users } from 'lucide-react';
import VittovaLogo from './VittovaLogo';
import { NavLink } from 'react-router-dom';

const navigation = [
  { to: '/dash', label: 'Home', icon: LayoutDashboard },
  { to: '/transactions', label: 'Activity', icon: Receipt },
  { to: '/pool', label: 'Groups', icon: Users },
  { to: '/bot', label: 'Ask Vittova', icon: Bot },
  { to: '/wealth', label: 'Wealth', icon: TrendingUp },
  { to: '/graveyard', label: 'Recurring charges', icon: Repeat },
  { to: '/import', label: 'Statement import', icon: FileText },
  { to: '/settings', label: 'Profile', icon: Settings },
];

/** Desktop navigation. The selected item is a neutral lift with the accent on its icon. */
export default function Sidebar({ onLogout }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 select-none border-r border-line bg-bg p-4 md:flex md:flex-col" aria-label="App navigation">
      <NavLink to="/dash" className="mb-8 flex items-center gap-3 rounded-xl px-2 py-2 no-underline" aria-label="Vittova overview">
        <VittovaLogo size={36} />
        <span><span className="block font-display text-lg font-bold tracking-tight text-ink">Vittova</span><span className="block text-xs text-ink-3">your money&apos;s pulse</span></span>
      </NavLink>

      <nav className="space-y-0.5" aria-label="Main navigation">
        {navigation.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${isActive ? 'bg-surface-2 text-ink [&_svg]:text-accent' : 'text-ink-2 hover:bg-surface hover:text-ink'}`}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto border-t border-line pt-3">
        <button type="button" onClick={onLogout} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-2 transition-colors hover:bg-surface hover:text-ink">
          <span>Log out</span><LogOut className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
