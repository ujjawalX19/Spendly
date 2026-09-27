/**
 * Save-to-Earn — Money Streak, today's mission, one money challenge at a time,
 * the Victory Pot (an ESTIMATE of spending avoided, never cash), badges and
 * the "Saved by Vittova" history.
 *
 * Everything shown comes from the server (GET /api/save-to-earn and
 * GET /api/money-streak). The app never computes XP, progress, completion or
 * the Victory Pot. Wording is no-shame: a challenge that doesn't work out
 * "ended", it never "failed".
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Flame, Trophy, Target, ChevronDown, Lock, Info, Gift, Sparkles, X, Share2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { shareText, shareProgress } from '../lib/shareProgress';
import { useAuth } from '../contexts/AuthContext';
import { apiJson } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';
import { track } from '../lib/telemetry';
import { inr, missionStatus } from '../lib/moneyDisplay';
import { StreakSheet } from '../components/MoneyStreakCard';
import { ErrorState, PrimaryButton, SecondaryButton, SectionLabel, Skeleton, StatusPill, Surface, useEasedNumber } from '../components/ui';

const SEEN_KEY = 'vittova.s2e.celebrated.v1';

function seenCelebration(id) {
  try { return (JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')).includes(id); } catch { return true; }
}
function markCelebrated(id) {
  try {
    const list = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    localStorage.setItem(SEEN_KEY, JSON.stringify([id, ...list].slice(0, 20)));
  } catch { /* storage unavailable */ }
}

function Bar({ pct, tone = 'bg-lime-400', label }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
      <div className="h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}>
        <div className={`h-full w-full rounded-full ${tone}`} />
      </div>
    </div>
  );
}

function PotValue({ value }) {
  const n = useEasedNumber(value, 700);
  return <span className="font-mono-finance tabular-nums">{inr(n)}</span>;
}

export default function SaveToEarn() {
  const { session } = useAuth();
  const [hub, setHub] = useState(null);
  const [streak, setStreak] = useState(null);
  const [error, setError] = useState('');
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState(null); // { tone, text, pro? }
  const [showAll, setShowAll] = useState(false);
  const [openDetail, setOpenDetail] = useState(false);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [streakOpen, setStreakOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(null);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [h, s] = await Promise.all([
        apiJson('/save-to-earn', { session }),
        apiJson('/money-streak', { session }).catch(() => null),
      ]);
      setHub(h.saveToEarn);
      setStreak(s?.moneyStreak || null);
      const f = h.saveToEarn.justFinished;
      if (f && f.status === 'completed' && !seenCelebration(f.id)) setCelebrate(f);
    } catch (err) {
      if (err?.data?.code === 'FEATURE_DISABLED') setDisabled(true);
      else setError(friendlyError(err, "We couldn't load Save-to-Earn."));
    }
  }, [session]);

  useEffect(() => { track('save_to_earn_viewed'); }, []);
  useEffect(() => { load(); }, [load]);

  const start = async (template) => {
    setBusy(template);
    setNote(null);
    try {
      await apiJson('/save-to-earn/challenges', { session, method: 'POST', body: { template } });
      setShowAll(false);
      await load();
      setNote({ tone: 'good', text: 'Challenge started. It begins tomorrow, so today still counts as normal.' });
    } catch (err) {
      const code = err?.data?.code;
      setNote({ tone: 'warn', text: friendlyError(err, "We couldn't start that challenge."), pro: code === 'PRO_REQUIRED' });
    } finally {
      setBusy('');
    }
  };

  const skip = async () => {
    if (!hub?.active) return;
    setBusy('skip');
    try {
      await apiJson(`/save-to-earn/challenges/${hub.active.id}/skip`, { session, method: 'POST' });
      setConfirmSkip(false);
      setOpenDetail(false);
      await load();
      setNote({ tone: 'neutral', text: 'Challenge stopped. No penalty. Pick another whenever you like.' });
    } catch (err) {
      setNote({ tone: 'warn', text: friendlyError(err, "We couldn't stop that challenge.") });
    } finally {
      setBusy('');
    }
  };

  const recommended = useMemo(() => hub?.templates.find((x) => x.template === hub?.recommendation?.template) || null, [hub]);

  if (disabled) {
    return (
      <div className="pt-10 text-center text-sm text-zinc-400">Save-to-Earn isn&apos;t available right now.</div>
    );
  }
  if (error && !hub) return <div className="pt-10"><ErrorState onRetry={load} /></div>;
  if (!hub) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading Save-to-Earn">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-2 gap-3"><Skeleton className="h-24 rounded-[20px]" /><Skeleton className="h-24 rounded-[20px]" /></div>
        <Skeleton className="h-36 w-full rounded-[20px]" />
        <Skeleton className="h-40 w-full rounded-[20px]" />
      </div>
    );
  }

  const a = hub.active;
  const today = streak?.today;
  const mission = today ? missionStatus(today.status) : null;
  const pct = a?.progress ? (a.progress.day / a.progress.days) * 100 : 0;
  const finished = hub.justFinished;

  return (
    <div className="space-y-3 pb-6 text-white">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Save-to-Earn</h1>
          <p className="mt-1 text-sm text-zinc-400">Better money habits, rewarded. One challenge at a time.</p>
        </div>
        <button type="button" onClick={() => setSharing(true)} aria-label="Share your progress"
          className="v-press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 text-zinc-200"><Share2 className="h-4 w-4" /></button>
      </header>

      {/* Streak + Victory Pot */}
      <div className="grid grid-cols-2 gap-3">
        <Surface className="!p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold text-zinc-400"><Flame className="h-4 w-4 text-orange-400" aria-hidden="true" /> Money Streak</p>
          <p className="mt-2 text-3xl font-black">{streak ? streak.current : '–'}<span className="ml-1 text-sm font-semibold text-zinc-400">{streak?.current === 1 ? 'day' : 'days'}</span></p>
        </Surface>
        <Surface className="!p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold text-zinc-400"><Trophy className="h-4 w-4 text-amber-300" aria-hidden="true" /> Victory Pot</p>
          <p className="mt-2 text-3xl font-black"><PotValue value={hub.victoryPot.total} /></p>
          <p className="text-[11px] text-zinc-500">estimated impact</p>
        </Surface>
      </div>

      {/* Level */}
      <Surface className="!py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-bold">Level {hub.level.level} · {hub.level.levelName}</span>
          <span className="font-mono-finance text-xs text-zinc-400">{hub.level.total} XP</span>
        </div>
        <div className="mt-2"><Bar pct={hub.level.progressPercent} tone="bg-amber-300" label="Progress to next level" /></div>
        <p className="mt-1.5 text-[11px] text-zinc-500">{hub.level.nextLevel ? `${hub.level.nextLevel.xpToGo} XP to ${hub.level.nextLevel.name}` : 'Top level reached'}</p>
      </Surface>

      {note && (
        <p role="status" className={`rounded-2xl border px-4 py-3 text-sm ${note.tone === 'good' ? 'border-lime-400/30 bg-lime-400/10 text-lime-100' : note.tone === 'warn' ? 'border-amber-400/30 bg-amber-400/10 text-amber-100' : 'border-white/10 bg-white/5 text-zinc-200'}`}>
          {note.text} {note.pro && <Link to="/pro" className="font-bold underline">See Vittova Pro</Link>}
        </p>
      )}

      {/* A challenge that just ended without completing: gentle, no shame */}
      {finished && finished.status === 'not_completed' && (
        <Surface>
          <p className="text-sm font-bold text-white">{finished.title} ended</p>
          <p className="mt-1 text-sm text-zinc-400">{finished.note || 'It didn’t work out this time.'} Your streak and XP are still yours. Start again whenever you&apos;re ready.</p>
        </Surface>
      )}

      {/* Today's mission */}
      <Surface>
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>Today&apos;s mission</SectionLabel>
          {mission && <StatusPill tone={mission.tone === 'good' ? 'good' : mission.tone === 'bad' ? 'warn' : 'neutral'}>{mission.label}</StatusPill>}
        </div>
        {today ? (
          <>
            <p className="mt-2 flex items-start gap-2 text-base font-bold"><Target className="mt-0.5 h-4 w-4 shrink-0 text-lime-400" aria-hidden="true" />{today.mission.title}</p>
            <p className="mt-1 text-sm text-zinc-400">{today.mission.detail}</p>
            {today.mission.id === 'under_limit' && today.limit > 0 && (
              <div className="mt-3">
                <div className="mb-1.5 flex justify-between text-xs"><span className="text-zinc-400">Spent today</span><span className="font-mono-finance">{inr(today.spent)} / {inr(today.limit)}</span></div>
                <Bar pct={(today.spent / today.limit) * 100} tone={today.spent > today.limit ? 'bg-amber-400' : 'bg-lime-400'} label="Spent against today's limit" />
              </div>
            )}
            <SecondaryButton className="mt-3" onClick={() => setStreakOpen(true)}>Mission and streak details</SecondaryButton>
          </>
        ) : <Skeleton className="mt-3 h-16 w-full" />}
      </Surface>

      {/* Active challenge, or a recommendation */}
      {a ? (
        <Surface>
          <SectionLabel>Active challenge</SectionLabel>
          <p className="mt-2 text-lg font-bold">{a.title}</p>
          {a.progress?.upcoming ? (
            <p className="mt-1 text-sm text-zinc-400">Starts tomorrow and runs {a.days} days.</p>
          ) : (
            <>
              <div className="mt-3 mb-1.5 flex justify-between text-xs"><span className="text-zinc-400">Day {a.progress?.day ?? 0} of {a.days}</span><span className="text-zinc-400">Logged {a.progress?.activeDays ?? 0} days</span></div>
              <Bar pct={pct} label="Challenge progress" />
              {a.progress?.day >= a.days && <p className="mt-2 text-xs text-zinc-400">Last day done. Results come in after one grace day for late logging.</p>}
            </>
          )}
          <button type="button" onClick={() => setOpenDetail((v) => !v)} aria-expanded={openDetail}
            className="mt-3 flex min-h-[44px] w-full items-center justify-between text-sm font-semibold text-zinc-300">
            Rules and reward <ChevronDown className={`h-4 w-4 transition-transform ${openDetail ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {openDetail && (
            <div className="v-enter space-y-3 border-t border-white/[0.06] pt-3 text-sm">
              <p><span className="text-zinc-500">Why it matters · </span>{a.why}</p>
              <p><span className="text-zinc-500">Goal · </span>{a.rule}</p>
              <p><span className="text-zinc-500">Reward · </span>+{a.reward.xp} XP, and badges when they apply</p>
              <p className="text-xs text-zinc-500">Log your spending (or mark no-spend days) on most days so Vittova can check it. Essential spending such as bills, medicine and travel you need is never part of a challenge.</p>
              {!confirmSkip ? (
                <button type="button" onClick={() => setConfirmSkip(true)} className="min-h-[44px] text-sm font-semibold text-zinc-400 underline">Stop this challenge</button>
              ) : (
                <div className="flex gap-2">
                  <SecondaryButton onClick={() => setConfirmSkip(false)}>Keep going</SecondaryButton>
                  <PrimaryButton onClick={skip} disabled={busy === 'skip'}>{busy === 'skip' ? 'Stopping…' : 'Stop, no penalty'}</PrimaryButton>
                </div>
              )}
            </div>
          )}
        </Surface>
      ) : (
        <Surface>
          <SectionLabel>Suggested for you</SectionLabel>
          {recommended ? (
            <>
              <p className="mt-2 text-lg font-bold">{recommended.title}</p>
              <p className="mt-1 text-sm text-zinc-400">{hub.recommendation.reason}</p>
              <p className="mt-2 text-xs text-zinc-500">{recommended.days} days · +{recommended.reward.xp} XP · {recommended.rule}</p>
              <PrimaryButton className="mt-3" onClick={() => start(recommended.template)} disabled={!!busy}>{busy === recommended.template ? 'Starting…' : 'Start challenge'}</PrimaryButton>
            </>
          ) : null}
          <button type="button" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}
            className="mt-2 flex min-h-[44px] w-full items-center justify-between text-sm font-semibold text-zinc-300">
            {showAll ? 'Hide other challenges' : 'See other challenges'} <ChevronDown className={`h-4 w-4 transition-transform ${showAll ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {showAll && (
            <ul className="v-enter divide-y divide-white/[0.06] border-t border-white/[0.06]">
              {hub.templates.filter((x) => x.template !== recommended?.template).map((x) => (
                <li key={x.template} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-bold">{x.title}{x.pro && <span className="rounded-full bg-amber-300/15 px-1.5 py-0.5 text-[10px] font-black uppercase text-amber-200">Pro</span>}</p>
                      <p className="mt-0.5 text-xs text-zinc-400">{x.rule}</p>
                      <p className="mt-0.5 text-[11px] text-zinc-500">{x.days} days · +{x.reward.xp} XP</p>
                    </div>
                    {x.locked ? (
                      <Link to="/pro" className="v-press flex min-h-[44px] shrink-0 items-center gap-1 rounded-xl border border-white/10 px-3 text-xs font-bold text-zinc-300"><Lock className="h-3.5 w-3.5" aria-hidden="true" /> Pro</Link>
                    ) : (
                      <button type="button" onClick={() => start(x.template)} disabled={!!busy} className="v-press min-h-[44px] shrink-0 rounded-xl bg-white/10 px-3 text-xs font-bold text-white disabled:opacity-50">{busy === x.template ? '…' : 'Start'}</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Surface>
      )}

      {/* Rewards */}
      <Surface>
        <SectionLabel>Rewards</SectionLabel>
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {hub.badges.map((b) => (
            <li key={b.key} className={`rounded-2xl border p-2.5 text-center ${b.earned ? 'v-celebrate border-amber-300/30 bg-amber-300/[0.06]' : 'border-white/[0.06] opacity-55'}`} title={b.desc}>
              <span className={`block text-2xl ${b.earned ? '' : 'grayscale'}`} aria-hidden="true">{b.icon}</span>
              <span className="mt-1 block text-[11px] font-bold leading-tight">{b.title}</span>
              <span className="sr-only">{b.earned ? 'Earned.' : 'Not earned yet.'} {b.desc}</span>
            </li>
          ))}
        </ul>
        {hub.sponsoredAvailable ? (
          <Link to="/challenges" className="v-press mt-3 flex min-h-[48px] items-center justify-between rounded-2xl border border-white/10 px-4 text-sm font-semibold">
            <span className="flex items-center gap-2"><Gift className="h-4 w-4 text-amber-300" aria-hidden="true" /> Sponsored challenges</span>
            <span className="text-[10px] font-black uppercase text-zinc-500">Sponsored</span>
          </Link>
        ) : null}
      </Surface>

      {/* Saved by Vittova */}
      <Surface>
        <div className="flex items-center justify-between">
          <SectionLabel>Saved by Vittova</SectionLabel>
          <span className="text-xs text-zinc-500">This month {inr(hub.victoryPot.thisMonth)}</span>
        </div>
        {hub.history.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">Finished challenges appear here with their estimated impact.</p>
        ) : (
          <ul className="mt-2 divide-y divide-white/[0.06]">
            {hub.history.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block font-semibold">{c.title}</span>
                  <span className="block text-xs text-zinc-500">
                    {c.status === 'completed' ? (c.estimate?.explained || 'Completed') : c.status === 'skipped' ? 'Stopped' : 'Ended without completing'}
                  </span>
                </span>
                <span className="shrink-0 text-right font-mono-finance font-bold">
                  {c.status === 'completed' ? (c.estimate?.impact != null ? `+${inr(c.estimate.impact)}` : <span className="text-xs font-semibold text-zinc-500">Not estimated</span>) : <span className="text-xs font-semibold text-zinc-600">—</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 flex gap-1.5 text-[11px] leading-relaxed text-zinc-500"><Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{hub.victoryPot.note} Each estimate compares what you spent during the challenge with your usual spending over the same number of days in the 8 weeks before.</p>
        {hub.historyLimited && <Link to="/pro" className="mt-2 inline-flex min-h-[44px] items-center text-sm font-semibold text-lime-300 underline">Full history is part of Vittova Pro</Link>}
      </Surface>

      <AnimatePresence>{streakOpen && streak && <StreakSheet streak={streak} onClose={() => setStreakOpen(false)} onChanged={load} />}</AnimatePresence>
      {sharing && <ShareSheet hub={hub} streakDays={streak?.current || 0} onClose={() => setSharing(false)} />}
      {celebrate && <Celebration challenge={celebrate} badges={hub.badges} onClose={() => { markCelebrated(celebrate.id); setCelebrate(null); }} />}
    </div>
  );
}

/** Share a moment: the user picks what, and amounts are off unless ticked. */
function ShareSheet({ hub, streakDays, onClose }) {
  const lastDone = hub.history.find((c) => c.status === 'completed');
  const badges = hub.badges.filter((b) => b.earned);
  const options = [
    streakDays > 0 && { key: 'streak', label: `${streakDays}-day Money Streak` },
    lastDone && { key: 'challenge', label: `Completed: ${lastDone.title}` },
    ...badges.map((b) => ({ key: `badge:${b.key}`, label: `Badge: ${b.title}` })),
  ].filter(Boolean);
  const [pick, setPick] = useState(options[0]?.key || '');
  const [withAmount, setWithAmount] = useState(false);
  const [status, setStatus] = useState('');
  const badge = pick.startsWith('badge:') ? badges.find((b) => `badge:${b.key}` === pick) : null;
  const text = pick ? shareText({
    kind: badge ? 'badge' : pick, streakDays, badgeTitle: badge?.title, challengeTitle: lastDone?.title,
    estimate: lastDone?.estimate?.impact, includeAmount: withAmount && pick === 'challenge',
  }) : '';
  const go = async () => {
    const r = await shareProgress(text, { native: Capacitor.isNativePlatform(), share: navigator.share ? (d) => navigator.share(d) : null, clipboard: navigator.clipboard });
    setStatus(r === 'copied' ? 'Copied. Paste it anywhere.' : r === 'shared' ? 'Shared.' : '');
  };
  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <div className="absolute inset-0 bg-black/75" onClick={onClose} />
      <div className="s2e-done relative z-10 w-full max-w-md rounded-t-3xl border border-white/10 bg-zinc-900 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:rounded-3xl">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-xl text-zinc-400"><X className="h-5 w-5" /></button>
        <h2 id="share-title" className="text-lg font-black">Share your progress</h2>
        <p className="mt-1 text-xs text-zinc-400">Only what you choose is shared. Never your transactions, balance or budget.</p>
        {options.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-400">Keep your streak or finish a challenge, and you'll have something to share.</p>
        ) : (
          <>
            <fieldset className="mt-4 space-y-2">
              <legend className="sr-only">What to share</legend>
              {options.map((o) => (
                <label key={o.key} className="flex min-h-[44px] items-center gap-3 rounded-xl border border-white/10 px-3 text-sm">
                  <input type="radio" name="share" checked={pick === o.key} onChange={() => setPick(o.key)} className="h-4 w-4 accent-lime-400" />{o.label}
                </label>
              ))}
            </fieldset>
            {pick === 'challenge' && lastDone?.estimate?.impact > 0 && (
              <label className="mt-3 flex min-h-[44px] items-center gap-3 text-sm text-zinc-300">
                <input type="checkbox" checked={withAmount} onChange={(e) => setWithAmount(e.target.checked)} className="h-4 w-4 accent-lime-400" />
                Include the estimated amount
              </label>
            )}
            <p className="mt-3 rounded-xl bg-black/40 p-3 text-sm text-zinc-200">{text}</p>
            <PrimaryButton className="mt-4" onClick={go}><Share2 className="h-4 w-4" aria-hidden="true" /> Share</PrimaryButton>
            {status && <p role="status" className="mt-2 text-center text-xs text-zinc-400">{status}</p>}
          </>
        )}
      </div>
    </div>
  );
}

/** Short, calm completion moment (static with reduced motion). */
function Celebration({ challenge, badges, onClose }) {
  const newest = badges.filter((b) => b.earned && b.earnedAt && Date.now() - new Date(b.earnedAt) < 3 * 86400000);
  const impact = challenge.estimate?.impact;
  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="done-title">
      <div className="absolute inset-0 bg-black/75" onClick={onClose} />
      <div className="s2e-done relative z-10 w-full max-w-md rounded-t-3xl border border-white/10 bg-zinc-900 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-center sm:rounded-3xl">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-xl text-zinc-400"><X className="h-5 w-5" /></button>
        <p className="s2e-pop mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-lime-400/15 text-3xl" aria-hidden="true">🎉</p>
        <h2 id="done-title" className="mt-4 text-2xl font-black">Challenge complete!</h2>
        <p className="mt-1 text-sm text-zinc-400">{challenge.title}</p>
        {impact != null && (
          <div className="mt-5">
            <p className="font-mono-finance text-4xl font-black text-lime-300"><PotValue value={impact} /></p>
            <p className="text-xs text-zinc-500">estimated spending avoided</p>
          </div>
        )}
        <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-sm font-bold text-amber-200"><Sparkles className="h-4 w-4" aria-hidden="true" /> +{challenge.reward.xp} XP</p>
        {newest.length > 0 && (
          <p className="mt-3 text-sm text-zinc-300">{newest.map((b) => `${b.icon} ${b.title}`).join('  ·  ')}</p>
        )}
        <PrimaryButton className="mt-6" onClick={onClose}>Start another challenge</PrimaryButton>
      </div>
    </div>
  );
}
