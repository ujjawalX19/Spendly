import { Link } from 'react-router-dom';
import { Users, Clock } from 'lucide-react';

/**
 * Group Pools — deferred.
 *
 * The previous screen let people create a pool and type member names, but the
 * names were only kept in the page's memory (lost on reload), there was no way
 * to invite a real person, add a shared expense, or settle up. Presenting that
 * as a working bill-splitting feature was misleading, so it is marked as coming
 * soon until the invite → accept → split → settle workflow exists end to end.
 *
 * The secured backend routes (routes/groups.js) remain for that future work.
 */
export default function HostelPool() {
    return (
        <div className="flex min-h-[60vh] items-center justify-center px-4">
            <div className="max-w-sm text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-400/10">
                    <Users className="h-8 w-8 text-sky-400" />
                </div>
                <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-bold text-sky-300">
                    <Clock className="h-3.5 w-3.5" /> Coming soon
                </p>
                <h1 className="text-2xl font-black text-white">Group pools</h1>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                    Splitting shared expenses with friends and flatmates isn't ready yet. When it is, you'll be able to invite
                    people, add shared bills and settle up here.
                </p>
                <Link to="/dash" className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-zinc-800 px-5 text-sm font-bold text-zinc-200">
                    Back to dashboard
                </Link>
            </div>
        </div>
    );
}
