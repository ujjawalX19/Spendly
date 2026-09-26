/**
 * Sponsored money challenges (Vittova Pro, behind a server flag).
 *
 * Every card is labelled as a sponsored promotion and kept apart from
 * Vittova's own insights. Rewards are fixed vouchers, disclosed with their
 * limits before joining. Vittova checks completion from the user's own
 * records; the sponsor never sees them. Data: /api/challenges.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Gift, Loader2, Megaphone, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePro } from '../contexts/ProContext';
import { apiJson } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';
import { track } from '../lib/telemetry';
import { formatDay } from '../lib/auditDisplay';
import { Skeleton } from '../components/ui';

const STATUS = {
  active: 'In progress',
  completed: 'Completed',
  failed: 'Not completed',
  withdrawn: 'Left',
};

function RewardDialog({ reward, onClose }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="reward-title">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-t-3xl border border-zinc-800 bg-zinc-900 p-6 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="reward-title" className="text-lg font-bold">Your reward</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl bg-zinc-800 p-2"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-sm text-zinc-300">{reward.reward}{reward.sponsor ? ` from ${reward.sponsor}` : ''}</p>
        <p className="mt-3 select-all rounded-xl border border-lime-400/30 bg-lime-400/10 p-3 text-center font-mono text-lg font-black tracking-wider text-lime-200">{reward.code}</p>
        <p className="mt-2 text-xs text-zinc-500">Redemption id: {reward.redemptionId}</p>
        {reward.voucherExpiry && <p className={`mt-1 text-xs ${reward.expired ? 'text-rose-300' : 'text-zinc-400'}`}>{reward.expired ? 'Expired on' : 'Use by'} {formatDay(reward.voucherExpiry)}</p>}
        <details className="mt-3 text-xs text-zinc-400"><summary className="cursor-pointer font-semibold">Terms</summary><p className="mt-1 whitespace-pre-line">{reward.terms}</p></details>
      </div>
    </div>
  );
}

function ChallengeCard({ c, onJoin, onLeave, onReveal, busy }) {
  const [confirming, setConfirming] = useState(false);
  const e = c.enrollment;
  return (
    <li className="overflow-hidden rounded-2xl border border-amber-400/30 bg-zinc-900">
      <p className="flex items-center gap-1.5 bg-amber-400/10 px-4 py-1.5 text-[11px] font-black uppercase tracking-wider text-amber-300">
        <Megaphone className="h-3.5 w-3.5" /> {c.disclosure}
      </p>
      <div className="p-4">
        <h3 className="font-bold text-white">{c.title}</h3>
        <p className="mt-1 text-sm text-zinc-300">{c.rule}</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div><dt className="text-zinc-500">Reward</dt><dd className="font-bold text-lime-300">{c.reward.label}</dd></div>
          <div><dt className="text-zinc-500">Duration</dt><dd className="text-zinc-200">{c.days} days, from the day after you join</dd></div>
          <div><dt className="text-zinc-500">Rewards left</dt><dd className="text-zinc-200">{c.availability.soldOut ? 'None left' : `${c.availability.remaining}, while stocks last`}</dd></div>
          <div><dt className="text-zinc-500">Open until</dt><dd className="text-zinc-200">{new Date(c.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</dd></div>
          {c.reward.voucherExpiry && <div className="col-span-2"><dt className="text-zinc-500">Voucher use-by</dt><dd className="text-zinc-200">{formatDay(c.reward.voucherExpiry)}</dd></div>}
        </dl>
        <details className="mt-3 text-xs text-zinc-400">
          <summary className="cursor-pointer font-semibold">Eligibility and terms</summary>
          <p className="mt-1">{c.eligibility}</p>
          <p className="mt-1 whitespace-pre-line">{c.terms}</p>
        </details>

        {e ? (
          <div className="mt-3 rounded-xl border border-zinc-800 bg-black/30 p-3 text-xs">
            <p className="font-bold text-zinc-200">{STATUS[e.status]}{e.status === 'active' && e.day ? ` · day ${e.day} of ${c.days}` : ''}</p>
            {e.status === 'active' && <p className="mt-1 text-zinc-400">Logged on {e.activeDays} of the {e.activeNeeded} days needed. Result on {formatDay(e.judgeOn)}.</p>}
            {e.reason && e.status === 'failed' && <p className="mt-1 text-zinc-400">{e.reason}</p>}
            {e.status === 'completed' && e.reward?.issued && (
              <button type="button" disabled={busy} onClick={() => onReveal(e.id)} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-lime-400 px-3 py-2 font-black text-black"><Gift className="h-3.5 w-3.5" /> {e.reward.revealed ? 'Show voucher' : 'Reveal voucher'}</button>
            )}
            {e.status === 'completed' && e.reward?.soldOut && <p className="mt-1 text-amber-200">Well done! All rewards had already been given out when you finished.</p>}
            {e.status === 'active' && <button type="button" disabled={busy} onClick={() => onLeave(c.id)} className="mt-2 text-zinc-400 underline">Leave challenge</button>}
          </div>
        ) : confirming ? (
          <div className="mt-3 rounded-xl border border-zinc-700 bg-black/30 p-3 text-xs text-zinc-300">
            <p>By joining you accept the terms above. It's free. Vittova checks the rule from your own records; {c.sponsor} only learns if a reward is issued.</p>
            <div className="mt-2 flex gap-2">
              <button type="button" disabled={busy} onClick={() => onJoin(c.id)} className="rounded-lg bg-lime-400 px-3 py-2 font-black text-black">Join challenge</button>
              <button type="button" onClick={() => setConfirming(false)} className="rounded-lg border border-zinc-700 px-3 py-2 font-bold">Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" disabled={busy || c.availability.soldOut} onClick={() => setConfirming(true)} className="mt-3 w-full rounded-xl border border-zinc-700 bg-zinc-800 py-2.5 text-sm font-bold text-zinc-100 disabled:opacity-50">
            {c.availability.soldOut ? 'All rewards given out' : 'Join (free)'}
          </button>
        )}
      </div>
    </li>
  );
}

export default function Challenges() {
  const { session } = useAuth();
  const { isPro, features } = usePro();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reward, setReward] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const d = await apiJson('/challenges', { session });
      setList(d.challenges);
      for (const c of d.challenges) apiJson(`/challenges/${c.id}/seen`, { session, method: 'POST', body: { kind: 'view' } }).catch(() => {});
    } catch (err) {
      setError(friendlyError(err, "We couldn't load challenges."));
    }
  }, [session]);

  useEffect(() => {
    track('challenge_viewed');
    if (isPro && features.sponsoredChallengesEnabled) load();
  }, [isPro, features.sponsoredChallengesEnabled, load]);

  const act = async (fn) => {
    setBusy(true);
    setError('');
    try { await fn(); await load(); } catch (err) { setError(friendlyError(err, "That didn't work. Please try again.")); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-6 text-white">
      <Link to="/settings" className="-ml-1 inline-flex min-h-[44px] items-center gap-1 px-1 text-sm text-zinc-400"><ArrowLeft className="h-4 w-4" /> Back</Link>
      <header>
        <p className="text-xs font-bold uppercase tracking-widest text-amber-300">Sponsored</p>
        <h1 className="mt-1 text-2xl font-black">Money challenges</h1>
        <p className="mt-1 text-sm text-zinc-400">Optional challenges from sponsors that reward spending carefully. They are promotions, not Vittova advice.</p>
        <p className="mt-2 flex items-start gap-2 text-xs text-zinc-500"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-lime-400" /> Sponsors never see your transactions, balances, categories or scores.</p>
      </header>

      {!features.sponsoredChallengesEnabled ? (
        <p className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400">No sponsored challenges are running right now.</p>
      ) : !isPro ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5 text-sm text-zinc-300">Sponsored challenges are part of Vittova Pro. <Link to="/pro" className="font-bold text-amber-300 underline">See Pro</Link></div>
      ) : (
        <>
          {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
          {!list && !error && <div className="space-y-3" aria-busy="true" aria-label="Loading challenges">{[0, 1].map((i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}</div>}
          {list && !list.length && <p className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400">No sponsored challenges are running right now.</p>}
          {list && list.length > 0 && (
            <ul className="space-y-4">
              {list.map((c) => (
                <ChallengeCard key={c.id} c={c} busy={busy}
                  onJoin={(id) => act(() => apiJson(`/challenges/${id}/join`, { session, method: 'POST', body: {} }))}
                  onLeave={(id) => act(() => apiJson(`/challenges/${id}/leave`, { session, method: 'POST', body: {} }))}
                  onReveal={(id) => act(async () => setReward((await apiJson(`/challenges/rewards/${id}/reveal`, { session, method: 'POST', body: {} })).reward))} />
              ))}
            </ul>
          )}
        </>
      )}
      {reward && <RewardDialog reward={reward} onClose={() => setReward(null)} />}
    </div>
  );
}
