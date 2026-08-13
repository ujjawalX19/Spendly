import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '⚠️ Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local'
  );
}

// IMPORTANT: Supabase JS v2 requires a *synchronous* storage interface.
// @aparajita/capacitor-secure-storage is async-only (hardware Keystore/Keychain),
// so it cannot be used as a direct Supabase auth storage adapter without breaking
// session restore on app launch (the exact bug that prevented login).
//
// Strategy:
//   - Keep Supabase using the built-in localStorage (works on both web & Capacitor WebView).
//   - Capacitor WebView has an isolated localStorage so tokens never leave the app's sandbox.
//   - SecureStorage is available via secureStorageAdapter.js for storing other app secrets.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
