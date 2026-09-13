import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import { useAuth } from '../contexts/AuthContext';
import { authErrorFromUrl } from '../lib/authRedirects';

/**
 * Web return URL for Google sign-in and signup email confirmation.
 * supabase-js exchanges the `?code=` automatically on page load (PKCE).
 * The Android app uses spendly://login-callback instead.
 */
export default function AuthCallback() {
    const { session, loading } = useAuth();
    const [linkError] = useState(() => authErrorFromUrl(window.location.href));
    const [timedOut, setTimedOut] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setTimedOut(true), 8000);
        return () => clearTimeout(t);
    }, []);

    if (session) return <Navigate to="/dash" replace />;

    if (linkError || (timedOut && !loading)) {
        return (
            <AuthLayout eyebrow="SIGN-IN PROBLEM">
                <div className="flex flex-col gap-6 text-center">
                    <h1 className="text-3xl font-extrabold tracking-tight">We couldn't sign you in</h1>
                    <p className="text-sm text-zinc-400">
                        {linkError || 'The link may have expired, been used already, or been opened in a different browser from the one you started in.'}
                    </p>
                    <Link to="/login" className="inline-flex h-12 items-center justify-center rounded-xl bg-lime-400 text-sm font-extrabold text-black">Back to sign in</Link>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout eyebrow="SIGNING IN">
            <div className="flex items-center justify-center gap-3 py-10 text-zinc-400" role="status">
                <Loader2 className="h-5 w-5 animate-spin text-lime-300" /> Finishing sign-in…
            </div>
        </AuthLayout>
    );
}
