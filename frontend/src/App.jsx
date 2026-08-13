import { BrowserRouter as Router, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { LayoutGrid, Bot, Users, Sun, Moon, LogOut, TrendingUp } from 'lucide-react';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import HostelPool from './pages/HostelPool';
import Chatbot from './pages/Chatbot';
import Wealth from './pages/Wealth';
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
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="pb-20 md:pb-0 md:pl-64 min-h-screen">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex flex-col w-64 fixed top-0 left-0 h-full border-r border-[rgba(255,255,255,0.1)] bg-[#0f1115]/80 dark:bg-[#0f1115]/80 light:bg-white/80 backdrop-blur-xl z-50 transition-colors">
        <div className="p-5 flex items-center gap-3">
          <img src="/spendly-logo.svg" alt="Spendly" className="w-9 h-9 rounded-xl" />
          <span className="font-bold text-2xl text-[var(--color-neon-green)] tracking-tight">Spendly</span>
        </div>
        
        {user && (
            <div className="px-6 mb-4">
                <p className="text-sm text-[var(--color-text)]/70">Hi, <span className="font-bold text-[var(--color-text)]">{user.full_name || 'buddy'}</span></p>
                <div className="flex gap-2 text-xs mt-1">
                    <span className="bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full font-bold">🔥 {user.streak_current || 0}</span>
                    <span className="bg-[var(--color-electric-blue)]/20 text-[var(--color-electric-blue)] px-2 py-0.5 rounded-full font-bold">⭐ {user.karma_score || 100}</span>
                </div>
            </div>
        )}

        <nav className="flex-1 px-4 space-y-2">
          <Link to="/dash" className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 active:bg-white/10 transition"><LayoutGrid className="text-lime-400" /> Dashboard</Link>
          <Link to="/pool" className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 active:bg-white/10 transition"><Users className="text-[var(--color-electric-blue)]" /> Hostel Pool</Link>
          <Link to="/bot" className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 active:bg-white/10 transition"><Bot className="text-purple-400" /> AI Dost</Link>
          <Link to="/wealth" className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 active:bg-white/10 transition"><TrendingUp className="text-yellow-400" /> Wealth</Link>
        </nav>

        {/* Desktop Toggles */}
        <div className="p-4 space-y-3 mb-4">
            <button 
                onClick={toggleTheme}
                className="w-full flex items-center justify-between px-3 py-2 bg-black/20 rounded-xl hover:bg-black/40 border border-white/5 transition"
            >
                <span className="text-sm">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                {theme === 'dark' ? <Sun className="w-5 h-5 text-yellow-500" /> : <Moon className="w-5 h-5 text-blue-400" />}
            </button>
            <button 
                onClick={handleLogout}
                className="w-full flex items-center justify-between px-3 py-2 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500/20 border border-red-500/20 transition"
            >
                <span className="text-sm font-bold">Logout</span>
                <LogOut className="w-4 h-4" />
            </button>
        </div>
      </aside>

      <main className="p-4 md:p-8 max-w-7xl mx-auto">
        {children}
      </main>

      {/* Mobile bottom nav is rendered inside each page component (see Dashboard.jsx BottomNav) */}
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
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
            <Route path="/admin" element={
                <ProtectedRoute>
                    <Layout><AdminDashboard /></Layout>
                </ProtectedRoute>
            } />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
