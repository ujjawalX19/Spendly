import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://fqzqfwjjiruntrulmdnd.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxenFmd2pqaXJ1bnRydWxtZG5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNDE5NjgsImV4cCI6MjEwMDcxNzk2OH0.JY7ltjIHBNMv-NDFAXLuS8do8Te56fMinkKo7UMyR-s';

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
