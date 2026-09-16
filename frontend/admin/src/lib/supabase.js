import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

/**
 * Supabase client for signing in only — the public anon key, exactly as the
 * user app uses. It grants nothing beyond the owner's own profile row; every
 * admin read and action goes through the backend's owner-only API.
 *
 * The console is served on the same origin as the user app (vittova.in/admin),
 * so its session uses a separate key AND sessionStorage: it lives only in this
 * tab, is gone when the tab closes, and is not readable from other tabs of
 * vittova.in.
 */
function tabStorage() {
  try { return window.sessionStorage; } catch { return undefined; }
}

export const supabase = createClient(url, anonKey, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'vittova-admin-auth',
    storage: tabStorage(),
  },
});
