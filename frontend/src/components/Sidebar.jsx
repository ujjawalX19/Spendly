import { Bot, LayoutDashboard, LogOut, Moon, Sun, TrendingUp, Wallet, FileText, Repeat, Settings, Receipt } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const navigation = [
  { to: '/dash', label: 'Overview', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', icon: Receipt },
  { to: '/bot', label: 'Spendly AI', icon: Bot },
  { to: '/wealth', label: 'Wealth', icon: TrendingUp },
  { to: '/graveyard', label: 'Recurring charges', icon: Repeat },
  { to: '/import', label: 'Statement Import', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ theme, toggleTheme, onLogout }) {
  const isDark = theme === 'dark';

  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 select-none border-r border-white/10 bg-[#0c0f0c] p-4 md:flex md:flex-col" aria-label="App navigation">
      <NavLink to="/dash" className="mb-8 flex items-center gap-3 rounded-2xl px-2 py-2 no-underline" aria-label="Spendly overview">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-400 text-black shadow-lg shadow-lime-400/15"><Wallet className="h-5 w-5" /></span>
        <span><span className="block text-lg font-extrabold tracking-tight text-white">Spendly</span><span className="block text-[10px] font-bold tracking-[.16em] text-lime-300">MONEY, SIMPLIFIED</span></span>
      </NavLink>

      <p className="mb-2 px-3 text-[10px] font-bold tracking-[.18em] text-zinc-500">YOUR SPACE</p>
      <nav className="space-y-1" aria-label="Main navigation">
        {navigation.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-all ${isActive ? 'bg-lime-400 text-black shadow-lg shadow-lime-400/10' : 'text-zinc-400 hover:bg-white/[.06] hover:text-white'}`}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto border-t border-white/10 pt-4">
        <div className="mb-3 rounded-2xl border border-lime-400/10 bg-lime-400/[.06] p-3">
          <p className="text-xs font-bold text-lime-200">Small steps add up.</p>
          <p className="mt-1 text-[11px] leading-4 text-zinc-500">Keep tracking and make every rupee count.</p>
        </div>
        <button type="button" onClick={toggleTheme} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-400 transition hover:bg-white/[.06] hover:text-white">
          <span>{isDark ? 'Use light mode' : 'Use dark mode'}</span>
          {isDark ? <Sun className="h-4 w-4 text-amber-300" /> : <Moon className="h-4 w-4 text-sky-400" />}
        </button>
        <button type="button" onClick={onLogout} className="mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold text-rose-400 transition hover:bg-rose-400/10 hover:text-rose-300">
          <span>Log out</span><LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
