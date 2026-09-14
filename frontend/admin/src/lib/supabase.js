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
 * A separate storage key keeps the admin session apart from a user-app
 * session on the same browser origin (e.g. localhost during development).
 */
export const supabase = createClient(url, anonKey, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'vittova-admin-auth',
  },
});
