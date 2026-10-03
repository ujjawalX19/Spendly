import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, MailCheck, Loader2, ArrowLeft } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import { useAuth } from '../contexts/AuthContext';
import EmailCodeForm from '../components/EmailCodeForm';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Forgot password → Supabase sends a reset email → the code in it is typed
 * here (no browser), or its link opens /reset-password (web) or
 * spendly://reset-password (Android). Either way the set-password form is next.
 *
 * The confirmation is identical whether or not the address has an account,
 * so this screen cannot be used to find out who uses Vittova.
 */
export default function ForgotPassword() {
    const { requestPasswordReset, confirmEmailCode } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [sent, setSent] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const trimmed = email.trim();
        if (!EMAIL_RE.test(trimmed)) {
            setError('Please enter a valid email address.');
            return;
        }
        setLoading(true);
        const res = await requestPasswordReset(trimmed);
        setLoading(false);
        if (res.success) setSent(true);
        else setError(res.message);
    };

    if (sent) {
        return (
            <AuthLayout eyebrow="CHECK YOUR EMAIL">
                <div className="flex flex-col items-center gap-6 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-lime-400/20 bg-lime-400/10">
                        <MailCheck className="h-8 w-8 text-lime-300" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight">Check your inbox</h1>
                        <p className="mt-3 text-sm leading-6 text-zinc-400">
                            If an account exists for <strong className="text-zinc-100">{email.trim()}</strong>, we've sent an email to reset your password.
                            Enter the code from it. It expires after a short time and can be used once.
                        </p>
                    </div>
                    <EmailCodeForm
                        submitLabel="Continue"
                        onVerify={async (code) => {
                            const res = await confirmEmailCode(email.trim(), code, 'recovery');
                            if (res.success) navigate('/reset-password', { replace: true });
                            return res;
                        }}
                        onResend={() => requestPasswordReset(email.trim())}
                    />
                    <p className="text-xs leading-5 text-zinc-500">
                        No code in the email? Open the link in it on this device instead.
                    </p>
                    <Link to="/login" className="inline-flex min-h-[44px] items-center text-sm text-zinc-400 underline">
                        Back to sign in
                    </Link>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout eyebrow="RESET PASSWORD">
            <div className="flex flex-col gap-6">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Forgot your password?</h1>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">Enter the email you signed up with and we'll send you a reset code.</p>
                </div>

                {error && (
                    <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-center text-sm text-rose-200" role="alert">{error}</div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
                    <div>
                        <label htmlFor="reset-email" className="mb-2 block text-sm font-semibold text-zinc-300">Email address</label>
                        <div className="relative">
                            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                            <input
                                id="reset-email"
                                type="email"
                                autoComplete="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                className="h-12 w-full rounded-xl border border-white/10 bg-black/30 pl-11 pr-4 text-sm text-white placeholder:text-zinc-600 focus:border-lime-400 focus:outline-none focus:ring-4 focus:ring-lime-400/10"
                            />
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-lime-400 text-sm font-extrabold text-black disabled:opacity-50"
                    >
                        {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : 'Send reset code'}
                    </button>
                </form>

                <Link to="/login" className="inline-flex items-center justify-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200">
                    <ArrowLeft className="h-4 w-4" /> Back to sign in
                </Link>
            </div>
        </AuthLayout>
    );
}
