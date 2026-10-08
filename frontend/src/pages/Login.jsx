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
            // The user closed Google's sheet: stay here, no error.
            setGoogleLoading(false);
            return;
        }
        if (!res.success) {
            setError(res.message || 'Google login failed');
            setGoogleLoading(false);
        }
        // Signed in inside the app: the session change routes to Home.
        if (res.native) setGoogleLoading(false);
    };

    return (
        <AuthLayout tab="login">
            <div className="flex flex-col gap-5" aria-labelledby="login-title">
                {/* Header */}
                <div>
                    <h1 id="login-title" className="text-xl font-semibold">Welcome back</h1>
                    <p className="mt-1 text-sm text-ink-2">Sign in to see where your money stands.</p>
                </div>

                {accountDeleted && !error && (
                    <div className="rounded-xl bg-surface px-3 py-2.5 text-sm text-ink-soft" role="status">
                        Your account and data have been deleted.
                    </div>
                )}

                {/* Error alert */}
                {error && (
                    <div className="v-error" role="alert">
                        {error}
                    </div>
                )}

                {/* Email form */}
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div>
                        <label htmlFor="email" className="v-field-label">Email</label>
                        <div className="relative">
                            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                            <input
                                id="email"
                                type="email"
                                autoComplete="email"
                                placeholder="you@example.com"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="v-input pl-11"
                            />
                        </div>
                    </div>
                    <div>
                        <div className="mb-1.5 flex items-center justify-between">
                            <label htmlFor="password" className="v-field-label mb-0">Password</label>
                            <Link to="/forgot-password" className="-my-3 inline-flex min-h-[44px] items-center text-[13px] font-medium text-ink-2 hover:underline">Forgot password?</Link>
                        </div>
                        <div className="relative">
                            <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                            <input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="current-password"
                                placeholder="Enter your password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="v-input pl-11 pr-12"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-ink-3 transition hover:text-ink"
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={loading || googleLoading}
                        className="v-press v-btn-primary mt-1 w-full disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
                        ) : 'Continue'}
                    </button>
                </form>

                <OrDivider />
                <GoogleButton onClick={handleGoogleLogin} loading={googleLoading} disabled={loading} />

                <p className="text-center text-sm text-ink-2">
                    New to Vittova? <Link to="/signup" className="inline-flex min-h-[44px] items-center font-semibold text-ink underline">Create an account</Link>
                </p>
            </div>
        </AuthLayout>
    );
}
