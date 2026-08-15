import { Bot, LayoutDashboard, LogOut, Moon, Sun, TrendingUp, Users, Wallet } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const navigation = [
  { to: '/dash', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/pool', label: 'Group Pool', icon: Users },
  { to: '/bot', label: 'Spendly AI', icon: Bot },
  { to: '/wealth', label: 'Wealth', icon: TrendingUp },
];

export default function Sidebar({ theme, toggleTheme, onLogout }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 min-h-screen select-none flex-col justify-between border-r border-zinc-800/60 bg-zinc-950/90 p-5 backdrop-blur-xl md:flex">
      <div>
        <NavLink to="/dash" className="mb-9 flex items-center gap-3 px-1" aria-label="Spendly dashboard">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
            <Wallet className="h-5 w-5 text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
          </div>
          <span className="bg-gradient-to-r from-emerald-400 to-teal-200 bg-clip-text text-xl font-bold text-transparent">Spendly</span>
        </NavLink>

        <nav className="space-y-1.5" aria-label="Main navigation">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => [
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all',
                isActive
                  ? 'border-r-2 border-emerald-500 bg-emerald-500/10 font-semibold text-emerald-400 shadow-[inset_0_0_12px_rgba(16,185,129,0.1)]'
                  : 'font-medium text-zinc-400 hover:bg-zinc-900/70 hover:text-zinc-100',
              ].join(' ')}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="space-y-2 border-t border-zinc-800/60 pt-4">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-300" /> : <Moon className="h-4 w-4 text-sky-300" />}
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center justify-between rounded-xl border border-transparent px-3 py-2 text-xs font-semibold text-rose-400 transition-all hover:border-rose-500/30 hover:bg-rose-500/10"
        >
          <span>Log out</span>
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
