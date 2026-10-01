import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Browser } from '@capacitor/browser';
import { supabase } from '../lib/supabaseClient';
import { isNative, isRecoveryReturn, loginRedirectUrl, passwordResetRedirectUrl, RESET_REQUEST_KEY } from '../lib/authRedirects';
import { apiFetch, apiUrl, authHeaders } from '../lib/apiConfig';
import { flushTelemetry, track, trackAuthFailure, trackLogin } from '../lib/telemetry';
import { GOOGLE_PENDING_KEY } from '../lib/authCallbackOutcome';
import { clearRemindersForSignOut } from '../lib/debitReminders';
import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '../plugins/GoogleAuth';
import {
  GOOGLE_WEB_CLIENT_ID, makeNonce, nativeFailureAction, nativeFailureCode, nativeFailureMessage,
  NATIVE_REFUSED_KEY, shouldSkipNative,
} from '../lib/googleSignIn';
import { singleFlight } from '../lib/singleFlight';
import { authErrorKind, authErrorMessage } from '../lib/authMessages';
import { authLog } from '../lib/authLog';

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
    // A web reset link lands here with ?code=…; supabase-js emits SIGNED_IN for
    // it, not PASSWORD_RECOVERY, so the URL is what marks the recovery.
    try {
      const requestedAt = Number(window.localStorage.getItem(RESET_REQUEST_KEY)) || null;
      if (isRecoveryReturn(window.location.href, requestedAt)) {
        try { window.sessionStorage.setItem('spendly.recovery', '1'); } catch { /* storage unavailable */ }
        return true;
      }
      return window.sessionStorage.getItem('spendly.recovery') === '1';
    } catch { return false; }
  });
  const lastUserId = useRef(null);

  const markPasswordRecovery = useCallback((value) => {
    setPasswordRecovery(value);
    try {
      if (value) window.sessionStorage.setItem('spendly.recovery', '1');
      else {
        window.sessionStorage.removeItem('spendly.recovery');
        window.localStorage.removeItem(RESET_REQUEST_KEY);
      }
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
      // Signed in, but the profile could not be read: its own screen
      // (ProfileUnavailable), never a login failure.
      authLog('PROFILE_LOAD_FAILED');
      setProfileError(true);
      return null;
    }
    authLog('PROFILE_LOADED');
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
      if (event === 'SIGNED_IN') { trackLogin(nextSession?.user); authLog('SUPABASE_SESSION_CREATED'); }
      if (event === 'INITIAL_SESSION' && nextSession) authLog('SESSION_RESTORED');
      if (event === 'SIGNED_OUT') authLog('SIGNED_OUT');
      applySession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadProfile, markPasswordRecovery]);

  const login = async (email, password) => {
    authLog('AUTH_START');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      trackAuthFailure('login_failed', 'email', error);
      authLog(authErrorKind(error) === 'rate_limited' ? 'EMAIL_RATE_LIMITED' : 'EMAIL_LOGIN_FAILED');
      return { success: false, message: authErrorMessage('login', error) };
    }
    authLog('AUTH_COMPLETE');
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
      // Supabase's own texts ("email rate limit exceeded": the confirmation
      // email could not be sent right now) are never shown as they are.
      authLog(authErrorKind(error) === 'rate_limited' ? 'EMAIL_RATE_LIMITED' : 'EMAIL_SIGNUP_FAILED');
      return { success: false, message: authErrorMessage('signup', error) };
    }
    track('signup', { method: 'email' });

    // With email confirmation on (the Supabase default) there is no session yet.
    if (data?.user && !data.session) return { success: true, needsConfirmation: true };
    return { success: true, needsConfirmation: false };
  };

  /**
   * Google sign-in in a browser. This is how the WEBSITE signs in (an ordinary
   * redirect). The Android app uses it only on a phone with no Google Play
   * services, where Google's in-app sheet cannot exist: the provider URL opens
   * in a Chrome Custom Tab and returns through vittova.in/auth/app-callback to
   * spendly://login-callback (DeepLinkHandler in App.jsx).
   */
  const browserGoogleSignIn = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: loginRedirectUrl(),
        skipBrowserRedirect: isNative(),
      },
    });
    if (error) {
      trackAuthFailure('login_failed', 'google', error);
      authLog('GOOGLE_START_FAILED');
      return { success: false, message: authErrorMessage('google', error) };
    }

    if (isNative()) {
      if (!data?.url) {
        track('login_failed', { method: 'google', code: 'no_provider_url' });
        authLog('GOOGLE_START_FAILED');
        return { success: false, message: 'Could not start Google sign-in. Please try again.' };
      }
      // Lets the callback word its messages for Google rather than for an
      // email link (the same spendly://login-callback finishes both).
      try { window.localStorage.setItem(GOOGLE_PENDING_KEY, String(Date.now())); } catch { /* storage unavailable */ }
      authLog('GOOGLE_BROWSER_OPENED');
      await Browser.open({ url: data.url, presentationStyle: 'popover' });
    }
    return { success: true };
  };

  /**
   * Google sign-in inside the Android app. Google's own account sheet opens
   * over Vittova (GoogleAuthPlugin); the ID token it returns is exchanged with
   * Supabase, which checks Google's signature, the audience and the nonce. The
   * user never leaves the app.
   *
   * Returns null only when this phone cannot show Google's sheet at all (no
   * Google Play services), so the caller uses the browser there. Every other
   * failure is reported as what it is: a cancellation stays silent, anything
   * else gets a plain message. In particular, a build Google does not
   * recognise (no Android OAuth client for its package and signing
   * certificate) says so instead of doing nothing.
   */
  const nativeGoogleSignIn = async () => {
    const nonce = await makeNonce();
    let idToken;
    try {
      ({ idToken } = await GoogleAuth.signIn({ serverClientId: GOOGLE_WEB_CLIENT_ID, nonce: nonce.hashed }));
    } catch (err) {
      const action = nativeFailureAction(err?.code);
      track('login_failed', { method: 'google', code: nativeFailureCode(err?.code) });
      if (action === 'cancelled') return { success: false, cancelled: true };
      if (action === 'browser') {
        // Remembered, so the next sign-ins go straight to the browser instead
        // of a sheet that cannot work here (retried after a day).
        if (err?.code === 'OAUTH_CONFIGURATION_ERROR') {
          try { window.localStorage.setItem(NATIVE_REFUSED_KEY, String(Date.now())); } catch { /* storage unavailable */ }
        }
        return null;
      }
      return { success: false, message: nativeFailureMessage(err?.code) };
    }
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken, nonce: nonce.raw });
    if (error) {
      trackAuthFailure('login_failed', 'google', error);
      authLog('SUPABASE_AUTH_FAILED');
      return { success: false, message: authErrorKind(error) === 'network'
        ? authErrorMessage('google', error)
        : 'Google sign-in could not be verified. Please try again.' };
    }
    // onAuthStateChange now holds the session and routes to the app.
    try { window.localStorage.removeItem(NATIVE_REFUSED_KEY); } catch { /* storage unavailable */ }
    authLog('AUTH_COMPLETE');
    return { success: true, native: true };
  };

  const startGoogleSignIn = async () => {
    track('google_sign_in_started', { method: 'google' });
    authLog('AUTH_START');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      authLog('AUTH_OFFLINE');
      return { success: false, message: 'You appear to be offline. Connect to the internet and try again.' };
    }
    try {
      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
        let refusedAt = null;
        try { refusedAt = window.localStorage.getItem(NATIVE_REFUSED_KEY); } catch { /* storage unavailable */ }
        if (!shouldSkipNative(refusedAt)) {
          const native = await nativeGoogleSignIn();
          if (native) return native;
        }
      }
      // The website; a phone without Google Play services; or a build Google
      // does not recognise. One tap still signs the person in.
      return await browserGoogleSignIn();
    } catch {
      authLog('GOOGLE_START_FAILED');
      return { success: false, message: 'Google sign-in could not be started. Please try again.' };
    }
  };

  // One attempt at a time: a second tap never opens a second sheet or tab.
  // (These functions use nothing from this component's state, so the first
  // render's copy is the one kept.)
  const [loginWithGoogle] = useState(() => singleFlight(startGoogleSignIn, () => authLog('AUTH_ALREADY_RUNNING')));

  /**
   * Send a password-reset email. The response is deliberately the same
   * whether or not the address has an account, so the form cannot be used to
   * discover who uses Vittova.
   */
  const requestPasswordReset = async (email) => {
    // Remembered so the return leg is recognised even if Supabase falls back
    // to the Site URL instead of our redirect (see isRecoveryReturn).
    try { window.localStorage.setItem(RESET_REQUEST_KEY, String(Date.now())); } catch { /* storage unavailable */ }
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: passwordResetRedirectUrl() });
    if (error) trackAuthFailure('password_reset_failed', 'email', error);
    else track('password_reset_requested', { method: 'email' });
    if (error) {
      const kind = authErrorKind(error);
      if (kind === 'rate_limited') authLog('EMAIL_RATE_LIMITED');
      if (kind === 'rate_limited' || kind === 'invalid_email' || kind === 'network') {
        return { success: false, message: authErrorMessage('reset', error) };
      }
      // Anything else (including "user not found" on some configurations) is not revealed.
    }
    return { success: true };
  };

  /** Set a new password for the signed-in (recovery) session. */
  const updatePassword = async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { success: false, message: authErrorMessage('update_password', error) };
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
    // Forget the Google account choice too, so the next sign-in asks again.
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      await GoogleAuth.signOut().catch(() => {});
    }
    await clearRemindersForSignOut();
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
