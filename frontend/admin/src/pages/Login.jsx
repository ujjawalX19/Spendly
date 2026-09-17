import { useState } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui';

const LOGO_URL = `${import.meta.env.BASE_URL}vittova-logo.svg`;

/**
 * Sign in with the app's normal Supabase accounts. Signing in proves identity
 * only; the backend then decides whether this account is the owner.
 *
 * Error messages are deliberately generic so the page does not reveal which
 * address is the owner's.
 */
export default function Login({ denied, onClearDenied }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const signIn = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    onClearDenied?.();
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (!authError) return;
    if (authError.status === 429) setError('Too many attempts. Wait a few minutes.');
    // Same wording for every account, so it does not reveal the owner's address.
    // Accounts created with Google have no password until one is set.
    else if (/invalid login credentials/i.test(authError.message || '')) {
      setError('Email or password is incorrect. If you created your account with Google, use Continue with Google.');
    } else setError('Sign-in failed. Please try again.');
  };

  const google = async () => {
    setError('');
    onClearDenied?.();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      // Back to the console, not the user app on the same origin.
      options: { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
    });
    if (authError) setError('Google sign-in could not be started.');
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <img src={LOGO_URL} alt="" className="h-10 w-10 rounded-xl" />
          <div>
            <h1 className="text-lg font-semibold text-zinc-50">Vittova Owner Console</h1>
            <p className="flex items-center gap-1 text-xs text-zinc-500"><ShieldCheck className="h-3 w-3" aria-hidden />Restricted to the app owner</p>
          </div>
        </div>

        {denied && (
          <div role="alert" className="mb-5 flex gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden />
            <p>This account is not authorized for the admin panel. You have been signed out. The attempt was logged.</p>
          </div>
        )}

        <form onSubmit={signIn} className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-zinc-400">Email</label>
            <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 focus:border-lime-400 focus:outline-none" />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-zinc-400">Password</label>
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 focus:border-lime-400 focus:outline-none" />
          </div>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <Button type="submit" variant="primary" loading={busy} className="w-full py-2.5">Sign in</Button>
          <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-zinc-600"><span className="h-px flex-1 bg-zinc-800" />or<span className="h-px flex-1 bg-zinc-800" /></div>
          <Button onClick={google} className="w-full py-2.5">Continue with Google</Button>
        </form>
      </div>
    </div>
  );
}
