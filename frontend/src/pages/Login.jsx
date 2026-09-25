import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, LockKeyhole, Mail, Loader2 } from 'lucide-react';
import AuthLayout, { GoogleButton, OrDivider } from '../components/AuthLayout';
import { useOAuthBrowserReset } from '../hooks/useOAuthBrowserReset';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const { login, loginWithGoogle, session } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const accountDeleted = Boolean(location.state?.accountDeleted);
    useOAuthBrowserReset(() => setGoogleLoading(false));

    useEffect(() => {
        if (session) {
            navigate('/dash');
        }
    }, [session, navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        const res = await login(email, password);
        setLoading(false);
        if (!res.success) {
            // Supabase returns "Invalid login credentials" for both wrong
            // passwords AND unconfirmed emails — add a helpful hint.
            const msg = res.message || 'Login failed';
            if (msg.toLowerCase().includes('invalid login credentials')) {
                setError('Invalid login credentials. If you just signed up, check your email for a confirmation link first.');
            } else {
                setError(msg);
            }
        }
    };

    const handleGoogleLogin = async () => {
        setError('');
        setGoogleLoading(true);
        const res = await loginWithGoogle();
        if (res.cancelled) {
            // The user closed Google's account picker: stay here, no error.
            setGoogleLoading(false);
            return;
        }
        if (!res.success) {
            setError(res.message || 'Google login failed');
            setGoogleLoading(false);
        }
        // On success: Android signs in natively (the session change routes to
        // the app); the web and the Android fallback continue in the browser.
        if (res.native) setGoogleLoading(false);
    };

    return (
        <AuthLayout eyebrow="WELCOME BACK">
            <div className="flex flex-col gap-5" aria-labelledby="login-title">
                {/* Header */}
                <h1 id="login-title" className="text-xl font-extrabold tracking-tight">Sign in</h1>

                {accountDeleted && !error && (
                    <div className="rounded-xl border border-lime-400/30 bg-lime-400/10 p-3 text-center text-sm text-lime-200" role="status">
                        Your account and data have been deleted.
                    </div>
                )}

                {/* Error alert */}
                {error && (
                    <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-center text-sm text-rose-200" role="alert">
                        {error}
                    </div>
                )}

                {/* Email form */}
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div>
                        <label htmlFor="email" className="mb-2 block text-sm font-semibold text-zinc-300">Email</label>
                        <div className="relative">
                            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                            <input
                                id="email"
                                type="email"
                                autoComplete="email"
                                placeholder="you@example.com"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="h-12 w-full rounded-xl border border-white/10 bg-black/30 pl-11 pr-4 text-sm text-white placeholder:text-zinc-600 transition focus:border-lime-400 focus:bg-black/50 focus:outline-none focus:ring-4 focus:ring-lime-400/10"
                            />
                        </div>
                    </div>
                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <label htmlFor="password" className="block text-sm font-semibold text-zinc-300">Password</label>
                            <Link to="/forgot-password" className="-my-3 inline-flex min-h-[44px] items-center text-xs font-semibold text-lime-300 hover:underline">Forgot password?</Link>
                        </div>
                        <div className="relative">
                            <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                            <input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="current-password"
                                placeholder="Enter your password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="h-12 w-full rounded-xl border border-white/10 bg-black/30 pl-11 pr-12 text-sm text-white placeholder:text-zinc-600 transition focus:border-lime-400 focus:bg-black/50 focus:outline-none focus:ring-4 focus:ring-lime-400/10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-zinc-500 transition hover:text-lime-300"
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={loading || googleLoading}
                        className="v-press mt-1 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-lime-400 text-[15px] font-extrabold text-black transition hover:bg-lime-300 focus:outline-none focus:ring-4 focus:ring-lime-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {loading ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
                        ) : 'Continue'}
                    </button>
                </form>

                <OrDivider />
                <GoogleButton onClick={handleGoogleLogin} loading={googleLoading} disabled={loading} />

                <p className="text-center text-sm text-zinc-400">
                    New to Vittova? <Link to="/signup" className="inline-flex min-h-[44px] items-center font-bold text-lime-300 hover:text-lime-200 hover:underline focus:outline-none focus:underline">Create an account</Link>
                </p>
            </div>
        </AuthLayout>
    );
}
