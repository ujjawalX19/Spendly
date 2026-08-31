import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProProvider } from './contexts/ProContext';
import Sidebar from './components/Sidebar';
import BottomNav from './components/BottomNav';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import HostelPool from './pages/HostelPool';
import Chatbot from './pages/Chatbot';
import Wealth from './pages/Wealth';
import Settings from './pages/Settings';
import ProUpgrade from './pages/ProUpgrade';
import SubscriptionGraveyard from './pages/SubscriptionGraveyard';
import PdfImport from './pages/PdfImport';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import AdminDashboard from './pages/Admin/AdminDashboard';

// ── Inline Protected Route (replaces old ProtectedRoute component) ──
function ProtectedRoute({ children }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-lime-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

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

function App() {
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('appUrlOpen', (event) => {
        const url = event.url;
        // Supabase automatically parses the session from the URL hash if it matches the current client
        if (url.includes('spendly://')) {
          // Force a router navigation to the dashboard or let Supabase's auth state listener handle it
          window.location.href = url; // or use your React Router navigate function
        }
      });
    }
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <ProProvider>
          <Router>
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
              <Route path="/signup" element={<Signup />} />
              
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              
              <Route path="/dash" element={
                  <ProtectedRoute>
                      <Layout><Dashboard /></Layout>
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
                      <Layout><AdminDashboard /></Layout>
                  </ProtectedRoute>
              } />
            </Routes>
          </Router>
        </ProProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
