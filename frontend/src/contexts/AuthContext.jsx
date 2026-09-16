import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Browser } from '@capacitor/browser';
import { supabase } from '../lib/supabaseClient';
import { isNative, loginRedirectUrl, passwordResetRedirectUrl } from '../lib/authRedirects';
import { apiFetch, apiUrl, authHeaders } from '../lib/apiConfig';
import { flushTelemetry, track, trackAuthFailure, trackLogin } from '../lib/telemetry';

const AuthContext = createContext();

// Local, per-device app state that must not survive into another account.
const LOCAL_KEYS_TO_CLEAR = ['spendly.seenPayments.v1', 'spendly.notificationPrompt.v1', 'spendly.recovery'];

function clearLocalAppState() {
  for (const key of LOCAL_KEYS_TO_CLEAR) {
    try { window.localStorage.removeItem(key); } catch { /* storage unavailable */ }
    try { window.sessionStorage.removeItem(key); } catch { /* storage unavailable */ }
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);        // the signed-in user's profile row
  const [session, setSession] = useState(null);  // Supabase auth session (JWT)
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(() => {
    try { return window.sessionStorage.getItem('spendly.recovery') === '1'; } catch { return false; }
  });
  const lastUserId = useRef(null);

  const markPasswordRecovery = useCallback((value) => {
    setPasswordRecovery(value);
    try {
      if (value) window.sessionStorage.setItem('spendly.recovery', '1');
      else window.sessionStorage.removeItem('spendly.recovery');
    } catch { /* storage unavailable */ }
  }, []);

  // Reading the profile is the only table access the app makes directly; the
  // database allows SELECT on the user's own row and nothing else.
  const loadProfile = useCallback(async (userId) => {
    let { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (!error && !data) {
      // Older accounts can lack a profile row (created before the signup
      // trigger). The backend creates one with default values, then we re-read.
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const res = await apiFetch(apiUrl('/auth/profile'), {
          method: 'POST',
          headers: authHeaders(sessionData.session),
        });
        if (res.ok) {
          ({ data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle());
        }
      } catch { /* network failure: fall through to the retry screen */ }
    }
    if (error || !data) {
      setProfileError(true);
      return null;
    }
    setProfileError(false);
    setUser(data);
    return data;
  }, []);

  useEffect(() => {
    let active = true;

    const applySession = (nextSession) => {
      setSession(nextSession);
      const userId = nextSession?.user?.id || null;
      if (!userId) {
        lastUserId.current = null;
        setUser(null);
        setProfileError(false);
        setLoading(false);
        return;
      }
      if (userId === lastUserId.current) {
        setLoading(false);
        return;
      }
      lastUserId.current = userId;
      // Deferred: calling Supabase from inside onAuthStateChange can deadlock
      // the auth client (documented supabase-js behaviour).
      setTimeout(() => {
        loadProfile(userId).finally(() => { if (active) setLoading(false); });
      }, 0);
    };

    supabase.auth.getSession().then(({ data }) => { if (active) applySession(data.session); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') markPasswordRecovery(true);
      // Counted once per real sign-in (email or Google), not per page load.
      if (event === 'SIGNED_IN') trackLogin(nextSession?.user);
      applySession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadProfile, markPasswordRecovery]);

  const login = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      trackAuthFailure('login_failed', 'email', error);
      return { success: false, message: error.message };
    }
    return { success: true };
  };

  const signup = async (name, email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        // Without this the confirmation email opens the website, not the app.
        emailRedirectTo: loginRedirectUrl(),
      },
    });
    if (error) {
      trackAuthFailure('signup_failed', 'email', error);
      return { success: false, message: error.message };
    }
    track('signup', { method: 'email' });

    // With email confirmation on (the Supabase default) there is no session yet.
    if (data?.user && !data.session) return { success: true, needsConfirmation: true };
    return { success: true, needsConfirmation: false };
  };

  /**
   * Google sign-in.
   *
   * Web: an ordinary redirect. Android: the provider URL is opened in a Chrome
   * Custom Tab (never the WebView — Google blocks OAuth in embedded WebViews,
   * and navigating the WebView turns the app into a website). Google returns to
   * spendly://login-callback, handled by DeepLinkHandler in App.jsx.
   */
  const loginWithGoogle = async () => {
    track('google_sign_in_started', { method: 'google' });
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: loginRedirectUrl(),
          skipBrowserRedirect: isNative(),
        },
      });
      if (error) {
        trackAuthFailure('login_failed', 'google', error);
        return { success: false, message: error.message };
      }

      if (isNative()) {
        if (!data?.url) {
          track('login_failed', { method: 'google', code: 'no_provider_url' });
          return { success: false, message: 'Could not start Google sign-in. Please try again.' };
        }
        await Browser.open({ url: data.url, presentationStyle: 'popover' });
      }
      return { success: true };
    } catch {
      return { success: false, message: 'Google sign-in could not be started. Please try again.' };
    }
  };

  /**
   * Send a password-reset email. The response is deliberately the same
   * whether or not the address has an account, so the form cannot be used to
   * discover who uses Vittova.
   */
  const requestPasswordReset = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: passwordResetRedirectUrl() });
    if (error) trackAuthFailure('password_reset_failed', 'email', error);
    else track('password_reset_requested', { method: 'email' });
    if (error) {
      if (error.status === 429 || /rate limit|too many/i.test(error.message)) {
        return { success: false, message: 'Too many reset requests. Please wait a few minutes and try again.' };
      }
      if (/valid email|invalid email|email address/i.test(error.message)) {
        return { success: false, message: 'Please enter a valid email address.' };
      }
      // Anything else (including "user not found" on some configurations) is not revealed.
    }
    return { success: true };
  };

  /** Set a new password for the signed-in (recovery) session. */
  const updatePassword = async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { success: false, message: error.message };
    track('password_updated');
    markPasswordRecovery(false);
    return { success: true };
  };

  /**
   * Sign out on this device. `scope: 'local'` so signing out of the phone does
   * not also sign the user out of their other devices.
   */
  const logout = async ({ scope = 'local' } = {}) => {
    // Sent while the session is still valid, so it is linked to this install.
    track('logout');
    await Promise.race([flushTelemetry(), new Promise((resolve) => setTimeout(resolve, 800))]);
    try {
      await supabase.auth.signOut({ scope });
    } catch {
      // The session may already be invalid (e.g. the account was deleted).
    }
    clearLocalAppState();
    markPasswordRecovery(false);
    lastUserId.current = null;
    setUser(null);
    setSession(null);
  };

  /**
   * Merge server-returned values (e.g. new chillar total after logging an
   * expense) into the displayed profile. This never writes to the database:
   * those columns are server-owned.
   */
  const applyServerProfile = useCallback((fields) => {
    const clean = Object.fromEntries(Object.entries(fields || {}).filter(([, v]) => v !== undefined && v !== null));
    if (Object.keys(clean).length) setUser((prev) => (prev ? { ...prev, ...clean } : prev));
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        profileError,
        passwordRecovery,
        markPasswordRecovery,
        login,
        signup,
        loginWithGoogle,
        requestPasswordReset,
        updatePassword,
        logout,
        applyServerProfile,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
