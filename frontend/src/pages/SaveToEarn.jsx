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
import { Award, Flame, Trophy, ChevronDown, ChevronRight, Lock, Info, Gift, X, Share2 } from 'lucide-react';
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

function Bar({ pct, tone = 'bg-accent', label }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
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
      <div className="pt-10 text-center text-sm text-ink-2">Save-to-Earn isn&apos;t available right now.</div>
    );
  }
  if (error && !hub) return <div className="pt-10"><ErrorState onRetry={load} /></div>;
  if (!hub) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading Save-to-Earn">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-16 w-56" />
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  const a = hub.active;
  const today = streak?.today;
  const mission = today ? missionStatus(today.status) : null;
  const pct = a?.progress ? (a.progress.day / a.progress.days) * 100 : 0;
  const finished = hub.justFinished;

  return (
    <div className="space-y-6 pb-6 text-ink">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Save-to-Earn</h1>
          <p className="mt-1 text-sm text-ink-2">Better money habits, rewarded. One challenge at a time.</p>
        </div>
        <button type="button" onClick={() => setSharing(true)} aria-label="Share your progress"
          className="v-press -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2"><Share2 className="h-5 w-5" /></button>
      </header>

      {/* Streak + Victory Pot + level: the figures sit on the page */}
      <section>
        <div className="flex gap-10">
          <div>
            <p className="flex items-center gap-1.5 text-[13px] text-ink-2"><Flame className="h-4 w-4 text-flame" aria-hidden="true" /> Money Streak</p>
            <p className="mt-1 font-display text-[34px] font-bold leading-none tabular-nums">{streak ? streak.current : '–'}<span className="ml-1.5 text-sm font-normal text-ink-2">{streak?.current === 1 ? 'day' : 'days'}</span></p>
          </div>
          <div>
            <p className="text-[13px] text-ink-2">Victory Pot</p>
            <p className="mt-1 font-display text-[34px] font-bold leading-none"><PotValue value={hub.victoryPot.total} /></p>
            <p className="mt-1.5 text-[11px] text-ink-3">estimated impact</p>
          </div>
        </div>
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-[13px]">
            <span className="font-medium text-ink">Level {hub.level.level} · {hub.level.levelName}</span>
            <span className="tabular-nums text-ink-2">{hub.level.total} XP</span>
          </div>
          <Bar pct={hub.level.progressPercent} tone="bg-ink-2" label="Progress to next level" />
          <p className="mt-1.5 text-[11px] text-ink-3">{hub.level.nextLevel ? `${hub.level.nextLevel.xpToGo} XP to ${hub.level.nextLevel.name}` : 'Top level reached'}</p>
        </div>
      </section>

      {note && (
        <p role="status" className={`rounded-xl bg-surface px-4 py-3 text-sm ${note.tone === 'warn' ? 'text-warn' : 'text-ink-soft'}`}>
          {note.text} {note.pro && <Link to="/pro" className="font-semibold text-ink underline">See Vittova Pro</Link>}
        </p>
      )}

      {/* A challenge that just ended without completing: gentle, no shame */}
      {finished && finished.status === 'not_completed' && (
        <Surface>
          <p className="text-sm font-semibold text-ink">{finished.title} ended</p>
          <p className="mt-1 text-sm text-ink-2">{finished.note || 'It didn’t work out this time.'} Your streak and XP are still yours. Start again whenever you&apos;re ready.</p>
        </Surface>
      )}

      {/* Today's mission */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <SectionLabel>Today&apos;s mission</SectionLabel>
          {mission && <StatusPill tone={mission.tone === 'good' ? 'good' : mission.tone === 'bad' ? 'warn' : 'neutral'}>{mission.label}</StatusPill>}
        </div>
        <Surface>
          {today ? (
            <>
              <p className="text-base font-semibold">{today.mission.title}</p>
              <p className="mt-1 text-sm text-ink-2">{today.mission.detail}</p>
              {today.mission.id === 'under_limit' && today.limit > 0 && (
                <div className="mt-4">
                  <div className="mb-2 flex justify-between text-xs"><span className="text-ink-2">Spent today</span><span className="font-mono-finance text-ink">{inr(today.spent)} / {inr(today.limit)}</span></div>
                  <Bar pct={(today.spent / today.limit) * 100} tone={today.spent > today.limit ? 'bg-warn' : 'bg-accent'} label="Spent against today's limit" />
                </div>
              )}
              <SecondaryButton className="mt-4" onClick={() => setStreakOpen(true)}>Mission and streak details</SecondaryButton>
            </>
          ) : <Skeleton className="h-16 w-full" />}
        </Surface>
      </section>

      {/* Active challenge, or a recommendation */}
      {a ? (
        <section>
          <SectionLabel className="mb-2">Active challenge</SectionLabel>
          <Surface>
            <p className="text-lg font-bold">{a.title}</p>
            {a.progress?.upcoming ? (
              <p className="mt-1 text-sm text-ink-2">Starts tomorrow and runs {a.days} days.</p>
            ) : (
              <>
                <div className="mb-2 mt-3 flex justify-between text-xs text-ink-2"><span>Day {a.progress?.day ?? 0} of {a.days}</span><span>Logged {a.progress?.activeDays ?? 0} days</span></div>
                <Bar pct={pct} label="Challenge progress" />
                {a.progress?.day >= a.days && <p className="mt-2 text-xs text-ink-2">Last day done. Results come in after one grace day for late logging.</p>}
              </>
            )}
            <button type="button" onClick={() => setOpenDetail((v) => !v)} aria-expanded={openDetail}
              className="mt-3 flex min-h-[44px] w-full items-center justify-between border-t border-line text-sm font-medium text-ink-soft">
              Rules and reward <ChevronDown className={`h-4 w-4 text-ink-3 transition-transform ${openDetail ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {openDetail && (
              <div className="v-enter space-y-3 pt-1 text-sm text-ink-soft">
                <p><span className="text-ink-3">Why it matters · </span>{a.why}</p>
                <p><span className="text-ink-3">Goal · </span>{a.rule}</p>
                <p><span className="text-ink-3">Reward · </span>+{a.reward.xp} XP, and badges when they apply</p>
                <p className="text-xs leading-relaxed text-ink-3">Log your spending (or mark no-spend days) on most days so Vittova can check it. Essential spending such as bills, medicine and travel you need is never part of a challenge.</p>
                {!confirmSkip ? (
                  <button type="button" onClick={() => setConfirmSkip(true)} className="min-h-[44px] text-sm font-medium text-ink-2 underline">Stop this challenge</button>
                ) : (
                  <div className="flex gap-2">
                    <SecondaryButton className="min-h-12 flex-1" onClick={() => setConfirmSkip(false)}>Keep going</SecondaryButton>
                    <SecondaryButton className="min-h-12 flex-1" onClick={skip} disabled={busy === 'skip'}>{busy === 'skip' ? 'Stopping…' : 'Stop, no penalty'}</SecondaryButton>
                  </div>
                )}
              </div>
            )}
          </Surface>
        </section>
      ) : (
        <section>
          <SectionLabel className="mb-2">Suggested for you</SectionLabel>
          <Surface>
            {recommended ? (
              <>
                <p className="text-lg font-bold">{recommended.title}</p>
                <p className="mt-1 text-sm text-ink-2">{hub.recommendation.reason}</p>
                <p className="mt-2 text-xs text-ink-3">{recommended.days} days · +{recommended.reward.xp} XP · {recommended.rule}</p>
                <PrimaryButton className="mt-4" onClick={() => start(recommended.template)} disabled={!!busy}>{busy === recommended.template ? 'Starting…' : 'Start challenge'}</PrimaryButton>
              </>
            ) : null}
            <button type="button" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}
              className="mt-2 flex min-h-[44px] w-full items-center justify-between text-sm font-medium text-ink-soft">
              {showAll ? 'Hide other challenges' : 'See other challenges'} <ChevronDown className={`h-4 w-4 text-ink-3 transition-transform ${showAll ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {showAll && (
              <ul className="v-enter v-rows border-t border-line">
                {hub.templates.filter((x) => x.template !== recommended?.template).map((x) => (
                  <li key={x.template} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{x.title}{x.pro && <span className="ml-1.5 text-xs font-medium text-ink-3">Pro</span>}</p>
                        <p className="mt-0.5 text-xs text-ink-2">{x.rule}</p>
                        <p className="mt-0.5 text-[11px] text-ink-3">{x.days} days · +{x.reward.xp} XP</p>
                      </div>
                      {x.locked ? (
                        <Link to="/pro" className="v-press v-btn-secondary shrink-0 px-3 text-[13px] text-ink-2"><Lock className="h-3.5 w-3.5" aria-hidden="true" /> Pro</Link>
                      ) : (
                        <button type="button" onClick={() => start(x.template)} disabled={!!busy} className="v-press v-btn-secondary shrink-0 px-3 text-[13px]">{busy === x.template ? '…' : 'Start'}</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Surface>
        </section>
      )}

      {/* Rewards */}
      <section>
        <SectionLabel className="mb-2">Badges</SectionLabel>
        <ul className="v-block v-rows">
          {hub.badges.map((b) => (
            <li key={b.key} className={`flex min-h-[56px] items-center gap-3 px-4 py-2.5 ${b.earned ? '' : 'opacity-55'}`}>
              <Award className={`h-5 w-5 shrink-0 ${b.earned ? 'text-warn' : 'text-ink-3'}`} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">{b.title}</span>
                <span className="block text-xs text-ink-3">{b.desc}</span>
              </span>
              <span className="shrink-0 text-xs text-ink-3">{b.earned ? 'Earned' : 'Not yet'}</span>
            </li>
          ))}
          {hub.sponsoredAvailable ? (
            <li>
              <Link to="/challenges" className="v-press flex min-h-[56px] items-center gap-3 px-4 text-sm font-medium">
                <Gift className="h-5 w-5 shrink-0 text-ink-2" aria-hidden="true" />
                <span className="flex-1">Sponsored challenges</span>
                <span className="text-xs text-ink-3">Sponsored</span>
                <ChevronRight className="h-4 w-4 text-ink-3" aria-hidden="true" />
              </Link>
            </li>
          ) : null}
        </ul>
      </section>

      {/* Saved by Vittova */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <SectionLabel>Saved by Vittova</SectionLabel>
          <span className="text-xs text-ink-3">This month {inr(hub.victoryPot.thisMonth)}</span>
        </div>
        {hub.history.length === 0 ? (
          <p className="text-sm text-ink-2">Finished challenges appear here with their estimated impact.</p>
        ) : (
          <ul className="v-block v-rows px-4">
            {hub.history.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{c.title}</span>
                  <span className="block text-xs text-ink-3">
                    {c.status === 'completed' ? (c.estimate?.explained || 'Completed') : c.status === 'skipped' ? 'Stopped' : 'Ended without completing'}
                  </span>
                </span>
                <span className="shrink-0 text-right font-mono-finance font-semibold text-ink">
                  {c.status === 'completed' ? (c.estimate?.impact != null ? `+${inr(c.estimate.impact)}` : <span className="text-xs font-normal text-ink-3">Not estimated</span>) : <span className="text-xs font-normal text-ink-3">—</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 flex gap-1.5 text-[11px] leading-relaxed text-ink-3"><Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{hub.victoryPot.note} Each estimate compares what you spent during the challenge with your usual spending over the same number of days in the 8 weeks before.</p>
        {hub.historyLimited && <Link to="/pro" className="mt-1 inline-flex min-h-[44px] items-center text-sm font-medium text-ink underline">Full history is part of Vittova Pro</Link>}
      </section>

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
      <div className="v-scrim absolute inset-0" onClick={onClose} />
      <div className="s2e-done v-sheet relative z-10 w-full max-w-md p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-ink-2"><X className="h-5 w-5" /></button>
        <h2 id="share-title" className="text-lg font-bold">Share your progress</h2>
        <p className="mt-1 pr-8 text-xs text-ink-2">Only what you choose is shared. Never your transactions, balance or budget.</p>
        {options.length === 0 ? (
          <p className="mt-4 text-sm text-ink-2">Keep your streak or finish a challenge, and you'll have something to share.</p>
        ) : (
          <>
            <fieldset className="v-rows mt-3">
              <legend className="sr-only">What to share</legend>
              {options.map((o) => (
                <label key={o.key} className="flex min-h-[48px] items-center gap-3 text-sm text-ink">
                  <input type="radio" name="share" checked={pick === o.key} onChange={() => setPick(o.key)} className="h-4 w-4 accent-[var(--v-accent)]" />{o.label}
                </label>
              ))}
            </fieldset>
            {pick === 'challenge' && lastDone?.estimate?.impact > 0 && (
              <label className="mt-2 flex min-h-[44px] items-center gap-3 text-sm text-ink-soft">
                <input type="checkbox" checked={withAmount} onChange={(e) => setWithAmount(e.target.checked)} className="h-4 w-4 accent-[var(--v-accent)]" />
                Include the estimated amount
              </label>
            )}
            <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm text-ink-soft">{text}</p>
            <PrimaryButton className="mt-4" onClick={go}><Share2 className="h-4 w-4" aria-hidden="true" /> Share</PrimaryButton>
            {status && <p role="status" className="mt-2 text-center text-xs text-ink-2">{status}</p>}
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
      <div className="v-scrim absolute inset-0" onClick={onClose} />
      <div className="s2e-done v-sheet relative z-10 w-full max-w-md p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-center">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-ink-2"><X className="h-5 w-5" /></button>
        <p className="s2e-pop mx-auto flex h-12 w-12 items-center justify-center" aria-hidden="true"><Trophy className="h-8 w-8 text-accent" /></p>
        <h2 id="done-title" className="mt-3 text-2xl font-bold">Challenge complete</h2>
        <p className="mt-1 text-sm text-ink-2">{challenge.title}</p>
        {impact != null && (
          <div className="mt-5">
            <p className="font-display text-[40px] font-bold leading-none text-accent"><PotValue value={impact} /></p>
            <p className="mt-2 text-xs text-ink-3">estimated spending avoided</p>
          </div>
        )}
        <p className="mt-4 text-sm font-semibold text-ink-soft">+{challenge.reward.xp} XP</p>
        {newest.length > 0 && (
          <p className="mt-2 text-sm text-ink-2">New badge: {newest.map((b) => b.title).join(', ')}</p>
        )}
        <PrimaryButton className="mt-6" onClick={onClose}>Start another challenge</PrimaryButton>
      </div>
    </div>
  );
}
