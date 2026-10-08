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
import { ArrowLeft, Gift, Megaphone, ShieldCheck, X } from 'lucide-react';
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
      <div className="v-scrim absolute inset-0" onClick={onClose} />
      <div className="v-sheet relative z-10 w-full max-w-md p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="reward-title" className="text-lg font-bold">Your reward</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-2"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-sm text-ink-soft">{reward.reward}{reward.sponsor ? ` from ${reward.sponsor}` : ''}</p>
        <p className="mt-3 select-all rounded-xl bg-surface-2 p-3 text-center font-mono text-lg font-bold tracking-wider text-ink">{reward.code}</p>
        <p className="mt-2 text-xs text-ink-3">Redemption id: {reward.redemptionId}</p>
        {reward.voucherExpiry && <p className={`mt-1 text-xs ${reward.expired ? 'text-danger' : 'text-ink-2'}`}>{reward.expired ? 'Expired on' : 'Use by'} {formatDay(reward.voucherExpiry)}</p>}
        <details className="mt-3 text-xs text-ink-2"><summary className="flex min-h-[32px] cursor-pointer items-center font-medium">Terms</summary><p className="mt-1 whitespace-pre-line">{reward.terms}</p></details>
      </div>
    </div>
  );
}

function ChallengeCard({ c, onJoin, onLeave, onReveal, busy }) {
  const [confirming, setConfirming] = useState(false);
  const e = c.enrollment;
  return (
    <li className="v-block p-4">
      {/* The promotion label stays the first thing read on the card. */}
      <p className="flex items-center gap-1.5 text-xs font-semibold text-warn">
        <Megaphone className="h-3.5 w-3.5" aria-hidden="true" /> {c.disclosure}
      </p>
      <h3 className="mt-2 text-[15px] font-semibold text-ink">{c.title}</h3>
      <p className="mt-1 text-sm text-ink-2">{c.rule}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3 text-xs">
        <div><dt className="text-ink-3">Reward</dt><dd className="mt-0.5 font-semibold text-ink">{c.reward.label}</dd></div>
        <div><dt className="text-ink-3">Duration</dt><dd className="mt-0.5 text-ink-soft">{c.days} days, from the day after you join</dd></div>
        <div><dt className="text-ink-3">Rewards left</dt><dd className="mt-0.5 text-ink-soft">{c.availability.soldOut ? 'None left' : `${c.availability.remaining}, while stocks last`}</dd></div>
        <div><dt className="text-ink-3">Open until</dt><dd className="mt-0.5 text-ink-soft">{new Date(c.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</dd></div>
        {c.reward.voucherExpiry && <div className="col-span-2"><dt className="text-ink-3">Voucher use-by</dt><dd className="mt-0.5 text-ink-soft">{formatDay(c.reward.voucherExpiry)}</dd></div>}
      </dl>
      <details className="mt-3 text-xs text-ink-2">
        <summary className="flex min-h-[32px] cursor-pointer items-center font-medium">Eligibility and terms</summary>
        <p className="mt-1">{c.eligibility}</p>
        <p className="mt-1 whitespace-pre-line">{c.terms}</p>
      </details>

      {e ? (
        <div className="mt-3 border-t border-line pt-3 text-xs">
          <p className="font-semibold text-ink">{STATUS[e.status]}{e.status === 'active' && e.day ? ` · day ${e.day} of ${c.days}` : ''}</p>
          {e.status === 'active' && <p className="mt-1 text-ink-2">Logged on {e.activeDays} of the {e.activeNeeded} days needed. Result on {formatDay(e.judgeOn)}.</p>}
          {e.reason && e.status === 'failed' && <p className="mt-1 text-ink-2">{e.reason}</p>}
          {e.status === 'completed' && e.reward?.issued && (
            <button type="button" disabled={busy} onClick={() => onReveal(e.id)} className="v-press v-btn-primary mt-3 w-full"><Gift className="h-4 w-4" aria-hidden="true" /> {e.reward.revealed ? 'Show voucher' : 'Reveal voucher'}</button>
          )}
          {e.status === 'completed' && e.reward?.soldOut && <p className="mt-1 text-ink-2">Well done! All rewards had already been given out when you finished.</p>}
          {e.status === 'active' && <button type="button" disabled={busy} onClick={() => onLeave(c.id)} className="mt-1 min-h-[44px] text-ink-2 underline">Leave challenge</button>}
        </div>
      ) : confirming ? (
        <div className="mt-3 border-t border-line pt-3 text-xs text-ink-2">
          <p>By joining you accept the terms above. It's free. Vittova checks the rule from your own records; {c.sponsor} only learns if a reward is issued.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy} onClick={() => onJoin(c.id)} className="v-press v-btn-primary flex-1 px-3">Join challenge</button>
            <button type="button" onClick={() => setConfirming(false)} className="v-press v-btn-secondary min-h-12 flex-1 px-3">Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={busy || c.availability.soldOut} onClick={() => setConfirming(true)} className="v-press v-btn-secondary mt-3 min-h-12 w-full">
          {c.availability.soldOut ? 'All rewards given out' : 'Join (free)'}
        </button>
      )}
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
    <div className="mx-auto max-w-lg space-y-6 pb-6 text-ink">
      <div>
        <Link to="/settings" className="-ml-1 inline-flex min-h-[44px] items-center gap-1 px-1 text-sm text-ink-2"><ArrowLeft className="h-4 w-4" /> Back</Link>
        <header>
          <p className="text-[13px] font-semibold text-warn">Sponsored</p>
          <h1 className="mt-1 text-2xl font-bold">Money challenges</h1>
          <p className="mt-1 text-sm text-ink-2">Optional challenges from sponsors that reward spending carefully. They are promotions, not Vittova advice.</p>
          <p className="mt-2 flex items-start gap-2 text-xs text-ink-3"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Sponsors never see your transactions, balances, categories or scores.</p>
        </header>
      </div>

      {!features.sponsoredChallengesEnabled ? (
        <p className="text-sm text-ink-2">No sponsored challenges are running right now.</p>
      ) : !isPro ? (
        <p className="text-sm text-ink-2">Sponsored challenges are part of Vittova Pro. <Link to="/pro" className="font-semibold text-ink underline">See Pro</Link></p>
      ) : (
        <>
          {error && <p role="alert" className="v-error">{error}</p>}
          {!list && !error && <div className="space-y-3" aria-busy="true" aria-label="Loading challenges">{[0, 1].map((i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}</div>}
          {list && !list.length && <p className="text-sm text-ink-2">No sponsored challenges are running right now.</p>}
          {list && list.length > 0 && (
            <ul className="space-y-3">
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
