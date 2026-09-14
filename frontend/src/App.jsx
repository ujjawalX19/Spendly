import { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { supabase } from './lib/supabaseClient';
import { NATIVE_SCHEME, NATIVE_HOSTS, authErrorFromUrl, isMissingVerifierError } from './lib/authRedirects';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProProvider } from './contexts/ProContext';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import { hasOnboarded } from './pages/Onboarding';

// Login and Signup stay eagerly imported: they are the first screen a signed
// out user sees, and a lazy chunk there would add a spinner to cold start.
import Login from './pages/Login';
import Signup from './pages/Signup';

const Landing = lazy(() => import('./pages/Landing'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Transactions = lazy(() => import('./pages/Transactions'));
const HostelPool = lazy(() => import('./pages/HostelPool'));
const GroupDetail = lazy(() => import('./pages/GroupDetail'));
const Chatbot = lazy(() => import('./pages/Chatbot'));
const Wealth = lazy(() => import('./pages/Wealth'));
const Settings = lazy(() => import('./pages/Settings'));
const ProUpgrade = lazy(() => import('./pages/ProUpgrade'));
const SubscriptionGraveyard = lazy(() => import('./pages/SubscriptionGraveyard'));
const PdfImport = lazy(() => import('./pages/PdfImport'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const DeleteAccountInfo = lazy(() => import('./pages/DeleteAccountInfo'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));

function FullScreenLoader({ label = 'Loading...' }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]" role="status" aria-live="polite">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-zinc-500 text-sm">{label}</p>
      </div>
    </div>
  );
}

function ProfileUnavailable() {
  const { refreshProfile, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-6 text-center text-white">
      <div className="max-w-sm">
        <h1 className="text-xl font-black">We couldn't load your account</h1>
        <p className="mt-2 text-sm text-zinc-400">Check your connection and try again. If this keeps happening, sign out and sign in again.</p>
        <div className="mt-6 flex flex-col gap-3">
          <button type="button" onClick={refreshProfile} className="h-12 rounded-xl bg-lime-400 font-bold text-black">Try again</button>
          <button type="button" onClick={async () => { await logout(); navigate('/login', { replace: true }); }} className="h-12 rounded-xl border border-white/10 font-bold text-zinc-300">Sign out</button>
        </div>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { session, loading, profileError, user } = useAuth();

  if (loading) return <FullScreenLoader />;
  if (!session) return <Navigate to="/login" replace />;
  if (profileError && !user) return <ProfileUnavailable />;

  // First-time users see what the app does, and the notification-access
  // explanation, before the dashboard.
  if (!hasOnboarded()) return <Navigate to="/welcome" replace />;

  return children;
}

function Layout({ children }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="pb-20 md:pb-0 md:pl-64 min-h-screen">
      <Sidebar onLogout={handleLogout} />
      <main className="p-4 md:p-8 max-w-7xl mx-auto">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}

// Deep links already acted on. Android can deliver the same URL both as the
// launch URL and as an appUrlOpen event, and React may remount the handler; a
// PKCE code can only be exchanged once, so a second attempt would show a
// spurious error.
const handledDeepLinks = new Set();

/**
 * Handles the Android deep links that finish an auth flow:
 *   spendly://login-callback   Google sign-in, signup email confirmation
 *   spendly://reset-password   password-reset email
 *
 * Nothing in the URL is trusted beyond a one-time PKCE `code`, which only
 * works together with the code verifier this app stored when it started the
 * flow. Access or refresh tokens in a URL are ignored, so a crafted link
 * cannot sign the user into someone else's account.
 */
function DeepLinkHandler({ onMessage }) {
  const navigate = useNavigate();
  const { markPasswordRecovery } = useAuth();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;

    let listener;
    let cancelled = false;

    const handleUrl = async (url) => {
      if (!url || handledDeepLinks.has(url)) return;

      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        return;
      }
      const host = parsed.hostname;
      if (parsed.protocol !== `${NATIVE_SCHEME}:` || !Object.values(NATIVE_HOSTS).includes(host)) return;
      handledDeepLinks.add(url);

      // Android does not close the Custom Tab for us.
      try { await Browser.close(); } catch { /* not open, or unsupported */ }
      if (cancelled) return;

      const isReset = host === NATIVE_HOSTS.reset;
      const failTo = isReset ? '/forgot-password' : '/login';

      const providerError = authErrorFromUrl(url);
      if (providerError) {
        onMessage(providerError);
        navigate(failTo, { replace: true });
        return;
      }

      const code = parsed.searchParams.get('code');
      if (!code || !/^[A-Za-z0-9._~-]{8,512}$/.test(code)) {
        onMessage('That link is not valid. Please try again.');
        navigate(failTo, { replace: true });
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (cancelled) return;
      if (error) {
        onMessage(isMissingVerifierError(error)
          ? 'Please open the link on the same device where you requested it.'
          : 'This link has expired or has already been used. Please request a new one.');
        navigate(failTo, { replace: true });
        return;
      }

      if (isReset) {
        markPasswordRecovery(true);
        navigate('/reset-password', { replace: true });
      } else {
        navigate('/dash', { replace: true });
      }
    };

    CapApp.addListener('appUrlOpen', ({ url }) => { handleUrl(url); })
      .then((l) => { if (cancelled) l.remove(); else listener = l; });

    // Cold start: the app may have been launched by the callback itself.
    CapApp.getLaunchUrl()
      .then((launch) => { if (launch?.url) handleUrl(launch.url); })
      .catch(() => { /* no launch url */ });

    return () => {
      cancelled = true;
      listener?.remove();
    };
  }, [navigate, onMessage, markPasswordRecovery]);

  return null;
}

function App() {
  const [authMessage, setAuthMessage] = useState('');

  return (
    <ThemeProvider>
      <AuthProvider>
        <ProProvider>
          <Router>
            <DeepLinkHandler onMessage={setAuthMessage} />
            {authMessage ? (
              <div role="alert" className="fixed top-0 inset-x-0 z-50 bg-red-500/95 text-white text-sm px-4 py-3 flex items-start gap-3">
                <span className="flex-1">{authMessage}</span>
                <button type="button" onClick={() => setAuthMessage('')} aria-label="Dismiss" className="shrink-0 px-2 -my-1 text-lg leading-none">
                  &times;
                </button>
              </div>
            ) : null}
            <Suspense fallback={<FullScreenLoader />}>
              <Routes>
                <Route path="/" element={
                  Capacitor.isNativePlatform()
                    ? <ProtectedRoute><Navigate to="/dash" replace /></ProtectedRoute>
                    : <Landing />
                } />
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/welcome" element={<Onboarding />} />

                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<TermsOfService />} />
                <Route path="/delete-account" element={<DeleteAccountInfo />} />

                <Route path="/dash" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
                <Route path="/transactions" element={<ProtectedRoute><Layout><Transactions /></Layout></ProtectedRoute>} />
                <Route path="/pool" element={<ProtectedRoute><Layout><HostelPool /></Layout></ProtectedRoute>} />
                <Route path="/pool/:groupId" element={<ProtectedRoute><Layout><GroupDetail /></Layout></ProtectedRoute>} />
                <Route path="/bot" element={<ProtectedRoute><Layout><Chatbot /></Layout></ProtectedRoute>} />
                <Route path="/wealth" element={<ProtectedRoute><Layout><Wealth /></Layout></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><Layout><Settings /></Layout></ProtectedRoute>} />
                <Route path="/graveyard" element={<ProtectedRoute><Layout><SubscriptionGraveyard /></Layout></ProtectedRoute>} />
                <Route path="/import" element={<ProtectedRoute><Layout><PdfImport /></Layout></ProtectedRoute>} />
                <Route path="/pro" element={<ProtectedRoute><ProUpgrade /></ProtectedRoute>} />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </Router>
        </ProProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
