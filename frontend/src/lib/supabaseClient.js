import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

/**
 * Supabase client — authentication and reading the user's own profile only.
 *
 * All data writes go through the Vittova backend; the database grants this
 * (anon-key) client SELECT on the user's own rows and nothing else.
 *
 * flowType 'pkce': OAuth, email confirmation and password-reset links return a
 * one-time code that only this device can exchange (it holds the code
 * verifier). The implicit flow put access and refresh tokens in the callback
 * URL, where another app registered for the same custom scheme could read them,
 * and a crafted link could sign the user into an attacker's account.
 *
 * detectSessionInUrl: on the web, supabase-js exchanges `?code=` on page load.
 * In the Android app the callback arrives as a deep link instead and is
 * exchanged explicitly (see DeepLinkHandler in App.jsx).
 *
 * Session storage: Supabase JS requires synchronous storage, so the session
 * stays in the WebView's localStorage, private to the app sandbox and excluded
 * from backups (see android backup_rules.xml / data_extraction_rules.xml).
 */
/**
 * Whether this browser held a PKCE code verifier when the page loaded, i.e. a
 * sign-in was started on this website. Read before the client exists, because
 * supabase-js deletes the verifier once it has exchanged the code. The
 * /auth/callback page uses it to tell a website sign-in from the Android app's
 * hand-off (see lib/appHandoff.js). Key format is supabase-js's default.
 */
export const hadPkceVerifierAtLoad = (() => {
  try {
    const ref = new URL(supabaseUrl).hostname.split('.')[0];
    return Boolean(window.localStorage.getItem(`sb-${ref}-auth-token-code-verifier`));
  } catch {
    return false;
  }
})();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: !Capacitor.isNativePlatform(),
    persistSession: true,
    autoRefreshToken: true,
  },
});
