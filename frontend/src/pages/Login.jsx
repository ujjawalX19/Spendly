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
        <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[var(--color-bg)]">
            <div className="w-full max-w-md p-8 glass-card border border-[var(--color-neon-green)]/30">
                <div className="flex flex-col items-center mb-8">
                    <Wallet className="w-12 h-12 text-[var(--color-neon-green)] mb-2" />
                    <h1 className="text-3xl font-extrabold text-[var(--color-neon-green)]">Spendly</h1>
                    <p className="text-[var(--color-text)]/70 text-sm mt-1">Welcome back, dost!</p>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-[var(--color-text)]/80 mb-1">Email</label>
                        <input 
                            type="email" 
                            required 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-[var(--input-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-3 outline-none focus:border-[var(--color-neon-green)] transition-colors"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[var(--color-text)]/80 mb-1">Password</label>
                        <input 
                            type="password" 
                            required 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-[var(--input-bg)] border border-[var(--glass-border)] rounded-xl px-4 py-3 outline-none focus:border-[var(--color-neon-green)] transition-colors"
                        />
                    </div>
                    <button 
                        type="submit" 
                        disabled={loading}
                        className="w-full bg-[var(--color-neon-green)] text-black font-extrabold py-3 rounded-xl mt-4 hover:scale-[1.02] active:scale-95 transition-transform disabled:opacity-50"
                    >
                        {loading ? 'Logging in...' : 'Login'}
                    </button>
                </form>

                {/* Google OAuth */}
                <div className="mt-4">
                    <div className="relative flex items-center gap-4 my-4">
                        <div className="flex-1 h-px bg-[var(--glass-border)]" />
                        <span className="text-xs text-[var(--color-text)]/50 font-medium">OR</span>
                        <div className="flex-1 h-px bg-[var(--glass-border)]" />
                    </div>
                    <button
                        onClick={handleGoogleLogin}
                        className="w-full bg-white/5 border border-[var(--glass-border)] text-[var(--color-text)] font-bold py-3 rounded-xl hover:bg-white/10 transition-colors flex items-center justify-center gap-2 text-sm"
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

                <p className="mt-6 text-center text-sm text-[var(--color-text)]/60">
                    Don't have an account? <Link to="/signup" className="text-[var(--color-neon-green)] font-bold hover:underline">Sign up</Link>
                </p>
            </div>
        </div>
    );
}
