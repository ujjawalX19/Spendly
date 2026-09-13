import { createContext, useContext, useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // Profile data from `profiles` table
  const [session, setSession] = useState(null);  // Supabase auth session (contains JWT)
  const [loading, setLoading] = useState(true);

  // ── Fetch profile from `profiles` table ──
  const fetchProfile = async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching profile:', error.message);
      return null;
    }
    return data;
  };

  // ── Initialize: check existing session + listen for auth changes ──
  useEffect(() => {
    if (!supabase) {
      console.error('⚠️ Supabase client not initialized — check env vars');
      setLoading(false);
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
      setSession(currentSession);
      if (currentSession?.user) {
        const profile = await fetchProfile(currentSession.user.id);
        setUser(profile);
      }
      setLoading(false);
    });

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);
        if (newSession?.user) {
          const profile = await fetchProfile(newSession.user.id);
          setUser(profile);
        } else {
          setUser(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ── Auth Methods ──

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      return { success: false, message: error.message };
    }
    if (data?.session) {
      setSession(data.session);
      if (data.user) {
        const profile = await fetchProfile(data.user.id);
        setUser(profile);
      }
    }
    return { success: true };
  };

  const signup = async (name, email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },  // Stored in raw_user_meta_data, used by trigger
      },
    });
    if (error) {
      return { success: false, message: error.message };
    }

    // Supabase returns data.user but data.session will be null when
    // email confirmation is required (the default setting).
    if (data?.user && !data.session) {
      return {
        success: false,
        needsConfirmation: true,
        message: 'Check your email and click the confirmation link to activate your account, then come back and log in.',
      };
    }

    if (data?.session) {
      setSession(data.session);
      if (data.user) {
        const profile = await fetchProfile(data.user.id);
        setUser(profile);
      }
    }

    return { success: true };
  };


  /**
   * Google sign-in.
   *
   * On the web this is an ordinary redirect. On Android it must NOT be:
   * supabase-js defaults to assigning the provider URL to `window.location`,
   * which navigates the Capacitor WebView itself to accounts.google.com. The
   * app visibly turns into a website, and Google rejects OAuth performed in an
   * embedded WebView ("disallowed_useragent") anyway.
   *
   * So on native we ask supabase-js for the URL without following it
   * (`skipBrowserRedirect`) and hand it to a Chrome Custom Tab. The app stays
   * running underneath; Google redirects to spendly://login-callback, which
   * Android delivers back to us as an `appUrlOpen` event (handled in App.jsx),
   * and that handler closes the tab.
   *
   * REQUIRED SUPABASE DASHBOARD CONFIG (Authentication -> URL Configuration):
   *   Redirect URLs must include `spendly://login-callback`.
   * If it is missing, Supabase silently falls back to the project's Site URL
   * and the user lands on the Spendly website instead of back in the app.
   */
  const loginWithGoogle = async () => {
    const isNative = Capacitor.isNativePlatform();

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
          redirectTo: isNative
            ? 'spendly://login-callback'
            : `${window.location.origin}/dash`,
          // Native: take the URL, don't navigate the WebView to it.
          skipBrowserRedirect: isNative,
        },
      });

      if (error) {
        return { success: false, message: error.message };
      }

      if (isNative) {
        if (!data?.url) {
          return { success: false, message: 'Could not start Google sign-in. Please try again.' };
        }
        await Browser.open({ url: data.url, presentationStyle: 'popover' });
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        message: err?.message || 'An unexpected error occurred during Google sign-in',
      };
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  // ── Update profile helper (for streak, chillar, budget updates) ──
  const updateProfile = async (updates) => {
    if (!session?.user) return;
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', session.user.id)
      .select()
      .single();

    if (!error && data) {
      setUser(data);
    }
    return { data, error };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        login,
        signup,
        loginWithGoogle,
        logout,
        updateProfile,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
