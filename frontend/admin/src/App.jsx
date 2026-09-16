import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AlertOctagon, BarChart3, Bot, Crown, HeartPulse, LayoutDashboard, LogOut, ScrollText, Settings as SettingsIcon, ShieldCheck, Users as UsersIcon } from 'lucide-react';
import { supabase } from './lib/supabase';
import { adminApi } from './lib/api';
import { Button } from './components/ui';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Users from './pages/Users';
import UserDetail from './pages/UserDetail';
import Pro from './pages/Pro';
import Health from './pages/Health';
import AuditLog from './pages/AuditLog';
import ActivityPage from './pages/Activity';
import AiMentor from './pages/AiMentor';
import Errors from './pages/Errors';
import Settings from './pages/Settings';

const BASENAME = import.meta.env.BASE_URL.replace(/\/+$/, '');
export const LOGO_URL = `${import.meta.env.BASE_URL}vittova-logo.svg`;

// Sign out after this long without interaction.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Session gate.
 *
 *   no session           -> Login
 *   session, not owner   -> "not authorized", signed out
 *   session, owner       -> panel
 *
 * "Owner" is whatever GET /api/admin/me says, asked on every load. That check
 * only decides what to render: every admin API route enforces the same
 * owner-only rule on the server independently, so nothing here is a security
 * boundary and nothing about admin status is cached in the browser.
 */
export default function App() {
  const [session, setSession] = useState(undefined);
  const [owner, setOwner] = useState(null);
  const [gate, setGate] = useState('loading'); // loading | signed_out | denied | error | ok
  const [gateError, setGateError] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);

  const verify = useCallback(async () => {
    setGate('loading');
    try {
      const { owner: me } = await adminApi('/me');
      setOwner(me);
      setGate('ok');
    } catch (err) {
      if (err.status === 404 || err.status === 403 || err.status === 401) {
        setOwner(null);
        setGate('denied');
        await supabase.auth.signOut({ scope: 'local' });
      } else {
        setGateError(err);
        setGate('error');
      }
    }
  }, []);

  const userId = session?.user?.id;
  useEffect(() => {
    if (session === undefined) return;
    if (!userId) {
      setOwner(null);
      setGate((g) => (g === 'denied' ? g : 'signed_out'));
      return;
    }
    verify();
  }, [userId, session, verify]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'local' });
    setOwner(null);
    setGate('signed_out');
  }, []);

  useIdleSignOut(gate === 'ok', signOut);

  if (session === undefined || gate === 'loading') {
    return <Centered><span className="text-sm text-zinc-500">Verifying access…</span></Centered>;
  }
  if (gate === 'error') {
    return (
      <Centered>
        <p className="mb-2 text-zinc-200">Could not verify access</p>
        <p className="mb-5 text-sm text-zinc-500">{gateError?.message}</p>
        <div className="flex gap-2"><Button variant="primary" onClick={verify}>Try again</Button><Button onClick={signOut}>Sign out</Button></div>
      </Centered>
    );
  }
  if (gate !== 'ok') {
    return <Login denied={gate === 'denied'} onClearDenied={() => setGate('signed_out')} />;
  }

  return (
    <BrowserRouter basename={BASENAME}>
      <Shell owner={owner} onSignOut={signOut}>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/users" element={<Users />} />
          <Route path="/users/:id" element={<UserDetail currentOwnerId={owner.id} />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/ai" element={<AiMentor />} />
          <Route path="/errors" element={<Errors />} />
          <Route path="/health" element={<Health />} />
          <Route path="/pro" element={<Pro />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}

function useIdleSignOut(active, signOut) {
  const timer = useRef(null);
  useEffect(() => {
    if (!active) return undefined;
    const reset = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(signOut, IDLE_TIMEOUT_MS);
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'visibilitychange'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [active, signOut]);
}

function Centered({ children }) {
  return <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">{children}</div>;
}

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/users', label: 'Users', icon: UsersIcon },
  { to: '/activity', label: 'Activity', icon: BarChart3 },
  { to: '/ai', label: 'AI Mentor', icon: Bot },
  { to: '/errors', label: 'Errors', icon: AlertOctagon },
  { to: '/health', label: 'System Health', icon: HeartPulse },
  { to: '/pro', label: 'Pro', icon: Crown },
  { to: '/audit', label: 'Audit Logs', icon: ScrollText },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

function Shell({ owner, onSignOut, children }) {
  const link = ({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${isActive ? 'bg-lime-400/10 text-lime-300' : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100'}`;
  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-zinc-800/80 bg-zinc-950 px-4 py-5 lg:flex">
        <Brand />
        <nav className="mt-8 flex flex-col gap-1" aria-label="Admin">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={link}><Icon className="h-4 w-4" aria-hidden />{label}</NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-zinc-800/80 pt-4">
          <p className="truncate text-xs text-zinc-500" title={owner.email}>{owner.email}</p>
          <button type="button" onClick={onSignOut} className="mt-2 flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100"><LogOut className="h-4 w-4" aria-hidden />Sign out</button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/95 px-4 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between">
          <Brand compact />
          <button type="button" onClick={onSignOut} className="rounded-lg p-2 text-zinc-400 hover:text-zinc-100" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
        </div>
        <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2" aria-label="Admin">
          {NAV.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `whitespace-nowrap rounded-full px-3 py-1.5 text-xs ${isActive ? 'bg-lime-400/15 text-lime-300' : 'text-zinc-400'}`}>{label}</NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}

function Brand({ compact = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src={LOGO_URL} alt="" className="h-8 w-8 rounded-lg" />
      <div className="leading-tight">
        <p className="text-sm font-bold tracking-[.14em] text-zinc-50">VITTOVA</p>
        {!compact && <p className="flex items-center gap-1 text-[11px] text-lime-300/80"><ShieldCheck className="h-3 w-3" aria-hidden />Owner Console</p>}
      </div>
    </div>
  );
}
