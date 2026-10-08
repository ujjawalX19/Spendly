import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, LockKeyhole, Mail, MailCheck, UserRound, Loader2 } from 'lucide-react';
import AuthLayout, { GoogleButton, OrDivider } from '../components/AuthLayout';
import { MONTHS, yearOptions, toBirthYearMonth, ageFrom, ADULT_AGE, rememberPendingAge } from '../lib/age';
import { useOAuthBrowserReset } from '../hooks/useOAuthBrowserReset';
import EmailCodeForm from '../components/EmailCodeForm';

export default function Signup() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [confirmationSent, setConfirmationSent] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [birthMonth, setBirthMonth] = useState('');
    const [birthYear, setBirthYear] = useState('');
    const [underAge, setUnderAge] = useState(false);
    const { signup, loginWithGoogle, session, confirmEmailCode, resendSignupEmail } = useAuth();
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
        const birthYearMonth = toBirthYearMonth(birthYear, birthMonth);
        if (!birthYearMonth) { setError('Choose your month and year of birth.'); return; }
        if (ageFrom(birthYearMonth) < ADULT_AGE) { setUnderAge(true); return; }
        rememberPendingAge(birthYearMonth);
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
            // The user closed Google's sheet: stay here, no error.
            setGoogleLoading(false);
            return;
        }
        if (res.native) setGoogleLoading(false);
        if (!res.success) {
            setError(res.message || 'Google signup failed');
            setGoogleLoading(false);
        }
    };

    // ── Confirmation Success Screen ──
    if (confirmationSent) {
        return (
            <AuthLayout eyebrow="ALMOST THERE">
                <div className="flex flex-col gap-5">
                    <div>
                        <MailCheck className="h-6 w-6 text-ink-2" aria-hidden="true" />
                        <h2 className="mt-3 text-2xl font-bold leading-tight">Check your inbox</h2>
                        <p className="mt-2 text-sm leading-6 text-ink-2">
                            We sent an email to <strong className="font-semibold text-ink">{email}</strong>.
                            Enter the code from it to activate your account.
                        </p>
                    </div>
                    {/* A confirmed code signs the person in; the effect above then opens the app. */}
                    <EmailCodeForm
                        submitLabel="Activate account"
                        onVerify={(code) => confirmEmailCode(email.trim(), code, 'signup')}
                        onResend={() => resendSignupEmail(email.trim())}
                    />
                    <p className="text-xs leading-5 text-ink-3">
                        No code in the email? Open the link in it on this device instead. Not there at all? Check your spam folder.
                    </p>
                    <Link to="/login" className="inline-flex min-h-[44px] items-center self-center text-sm text-ink-2 underline">
                        Back to sign in
                    </Link>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout eyebrow="START SMARTER">
            <div className="flex flex-col gap-5" aria-labelledby="signup-title">
                <div>
                    <h1 id="signup-title" className="text-2xl font-bold">Create your account</h1>
                    <p className="mt-1 text-sm text-ink-2">Free. Takes under a minute.</p>
                </div>

                {/* Error alert */}
                {error && (
                    <div className="v-error" role="alert">
                        {error}
                    </div>
                )}

                {/* Email form */}
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div>
                        <label htmlFor="name" className="v-field-label">Your name</label>
                        <div className="relative">
                            <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                            <input
                                id="name"
                                type="text"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Aanya Sharma"
                                className="v-input pl-11"
                            />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="email" className="v-field-label">Email</label>
                        <div className="relative">
                            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                            <input
                                id="email"
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                className="v-input pl-11"
                            />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="password" className="v-field-label">Create a password</label>
                        <div className="relative">
                            <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                            <input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                required
                                minLength={8}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="At least 8 characters"
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
                    <fieldset>
                    <legend className="v-field-label">Month and year of birth</legend>
                    <div className="grid grid-cols-2 gap-3">
                        <select aria-label="Birth month" value={birthMonth} onChange={(e) => { setBirthMonth(e.target.value); setUnderAge(false); }} required
                            className={`v-input px-3 ${birthMonth ? '' : 'text-ink-3'}`}>
                            <option value="" disabled>Month</option>
                            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                        </select>
                        <select aria-label="Birth year" value={birthYear} onChange={(e) => { setBirthYear(e.target.value); setUnderAge(false); }} required
                            className={`v-input px-3 ${birthYear ? '' : 'text-ink-3'}`}>
                            <option value="" disabled>Year</option>
                            {yearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <p className="mt-1.5 text-xs text-ink-3">We keep only the month and year.</p>
                </fieldset>
                {underAge && (
                    <p role="alert" className="rounded-xl bg-surface px-3 py-2.5 text-sm text-ink-soft">
                        Vittova is for people aged 18 and over for now, so we can&apos;t create an account for you yet. Nothing has been saved.
                    </p>
                )}
                <button
                        type="submit"
                        disabled={loading || googleLoading}
                        className="v-press v-btn-primary mt-1 w-full disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Creating account…</>
                        ) : 'Create account'}
                    </button>
                </form>

                <OrDivider />
                <GoogleButton onClick={handleGoogleLogin} loading={googleLoading} disabled={loading} />

                <p className="text-center text-xs leading-5 text-ink-3">
                    By continuing you agree to the <Link to="/terms" className="underline hover:text-ink">Terms of Service</Link> and
                    acknowledge the <Link to="/privacy" className="underline hover:text-ink">Privacy Policy</Link>.
                </p>

                <p className="text-center text-sm text-ink-2">
                    Already using Vittova? <Link to="/login" className="inline-flex min-h-[44px] items-center font-semibold text-ink underline">Log in</Link>
                </p>
            </div>
        </AuthLayout>
    );
}
