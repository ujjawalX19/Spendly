import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import { useAuth } from '../contexts/AuthContext';
import { authErrorFromUrl } from '../lib/authRedirects';
import { appHandoff } from '../lib/appHandoff';
import { hadPkceVerifierAtLoad } from '../lib/supabaseClient';

/**
 * Return URL for Google sign-in and signup email confirmation.
 *
 * Website: supabase-js exchanges the `?code=` automatically on page load (PKCE).
 *
 * Android app: the sign-in ran in a Chrome Custom Tab, which lands here with
 * a code this browser cannot use (the verifier is inside the app). The page
 * passes the code to the app at once, and offers a button in case the browser
 * wants a tap before opening an app.
 */
export default function AuthCallback() {
    const [handoff] = useState(() => appHandoff(window.location.href, {
        hasVerifier: hadPkceVerifierAtLoad,
        userAgent: navigator.userAgent,
    }));

    if (handoff) return <AppHandoff intentUrl={handoff.intentUrl} />;
    return <WebCallback />;
}

function AppHandoff({ intentUrl }) {
    useEffect(() => {
        window.location.replace(intentUrl);
    }, [intentUrl]);

    return (
        <AuthLayout eyebrow="SIGNING IN">
            <div className="flex flex-col gap-6 text-center">
                <h1 className="text-3xl font-extrabold tracking-tight">Opening Vittova…</h1>
                <p className="text-sm text-zinc-400">If the app doesn't open by itself, tap the button below.</p>
                <a href={intentUrl} className="inline-flex h-12 items-center justify-center rounded-xl bg-lime-400 text-sm font-extrabold text-black">Open Vittova</a>
            </div>
        </AuthLayout>
    );
}

function WebCallback() {
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
