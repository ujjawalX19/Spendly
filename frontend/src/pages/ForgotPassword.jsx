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
                <div className="flex flex-col gap-5">
                    <div>
                        <MailCheck className="h-6 w-6 text-ink-2" aria-hidden="true" />
                        <h1 className="mt-3 text-2xl font-bold leading-tight">Check your inbox</h1>
                        <p className="mt-2 text-sm leading-6 text-ink-2">
                            If an account exists for <strong className="font-semibold text-ink">{email.trim()}</strong>, we've sent an email to reset your password.
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
                    <p className="text-xs leading-5 text-ink-3">
                        No code in the email? Open the link in it on this device instead.
                    </p>
                    <Link to="/login" className="inline-flex min-h-[44px] items-center self-center text-sm text-ink-2 underline">
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
                    <h1 className="text-2xl font-bold">Forgot your password?</h1>
                    <p className="mt-2 text-sm leading-6 text-ink-2">Enter the email you signed up with and we'll send you a reset code.</p>
                </div>

                {error && (
                    <div className="v-error" role="alert">{error}</div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
                    <div>
                        <label htmlFor="reset-email" className="v-field-label">Email address</label>
                        <div className="relative">
                            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                            <input
                                id="reset-email"
                                type="email"
                                autoComplete="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                className="v-input pl-11"
                            />
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="v-press v-btn-primary w-full"
                    >
                        {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : 'Send reset code'}
                    </button>
                </form>

                <Link to="/login" className="inline-flex min-h-[44px] items-center justify-center gap-1.5 text-sm text-ink-2 hover:text-ink">
                    <ArrowLeft className="h-4 w-4" /> Back to sign in
                </Link>
            </div>
        </AuthLayout>
    );
}
