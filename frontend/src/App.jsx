import { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { supabase } from './lib/supabaseClient';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProProvider } from './contexts/ProContext';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';
import { hasOnboarded } from './pages/Onboarding';

// Login and Signup stay eagerly imported: they are the first screen a signed
// out user sees, and a lazy chunk there would add a spinner to cold start.
// Everything behind the auth boundary is split out, which keeps recharts and
// framer-motion's heavier paths off the critical path to first render.
import Login from './pages/Login';
import Signup from './pages/Signup';

const Landing = lazy(() => import('./pages/Landing'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Transactions = lazy(() => import('./pages/Transactions'));
const HostelPool = lazy(() => import('./pages/HostelPool'));
const Chatbot = lazy(() => import('./pages/Chatbot'));
const Wealth = lazy(() => import('./pages/Wealth'));
const Settings = lazy(() => import('./pages/Settings'));
const ProUpgrade = lazy(() => import('./pages/ProUpgrade'));
const SubscriptionGraveyard = lazy(() => import('./pages/SubscriptionGraveyard'));
const PdfImport = lazy(() => import('./pages/PdfImport'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const AdminDashboard = lazy(() => import('./pages/Admin/AdminDashboard'));
const Onboarding = lazy(() => import('./pages/Onboarding'));

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

// ── Inline Protected Route (replaces old ProtectedRoute component) ──
function ProtectedRoute({ children }) {
  const { session, loading } = useAuth();

  if (loading) return <FullScreenLoader />;
  if (!session) return <Navigate to="/login" replace />;

  // Send a first-time user through onboarding before the dashboard. Asking
  // for notification access cold, with no explanation, is why most users
  // decline the feature the product depends on.
  if (!hasOnboarded()) return <Navigate to="/welcome" replace />;

  return children;
}

/**
 * Admin-only route.
 *
 * The API already enforces `role = 'admin'`, so this is not a security
 * boundary — it exists so a non-admin does not load a whole dashboard that
 * then fails with a wall of 403s.
 */
function AdminRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <FullScreenLoader />;
  if (user?.role !== 'admin') return <Navigate to="/dash" replace />;

  return children;
}

// ── Bottom Navigation / Sidebar Layout ──
function Layout({ children }) {
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="pb-20 md:pb-0 md:pl-64 min-h-screen">
      <Sidebar theme={theme} toggleTheme={toggleTheme} onLogout={handleLogout} />

      <main className="p-4 md:p-8 max-w-7xl mx-auto">
        {children}
      </main>

      {/* Mobile bottom nav — visible on ALL authenticated pages */}
      <BottomNav />
    </div>
  );
}

/**
 * Handles the `spendly://login-callback` deep link that ends the Google
 * OAuth round trip.
 *
 * Lives inside <Router> so it can navigate with the router rather than
 * poking window.history and firing a synthetic popstate.
 *
 * Android delivers the callback as an `appUrlOpen` event. Supabase does not
 * consume custom-scheme URLs on its own, so the tokens are applied by hand.
 * Both response shapes are handled: the implicit flow puts tokens in the URL
 * fragment, the PKCE flow puts a `code` in the query string.
 */
function DeepLinkHandler({ onError }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;

    let listener;
    let cancelled = false;

    const finish = async () => {
      // The Custom Tab stays on screen until we dismiss it.
      try { await Browser.close(); } catch { /* already closed */ }
    };

    const handleUrl = async (url) => {
      let callbackUrl;
      try {
        callbackUrl = new URL(url);
      } catch {
        return;
      }

      if (callbackUrl.protocol !== 'spendly:' || callbackUrl.hostname !== 'login-callback') return;

      await finish();
      if (cancelled) return;

      const hashParams = new URLSearchParams(callbackUrl.hash.replace(/^#/, ''));
      const queryParams = callbackUrl.searchParams;

      // The user dismissed the Google consent screen, or the provider
      // rejected the request.
      const providerError =
        hashParams.get('error_description') || hashParams.get('error') ||
        queryParams.get('error_description') || queryParams.get('error');
      if (providerError) {
        onError(
          providerError === 'access_denied'
            ? 'Google sign-in was cancelled.'
            : 'Google sign-in failed. Please try again.'
        );
        navigate('/login', { replace: true });
        return;
      }

      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const code = queryParams.get('code');

      try {
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          throw new Error('The sign-in link did not contain a session.');
        }

        if (!cancelled) navigate('/dash', { replace: true });
      } catch {
        if (cancelled) return;
        onError('We could not complete sign-in. Please try again.');
        navigate('/login', { replace: true });
      }
    };

    CapApp.addListener('appUrlOpen', ({ url }) => { handleUrl(url); })
      .then((l) => { listener = l; });

    // Cold start: the app may have been launched *by* the callback URL.
    CapApp.getLaunchUrl()
      .then((launch) => { if (launch?.url) handleUrl(launch.url); })
      .catch(() => { /* no launch url */ });

    return () => {
      cancelled = true;
      listener?.remove();
    };
  }, [navigate, onError]);

  return null;
}

function App() {
  const [authError, setAuthError] = useState('');

  return (
    <ThemeProvider>
      <AuthProvider>
        <ProProvider>
          <Router>
            <DeepLinkHandler onError={setAuthError} />
            {authError ? (
              <div
                role="alert"
                className="fixed top-0 inset-x-0 z-50 bg-red-500/95 text-white text-sm px-4 py-3 flex items-start gap-3"
              >
                <span className="flex-1">{authError}</span>
                <button
                  type="button"
                  onClick={() => setAuthError('')}
                  aria-label="Dismiss"
                  className="shrink-0 px-2 -my-1 text-lg leading-none"
                >
                  &times;
                </button>
              </div>
            ) : null}
            <Suspense fallback={<FullScreenLoader />}>
            <Routes>
              <Route path="/" element={
                Capacitor.isNativePlatform() ? (
                  <ProtectedRoute>
                      <Navigate to="/dash" replace />
                  </ProtectedRoute>
                ) : (
                  <Landing />
                )
              } />
              <Route path="/login" element={<Login />} />
              <Route path="/welcome" element={<Onboarding />} />
              <Route path="/signup" element={<Signup />} />
              
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              
              <Route path="/dash" element={
                  <ProtectedRoute>
                      <Layout><Dashboard /></Layout>
                  </ProtectedRoute>
              } />
              <Route path="/transactions" element={
                  <ProtectedRoute>
                      <Layout><Transactions /></Layout>
                  </ProtectedRoute>
              } />
              <Route path="/pool" element={
                  <ProtectedRoute>
                      <Layout><HostelPool /></Layout>
                  </ProtectedRoute>
              } />
              <Route path="/bot" element={
                  <ProtectedRoute>
                      <Layout><Chatbot /></Layout>
                  </ProtectedRoute>
              } />
              <Route path="/wealth" element={
                  <ProtectedRoute>
                      <Layout><Wealth /></Layout>
                  </ProtectedRoute>
              } />
              <Route path="/settings" element={
                  <ProtectedRoute>
                      <Layout><Settings /></Layout>
                  </ProtectedRoute>
              } />
              <Route path="/graveyard" element={
                  <ProtectedRoute>
                      <Layout><SubscriptionGraveyard /></Layout>
                  </ProtectedRoute>
              } />
              <Route path="/import" element={
                  <ProtectedRoute>
                      <Layout><PdfImport /></Layout>
                  </ProtectedRoute>
              } />
              <Route path="/pro" element={
                  <ProtectedRoute>
                      <ProUpgrade />
                  </ProtectedRoute>
              } />
              
              <Route path="/admin" element={
                  <ProtectedRoute>
                      <AdminRoute>
                          <Layout><AdminDashboard /></Layout>
                      </AdminRoute>
                  </ProtectedRoute>
              } />
            </Routes>
            </Suspense>
          </Router>
        </ProProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
