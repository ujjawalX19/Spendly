import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, LockKeyhole, Mail, MailCheck, UserRound, Wallet } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';

export default function Signup() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [confirmationSent, setConfirmationSent] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const { signup, session } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (session) {
            navigate('/dash');
        }
    }, [session, navigate]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const res = await signup(name, email, password);
        // Do not navigate immediately; wait for session useEffect to trigger
        if (res.needsConfirmation) {
            // Email confirmation required — show the success message
            setConfirmationSent(true);
        } else {
            setError(res.message || 'Signup failed');
        }
    };

    // ── Confirmation Success Screen ──
    if (confirmationSent) {
        return (
            <AuthLayout eyebrow="ALMOST THERE">
                <div className="text-center">
                    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-lime-400/20 bg-lime-400/10">
                        <MailCheck className="w-8 h-8 text-lime-300" />
                    </div>
                    <p className="text-xs font-bold tracking-[.18em] text-lime-300">ONE MORE STEP</p>
                    <h2 className="mb-3 mt-3 text-3xl font-extrabold tracking-tight">Check your inbox.</h2>
                    <p className="mb-7 text-sm leading-6 text-zinc-400">
                        We sent a confirmation link to <strong className="text-zinc-100">{email}</strong>.
                        Click the link to activate your account, then come back and log in.
                    </p>
                    <Link
                        to="/login"
                        className="inline-block w-full rounded-xl bg-lime-400 py-3.5 text-sm font-extrabold text-black transition hover:bg-lime-300"
                    >
                        Go to Login
                    </Link>
                    <p className="mt-4 text-xs leading-5 text-zinc-500">
                        Didn't get it? Check your spam folder or try signing up again.
                    </p>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout eyebrow="START SMARTER">
            <section aria-labelledby="signup-title">
                <div className="mb-8">
                    <p className="text-xs font-bold tracking-[.18em] text-lime-300">START SMARTER</p>
                    <h1 id="signup-title" className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Make money feel easy.</h1>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">Create your free account and take control in minutes.</p>
                </div>

                {error && (
                    <div className="mb-5 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-center text-sm text-rose-200">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="name" className="mb-2 block text-sm font-semibold text-zinc-300">Your name</label>
                        <div className="relative"><UserRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                        <input 
                            id="name"
                            type="text" 
                            required 
                            value={name} 
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Aanya Sharma"
                            className="w-full rounded-xl border border-white/10 bg-black/30 py-3 pl-11 pr-4 text-sm text-white placeholder:text-zinc-600 transition focus:border-lime-400 focus:bg-black/50 focus:outline-none focus:ring-4 focus:ring-lime-400/10"
                        /></div>
                    </div>
                    <div>
                        <label htmlFor="email" className="mb-2 block text-sm font-semibold text-zinc-300">Email address</label>
                        <div className="relative"><Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                        <input 
                            id="email"
                            type="email" 
                            required 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="w-full rounded-xl border border-white/10 bg-black/30 py-3 pl-11 pr-4 text-sm text-white placeholder:text-zinc-600 transition focus:border-lime-400 focus:bg-black/50 focus:outline-none focus:ring-4 focus:ring-lime-400/10"
                        /></div>
                    </div>
                    <div>
                        <label htmlFor="password" className="mb-2 block text-sm font-semibold text-zinc-300">Create a password</label>
                        <div className="relative"><LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                        <input 
                            id="password"
                            type={showPassword ? 'text' : 'password'} 
                            required 
                            minLength={6}
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="At least 6 characters"
                            className="w-full rounded-xl border border-white/10 bg-black/30 py-3 pl-11 pr-12 text-sm text-white placeholder:text-zinc-600 transition focus:border-lime-400 focus:bg-black/50 focus:outline-none focus:ring-4 focus:ring-lime-400/10"
                        /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1.5 text-zinc-500 transition hover:text-lime-300" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
                    </div>
                    <button 
                        type="submit" 
                        className="mt-3 w-full rounded-xl bg-lime-400 py-3.5 text-sm font-extrabold text-black shadow-lg shadow-lime-400/15 transition hover:-translate-y-0.5 hover:bg-lime-300 hover:shadow-lime-400/25 focus:outline-none focus:ring-4 focus:ring-lime-400/20"
                    >
                        Sign Up
                    </button>
                </form>

                <p className="mt-7 text-center text-sm text-zinc-400">
                    Already using Spendly? <Link to="/login" className="font-bold text-lime-300 hover:text-lime-200 hover:underline">Log in</Link>
                </p>
            </section>
        </AuthLayout>
    );
}

