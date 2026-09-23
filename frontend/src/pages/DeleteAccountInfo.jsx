import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { SUPPORT_EMAIL } from '../lib/legal';

/**
 * Public account-deletion page (no sign-in required).
 *
 * Google Play requires a web URL where users can request deletion of their
 * account and data without reinstalling the app. Publish this page's URL in
 * the Play Console Data safety form.
 */
export default function DeleteAccountInfo() {
    return (
        <div className="min-h-screen bg-[#09090b] px-6 py-12 text-zinc-300">
            <div className="mx-auto max-w-2xl">
                <Link to="/" className="mb-8 inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300">
                    <ArrowLeft className="h-4 w-4" /> Vittova
                </Link>
                <h1 className="text-3xl font-black text-white">Delete your Vittova account</h1>
                <p className="mt-3 text-sm text-zinc-500">Applies to the Vittova Android app and web app.</p>

                <section className="mt-8 space-y-3 text-sm leading-7">
                    <h2 className="text-lg font-bold text-white">Option 1 — in the app (immediate)</h2>
                    <ol className="list-decimal space-y-1 pl-5">
                        <li>Open Vittova and sign in.</li>
                        <li>Go to <strong className="text-zinc-100">Settings → Delete account</strong>.</li>
                        <li>Confirm. Your account is deleted straight away and you are signed out on every device.</li>
                    </ol>
                </section>

                <section className="mt-8 space-y-3 text-sm leading-7">
                    <h2 className="text-lg font-bold text-white">Option 2 — by email (if you can't sign in)</h2>
                    <p>
                        Email <a className="text-lime-400 underline" href={`mailto:${SUPPORT_EMAIL}?subject=Delete%20my%20Vittova%20account`}>{SUPPORT_EMAIL}</a> from
                        the address registered to your account, with the subject "Delete my Vittova account". We will verify the request
                        comes from the account holder and complete deletion within 30 days, then confirm by email.
                    </p>
                </section>

                <section className="mt-8 space-y-3 text-sm leading-7">
                    <h2 className="text-lg font-bold text-white">What is deleted</h2>
                    <ul className="list-disc space-y-1 pl-5">
                        <li>Your login (email or Google sign-in link) and all active sessions</li>
                        <li>Your profile, budget and savings target</li>
                        <li>All expenses, recurring bills, import history, streak records (including Money Streak and Money XP) and score history</li>
                        <li>Your AI coach conversation history</li>
                        <li>Group pools you created (including entries other members added to them) and your membership of other pools</li>
                    </ul>
                </section>

                <section className="mt-8 space-y-3 text-sm leading-7">
                    <h2 className="text-lg font-bold text-white">What may remain</h2>
                    <ul className="list-disc space-y-1 pl-5">
                        <li>Payment notifications are never stored by Vittova unless you logged them, so nothing remains on our servers from notification access.</li>
                        <li>Encrypted database backups kept by our database provider may contain your data until they expire on their normal rotation schedule; they are not used to restore individual accounts.</li>
                        <li>Server logs contain no expense amounts or notification text, and are retained only for a limited period for security and debugging.</li>
                    </ul>
                </section>

                <p className="mt-10 text-xs text-zinc-600">
                    See also the <Link to="/privacy" className="underline">Privacy Policy</Link>.
                </p>
            </div>
        </div>
    );
}
