import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Wallet } from 'lucide-react';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login, loginWithGoogle } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        const res = await login(email, password);
        setLoading(false);
        if (res.success) {
            navigate('/dash');
        } else {
            setError(res.message || 'Login failed');
        }
    };

    const handleGoogleLogin = async () => {
        setError('');
        const res = await loginWithGoogle();
        if (!res.success) {
            setError(res.message || 'Google login failed');
        }
        // On success, Supabase redirects to Google OAuth â€” no manual navigation needed
    };

    return (
        <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-black p-4 sm:p-6">
            <section className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900/60 p-6 shadow-2xl backdrop-blur-xl sm:p-8" aria-labelledby="login-title">
                <div className="mb-8 flex flex-col items-center text-center">
                    <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10">
                        <Wallet className="h-8 w-8 text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" aria-hidden="true" />
                    </div>
                    <h1 id="login-title" className="text-3xl font-extrabold tracking-tight text-emerald-500">Spendly</h1>
                    <p className="mt-2 text-sm text-gray-400">Welcome back, dost!</p>
                </div>

                {error && (
                    <div className="mb-5 rounded-xl border border-red-500/50 bg-red-500/10 p-3 text-center text-sm text-red-300" role="alert">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="email" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-400">Email</label>
                        <input
                            id="email"
                            type="email"
                            autoComplete="email"
                            placeholder="you@example.com"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full rounded-xl border border-gray-800 bg-black/50 px-4 py-3 text-white placeholder:text-gray-600 transition-all duration-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label htmlFor="password" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-400">Password</label>
                        <input
                            id="password"
                            type="password"
                            autoComplete="current-password"
                            placeholder="Enter your password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full rounded-xl border border-gray-800 bg-black/50 px-4 py-3 text-white placeholder:text-gray-600 transition-all duration-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                        />
                    </div>
                    <button 
                        type="submit" 
                        disabled={loading}
                        className="mt-6 w-full rounded-xl bg-emerald-500 py-3 font-bold text-gray-950 shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all duration-200 hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(16,185,129,0.5)] focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-gray-950 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {loading ? 'Logging in...' : 'Login'}
                    </button>
                </form>

                {/* Google OAuth */}
                <div className="mt-4">
                    <div className="my-5 flex items-center gap-4">
                        <div className="h-px flex-1 bg-gray-800" />
                        <span className="text-xs font-medium tracking-wider text-gray-500">OR</span>
                        <div className="h-px flex-1 bg-gray-800" />
                    </div>
                    <button
                        onClick={handleGoogleLogin}
                        className="mt-4 flex w-full items-center justify-center gap-3 rounded-xl border border-gray-700 bg-gray-800 py-3 font-medium text-white transition-colors hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-950"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        Continue with Google
                    </button>
                </div>

                <p className="mt-6 text-center text-sm text-gray-400">
                    Don't have an account? <Link to="/signup" className="font-bold text-emerald-500 hover:underline focus:outline-none focus:underline">Sign up</Link>
                </p>
            </section>
        </main>
    );
}
