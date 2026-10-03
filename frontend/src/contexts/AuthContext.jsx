import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { isRecoveryReturn, loginRedirectUrl, passwordResetRedirectUrl, RESET_REQUEST_KEY } from '../lib/authRedirects';
import { apiFetch, apiUrl, authHeaders } from '../lib/apiConfig';
import { flushTelemetry, track, trackAuthFailure, trackLogin } from '../lib/telemetry';
import { clearRemindersForSignOut } from '../lib/debitReminders';
import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '../plugins/GoogleAuth';
import {
  GOOGLE_WEB_CLIENT_ID, makeNonce, nativeFailureAction, nativeFailureCode, nativeFailureMessage,
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
   * Google sign-in on the WEBSITE: an ordinary redirect to Google and back.
   * The Android app never uses this; it signs in with Google's own sheet
   * (nativeGoogleSignIn) and opens no browser.
   */
  const browserGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: loginRedirectUrl() },
    });
    if (error) {
      trackAuthFailure('login_failed', 'google', error);
      return { success: false, message: authErrorMessage('google', error) };
    }
    return { success: true };
  };

  /**
   * Google sign-in inside the Android app. Google's own account sheet opens
   * over Vittova (GoogleAuthPlugin); the ID token it returns is exchanged with
   * Supabase, which checks Google's signature, the audience and the nonce. The
   * user never leaves the app, whatever the result: a cancellation stays
   * silent, and every failure gets a plain message on the login screen. A
   * build Google does not recognise (no Android OAuth client for its package
   * and signing certificate) says that Google sign-in is not available and
   * points to email sign-in; it does not open a browser.
   */
  const nativeGoogleSignIn = async () => {
    const nonce = await makeNonce();
    let idToken;
    try {
      ({ idToken } = await GoogleAuth.signIn({ serverClientId: GOOGLE_WEB_CLIENT_ID, nonce: nonce.hashed }));
    } catch (err) {
      track('login_failed', { method: 'google', code: nativeFailureCode(err?.code) });
      if (nativeFailureAction(err?.code) === 'cancelled') return { success: false, cancelled: true };
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
      // The app: Google's sheet, inside Vittova. The website: a redirect.
      if (Capacitor.isNativePlatform()) return await nativeGoogleSignIn();
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

  /**
   * Finish an email step with the code typed from the email, inside the app
   * (no link, no browser). Supabase checks the code and returns the session.
   *   'signup'    confirms the address: the person is signed in.
   *   'recovery'  opens a recovery session: the set-password form is next.
   * The link in the same email does the same thing through the deep link.
   */
  const confirmEmailCode = async (email, code, type) => {
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type });
    if (error) {
      trackAuthFailure(type === 'signup' ? 'signup_failed' : 'password_reset_failed', 'email', error);
      return { success: false, message: authErrorMessage('verify_code', error) };
    }
    if (type === 'recovery') markPasswordRecovery(true);
    else authLog('AUTH_COMPLETE');
    return { success: true };
  };

  /** Send the sign-up confirmation email again. */
  const resendSignupEmail = async (email) => {
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: loginRedirectUrl() } });
    if (error) return { success: false, message: authErrorMessage('resend', error) };
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
        confirmEmailCode,
        resendSignupEmail,
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
