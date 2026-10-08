import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LockKeyhole, Loader2, CheckCircle2 } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import { useAuth } from '../contexts/AuthContext';
import { authErrorFromUrl } from '../lib/authRedirects';

const MIN_LENGTH = 8;

/**
 * Set a new password after following a reset link.
 *
 * Reached with a recovery session: on the web supabase-js exchanges the link's
 * `?code=` on page load (the URL marks the recovery, see
 * lib/authRedirects.isPasswordRecoveryUrl); on Android DeepLinkHandler
 * exchanges it and marks recovery. Without a recovery session (expired link,
 * link already used, or opened on another device) the form is not shown.
 */
export default function ResetPassword() {
    const { session, loading, passwordRecovery, updatePassword, logout } = useAuth();
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [show, setShow] = useState(false);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [done, setDone] = useState(false);
    const [linkError] = useState(() => (typeof window !== 'undefined' ? authErrorFromUrl(window.location.href) : null));

    // Give the web code exchange a moment before declaring the link invalid.
    const [waited, setWaited] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setWaited(true), 2500);
        return () => clearTimeout(t);
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (password.length < MIN_LENGTH) {
            setError(`Use at least ${MIN_LENGTH} characters.`);
            return;
        }
        if (password !== confirm) {
            setError('The two passwords do not match.');
            return;
        }
        setSaving(true);
        const res = await updatePassword(password);
        setSaving(false);
        if (!res.success) {
            setError(/should be different|same as/i.test(res.message)
                ? 'Choose a password different from your current one.'
                : res.message || 'We could not update your password. Please request a new link.');
            return;
        }
        setDone(true);
    };

    if (done) {
        return (
            <AuthLayout eyebrow="PASSWORD UPDATED">
                <div className="flex flex-col gap-5">
                    <div>
                        <CheckCircle2 className="h-6 w-6 text-accent" aria-hidden="true" />
                        <h1 className="mt-3 text-2xl font-bold">Password changed</h1>
                        <p className="mt-2 text-sm text-ink-2">Use your new password next time you sign in.</p>
                    </div>
                    <button type="button" onClick={() => navigate('/dash', { replace: true })} className="v-press v-btn-primary w-full">
                        Continue to Vittova
                    </button>
                </div>
            </AuthLayout>
        );
    }

    const hasRecoverySession = Boolean(session) && passwordRecovery;

    if (linkError || (!loading && waited && !hasRecoverySession)) {
        return (
            <AuthLayout eyebrow="LINK NOT VALID">
                <div className="flex flex-col gap-5">
                    <h1 className="text-2xl font-bold">This reset link can't be used</h1>
                    <p className="text-sm leading-6 text-ink-2">
                        {linkError || 'It may have expired, been used already, or been opened on a different device from the one that requested it.'}
                    </p>
                    <Link to="/forgot-password" className="v-press v-btn-primary w-full">
                        Request a new link
                    </Link>
                    <Link to="/login" className="inline-flex min-h-[44px] items-center self-center text-sm text-ink-2 underline">Back to sign in</Link>
                </div>
            </AuthLayout>
        );
    }

    if (!hasRecoverySession) {
        return (
            <AuthLayout eyebrow="RESET PASSWORD">
                <div className="flex items-center justify-center py-10" role="status">
                    <Loader2 className="h-6 w-6 animate-spin text-ink-2" />
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout eyebrow="RESET PASSWORD">
            <div className="flex flex-col gap-6">
                <div>
                    <h1 className="text-2xl font-bold">Choose a new password</h1>
                    <p className="mt-2 text-sm text-ink-2">At least {MIN_LENGTH} characters. Avoid reusing a password from another site.</p>
                </div>

                {error && (
                    <div className="v-error" role="alert">{error}</div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    {[['new-password', 'New password', password, setPassword], ['confirm-password', 'Confirm new password', confirm, setConfirm]].map(([id, label, value, setter]) => (
                        <div key={id}>
                            <label htmlFor={id} className="v-field-label">{label}</label>
                            <div className="relative">
                                <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
                                <input
                                    id={id}
                                    type={show ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    required
                                    minLength={MIN_LENGTH}
                                    value={value}
                                    onChange={(e) => setter(e.target.value)}
                                    className="v-input pl-11 pr-12"
                                />
                                {id === 'new-password' && (
                                    <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-ink-3">
                                        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    <button type="submit" disabled={saving} className="v-press v-btn-primary w-full">
                        {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Update password'}
                    </button>
                </form>

                <button type="button" onClick={async () => { await logout(); navigate('/login', { replace: true }); }} className="min-h-[44px] text-sm text-ink-2 underline">
                    Cancel and sign out
                </button>
            </div>
        </AuthLayout>
    );
}
