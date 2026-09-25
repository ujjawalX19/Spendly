import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, LockKeyhole, Mail, MailCheck, UserRound, Loader2 } from 'lucide-react';
import AuthLayout, { GoogleButton, OrDivider } from '../components/AuthLayout';
import { useOAuthBrowserReset } from '../hooks/useOAuthBrowserReset';

export default function Signup() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [confirmationSent, setConfirmationSent] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const { signup, loginWithGoogle, session } = useAuth();
    const navigate = useNavigate();
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
        const res = await signup(name, email, password);
        setLoading(false);
        if (!res.success) {
            setError(res.message || 'Signup failed');
        } else if (res.needsConfirmation) {
            setConfirmationSent(true);
        }
        // Otherwise a session now exists and the effect above navigates.
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
            setError(res.message || 'Google signup failed');
            setGoogleLoading(false);
        }
    };

    // ── Confirmation Success Screen ──
    if (confirmationSent) {
        return (
            <AuthLayout eyebrow="ALMOST THERE">
                <div className="flex flex-col items-center gap-6 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-lime-400/20 bg-lime-400/10">
                        <MailCheck className="w-8 h-8 text-lime-300" />
                    </div>
                    <div>
                        <p className="text-xs font-bold tracking-wider uppercase text-lime-300">ONE MORE STEP</p>
                        <h2 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight">Check your inbox.</h2>
                        <p className="mt-3 text-sm leading-6 text-zinc-400">
                            We sent a confirmation link to <strong className="text-zinc-100">{email}</strong>.
                            Open the link on this device to activate your account.
                        </p>
                    </div>
                    <Link
                        to="/login"
                        className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-lime-400 text-sm font-extrabold text-black transition hover:bg-lime-300"
                    >
                        Go to Login
                    </Link>
                    <p className="text-xs leading-5 text-zinc-500">
                        Didn't get it? Check your spam folder or try signing up again.
                    </p>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout eyebrow="START SMARTER">
            <div className="flex flex-col gap-5" aria-labelledby="signup-title">
                <div>
                    <h1 id="signup-title" className="text-xl font-extrabold tracking-tight">Create your account</h1>
                    <p className="mt-1 text-sm text-zinc-400">Free. Takes under a minute.</p>
                </div>

                {/* Error alert */}
                {error && (
                    <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-center text-sm text-rose-200" role="alert">
                        {error}
                    </div>
                )}

                {/* Email form */}
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div>
                        <label htmlFor="name" className="mb-2 block text-sm font-semibold text-zinc-300">Your name</label>
                        <div className="relative">
                            <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                            <input
                                id="name"
                                type="text"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Aanya Sharma"
                                className="h-12 w-full rounded-xl border border-white/10 bg-black/30 pl-11 pr-4 text-sm text-white placeholder:text-zinc-600 transition focus:border-lime-400 focus:bg-black/50 focus:outline-none focus:ring-4 focus:ring-lime-400/10"
                            />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="email" className="mb-2 block text-sm font-semibold text-zinc-300">Email</label>
                        <div className="relative">
                            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                            <input
                                id="email"
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                className="h-12 w-full rounded-xl border border-white/10 bg-black/30 pl-11 pr-4 text-sm text-white placeholder:text-zinc-600 transition focus:border-lime-400 focus:bg-black/50 focus:outline-none focus:ring-4 focus:ring-lime-400/10"
                            />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="password" className="mb-2 block text-sm font-semibold text-zinc-300">Create a password</label>
                        <div className="relative">
                            <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                            <input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                required
                                minLength={8}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="At least 8 characters"
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
                            <><Loader2 className="w-4 h-4 animate-spin" /> Creating account…</>
                        ) : 'Create account'}
                    </button>
                </form>

                <OrDivider />
                <GoogleButton onClick={handleGoogleLogin} loading={googleLoading} disabled={loading} />

                <p className="text-center text-xs leading-5 text-zinc-500">
                    By continuing you agree to the <Link to="/terms" className="underline hover:text-zinc-300">Terms of Service</Link> and
                    acknowledge the <Link to="/privacy" className="underline hover:text-zinc-300">Privacy Policy</Link>.
                </p>

                <p className="text-center text-sm text-zinc-400">
                    Already using Vittova? <Link to="/login" className="inline-flex min-h-[44px] items-center font-bold text-lime-300 hover:text-lime-200 hover:underline">Log in</Link>
                </p>
            </div>
        </AuthLayout>
    );
}
