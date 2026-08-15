import { createContext, useContext, useState, useEffect } from 'react';
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
    return { success: true };
  };

  const loginWithGoogle = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/dash',
      },
    });
    if (error) {
      return { success: false, message: error.message };
    }
    return { success: true };
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
