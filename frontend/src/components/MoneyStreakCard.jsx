/**
 * Money Streak — the dashboard row and its detail sheet: today's personalised
 * mission (v1.14: why it was picked, difficulty, progress, reward, swap,
 * check-in), the week, the weekly goal, level, XP and Vittova Points.
 *
 * Everything shown comes from GET /api/money-streak; the client never
 * computes a streak, a mission result, XP or Points (backend/lib/moneyStreak.js
 * and lib/missions.js do, and only the server writes them). Actions go through
 * the offline queue (lib/missionSync), so a tap without signal is kept and
 * sent later, and shown as waiting until the server accepts it.
 * Animations stay to a tap scale and the sheet slide (none with reduced motion).
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Flame, X, Loader2, Target, Trophy, RefreshCw, CloudOff, Check, ChevronRight, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiJson } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';
import { dayDot, inr, missionStatus, TONE_CLASSES } from '../lib/moneyDisplay';
import { difficultyOptions, missionProgress, rewardLine, timeLeft } from '../lib/rewardsDisplay';
import { submitAction } from '../lib/missionSync';
import { usePendingActions } from '../hooks/usePendingActions';
import { StatusPill } from './ui';

function WeekDots({ week, size = 'sm' }) {
  // Seven 16px dots fit the half-width dashboard tile on a 360px-wide phone.
  const box = size === 'sm' ? 'h-4 w-4 text-[8px]' : size === 'md' ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-xs';
  return (
    <ol className={`flex justify-between ${size === 'sm' ? 'gap-0.5' : 'gap-1'}`} aria-label="This week">
      {week.map((d) => {
        const dot = dayDot(d.status);
        return (
          <li key={d.dateKey} className="flex flex-col items-center gap-1">
            <span className={`flex ${box} items-center justify-center rounded-full font-black ${dot.className}`} aria-label={`${d.weekday}: ${dot.label}`}>{dot.mark}</span>
            {size !== 'sm' && <span className="text-[10px] font-bold text-ink-3">{d.weekday}</span>}
          </li>
        );
      })}
    </ol>
  );
}

function Bar({ pct, tone = 'bg-accent', label }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

function DifficultyPicker({ streak, onChanged }) {
  const { session } = useAuth();
  const [saving, setSaving] = useState('');
  const [note, setNote] = useState('');
  const options = difficultyOptions(streak.missions);
  const current = streak.missions.preference || 'auto';
  const choose = async (key) => {
    if (key === current || saving) return;
    setSaving(key);
    setNote('');
    try {
      const r = await apiJson('/money-streak/preferences', { session, method: 'PUT', body: { difficulty: key } });
      setNote(r.appliesFrom === 'today' ? "Done. Today's mission is now easier." : 'Saved. It applies from tomorrow\'s mission.');
      await onChanged();
    } catch (err) {
      setNote(friendlyError(err, "We couldn't save that. Please try again."));
    } finally {
      setSaving('');
    }
  };
  const summary = options.find((o) => o.key === current)?.summary;
  return (
    <section className="mt-2 rounded-2xl bg-surface-2 p-4">
      <p className="v-label" id="difficulty-label">Mission difficulty</p>
      <div className="v-seg mt-2 grid w-full grid-cols-2 bg-surface [&>button]:px-2" role="radiogroup" aria-labelledby="difficulty-label">
        {options.map((o) => (
          <button key={o.key} type="button" role="radio" aria-checked={current === o.key} disabled={!!saving} onClick={() => choose(o.key)}>
            {saving === o.key ? '…' : o.label}
          </button>
        ))}
      </div>
      {summary && <p className="mt-2 text-xs text-ink-2">{summary}</p>}
      <p className="mt-1 text-xs text-ink-3">Difficulty uses your own numbers, never your income. A harder level starts with tomorrow&apos;s mission.</p>
      {note && <p role="status" className="mt-2 text-xs text-ink-2">{note}</p>}
    </section>
  );
}

export function StreakSheet({ streak, onClose, onChanged }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const pending = usePendingActions(session).filter((i) => i.dateKey === streak.today.dateKey && i.status === 'pending');
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const status = missionStatus(streak.today.status);
  const m = streak.today.mission;
  const xp = streak.xp;
  const points = streak.points;
  const progress = missionProgress(m.progress);
  const weeklyPercent = streak.weekly.limit > 0 ? Math.min(100, Math.round((streak.weekly.spent / streak.weekly.limit) * 100)) : 0;
  const waitingNoSpend = pending.some((i) => i.kind === 'no_spend');
  const waitingCheckin = pending.some((i) => i.kind === 'checkin');
  const offline = Boolean(streak.offline);

  const act = async (key, kind, body) => {
    setSaving(key);
    setError('');
    setInfo('');
    try {
      const r = await submitAction(session, kind, body);
      if (r.status === 'done') await onChanged();
      else if (r.status === 'pending') setInfo("Saved on this phone. It counts once it syncs, and we'll keep trying.");
      else setError(r.message || "We couldn't save that. Please try again.");
    } finally {
      setSaving('');
    }
  };

  const swap = async () => {
    setSaving('swap');
    setError('');
    setInfo('');
    try {
      await apiJson('/money-streak/mission/replace', { session, method: 'POST', body: { dateKey: streak.today.dateKey } });
      await onChanged();
    } catch (err) {
      setError(friendlyError(err, "We couldn't swap your mission. Please try again."));
    } finally {
      setSaving('');
    }
  };

  return (
    <motion.div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="v-scrim absolute inset-0" onClick={onClose} />
      <motion.div
        role="dialog" aria-modal="true" aria-labelledby="streak-title"
        className="v-sheet relative z-10 max-h-[92vh] w-full max-w-md overflow-y-auto p-6 pb-[calc(2rem+env(safe-area-inset-bottom))]"
        initial={reduce ? false : { y: '100%' }} animate={{ y: 0 }} exit={reduce ? { opacity: 0 } : { y: '100%' }} transition={{ type: 'spring', stiffness: 340, damping: 30 }}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-surface-3 sm:hidden" />
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="v-label">Money Streak</p>
            <h2 id="streak-title" className="flex items-center gap-2 text-2xl font-bold text-ink">{streak.current} day{streak.current === 1 ? '' : 's'} <Flame className="h-5 w-5 text-flame" aria-hidden="true" /></h2>
            {streak.longest > streak.current && <p className="text-xs text-ink-3">Best: {streak.longest} days</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-ink-2"><X className="h-4 w-4" /></button>
        </div>

        {offline && (
          <p role="status" className="mb-3 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs text-ink-2">
            <CloudOff className="h-4 w-4 shrink-0" aria-hidden="true" /> Offline. Showing today&apos;s mission as last loaded.
          </p>
        )}

        <WeekDots week={streak.week} size="lg" />
        {streak.today.status === 'to_do' && <p className="mt-3 text-center text-sm font-semibold text-ink-2">Log today to keep your streak.</p>}

        {/* Today's mission */}
        <section className="mt-5 rounded-2xl bg-surface-2 p-4" aria-labelledby="mission-title">
          <div className="flex items-center justify-between gap-2">
            <p className="v-label flex items-center gap-2"><Target className="h-4 w-4" aria-hidden="true" /> Today&apos;s mission</p>
            <span className={`text-xs font-semibold ${TONE_CLASSES[status.tone]}`}>{status.label}</span>
          </div>
          <h3 id="mission-title" className="mt-2 text-[17px] font-bold text-ink">{m.title}</h3>
          {m.personalised && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
              <span className="rounded-md border border-line px-1.5 py-0.5 font-semibold text-ink">{m.difficultyLabel}</span>
              {m.selfReported && <span>Self-reported</span>}
              <span>{timeLeft(m.deadline)}</span>
            </div>
          )}
          <p className="mt-2 text-sm text-ink-2">{m.detail}</p>
          {m.reason && <p className="mt-2 text-xs text-ink-3"><span className="font-semibold text-ink-2">Why this mission: </span>{m.reason}</p>}

          {progress ? (
            <div className="mt-3">
              <div className="mb-1.5 flex justify-between text-xs"><span className="text-ink-2">{m.id === 'goal_step' ? 'Added today' : 'Counted so far'}</span><span className="font-mono-finance text-ink">{progress.text}</span></div>
              <Bar pct={progress.percent} tone={progress.over && m.id !== 'goal_step' ? 'bg-warn' : 'bg-accent'} label="Mission progress" />
            </div>
          ) : !m.personalised && m.id === 'under_limit' ? (
            <p className="mt-2 text-xs text-ink-3">Spent today: <span className="font-mono-finance text-ink-2">{inr(streak.today.spent)}</span> of <span className="font-mono-finance text-ink-2">{inr(streak.today.limit)}</span></p>
          ) : null}

          {m.criteria?.length > 0 && (
            <details className="mt-3 text-xs text-ink-2">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center font-semibold text-ink-2">What counts</summary>
              <ul className="mt-1.5 list-disc space-y-1 pl-4">{m.criteria.map((c) => <li key={c}>{c}</li>)}</ul>
            </details>
          )}

          <p className="mt-3 text-xs text-ink-2">
            Reward: <span className="font-semibold text-ink">{rewardLine(m.reward)}</span>
            {streak.today.status === 'done' || streak.today.status === 'on_track' ? ' · pays when the day ends' : ''}
          </p>
          {streak.today.status === 'on_track' && <p className="mt-1 text-xs text-ink-3">On track so far. It counts once the day ends.</p>}

          {/* Actions */}
          <div className="mt-3 space-y-2">
            {m.checkin && !m.checkin.done && (
              <button type="button" onClick={() => act('checkin', 'checkin', { mission: m.id })} disabled={!!saving || waitingCheckin}
                className="v-press v-btn-primary w-full disabled:opacity-60">
                {saving === 'checkin' ? <Loader2 className="h-4 w-4 animate-spin" /> : waitingCheckin ? 'Waiting to sync' : <><Check className="h-4 w-4" aria-hidden="true" /> Done</>}
              </button>
            )}
            {streak.today.canMarkNoSpend && (
              <button type="button" onClick={() => act('nospend', 'no_spend', {})} disabled={!!saving || waitingNoSpend}
                className="v-press v-btn-secondary w-full disabled:opacity-60">
                {saving === 'nospend' ? <Loader2 className="h-4 w-4 animate-spin" /> : waitingNoSpend ? 'No-spend day waiting to sync' : 'I spent nothing today'}
              </button>
            )}
            {m.action && streak.today.status !== 'done' && streak.today.status !== 'missed' && (
              <button type="button" onClick={() => { onClose(); navigate(m.action.route); }} className="v-press v-btn-secondary w-full">
                {m.action.label}
              </button>
            )}
            {m.canReplace && !offline && (
              <button type="button" onClick={swap} disabled={!!saving} className="v-press v-btn-text w-full text-sm disabled:opacity-60">
                {saving === 'swap' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="h-4 w-4" aria-hidden="true" /> Swap mission ({m.replacementsLeft} left today)</>}
              </button>
            )}
          </div>
          {streak.today.noSpendMarked && <p className="mt-2 text-xs font-bold text-accent">Marked as a no-spend day ✓</p>}
          {info && <p role="status" className="mt-2 text-xs text-ink-2">{info}</p>}
          {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
        </section>

        {streak.missions && !offline && <DifficultyPicker streak={streak} onChanged={onChanged} />}

        <section className="mt-2 rounded-2xl bg-surface-2 p-4">
          <p className="v-label">This week&apos;s goal</p>
          <p className="mt-1 text-sm text-ink-2">Spend within <span className="font-mono-finance">{inr(streak.weekly.limit)}</span> and log on {streak.weekly.minActiveDays} days.</p>
          <div className="mt-2"><Bar pct={weeklyPercent} tone={streak.weekly.status === 'over' ? 'bg-warn' : 'bg-accent'} label="Weekly spending against the weekly goal" /></div>
          <p className="mt-1.5 text-xs text-ink-3"><span className="font-mono-finance">{inr(streak.weekly.spent)}</span> spent · {streak.weekly.activeDays} of {streak.weekly.minActiveDays} days logged</p>
        </section>

        <section className="mt-2 rounded-2xl bg-surface-2 p-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 font-semibold text-ink"><Trophy className="h-4 w-4 text-ink-2" aria-hidden="true" /> Level {xp.level} · {xp.levelName}</p>
            <p className="font-mono-finance text-sm text-ink-2">{xp.total} XP</p>
          </div>
          <div className="mt-2"><Bar pct={xp.progressPercent} tone="bg-ink-2" label="Progress to the next level" /></div>
          <p className="mt-1.5 text-xs text-ink-3">{xp.nextLevel ? `${xp.nextLevel.xpToGo} XP to ${xp.nextLevel.name}` : 'Top level reached'}{xp.today ? ` · +${xp.today} XP today` : ''}</p>
          {points && (
            <p className="mt-2 text-xs text-ink-2"><span className="font-semibold text-ink">{points.balance} Vittova Points</span>{points.pending ? ` · ${points.pending} pending today` : ''}</p>
          )}
          {streak.missions && (
            <Link to="/rewards" onClick={onClose} className="v-press mt-3 flex min-h-[44px] items-center justify-between text-sm font-semibold text-ink">
              Rewards, history and badges <ChevronRight className="h-4 w-4 text-ink-3" aria-hidden="true" />
            </Link>
          )}
        </section>

        <details className="mt-2 px-1 py-2 text-xs text-ink-2">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 font-semibold text-ink-2"><Info className="h-3.5 w-3.5" aria-hidden="true" /> How XP and Points work</summary>
          <ul className="mt-2 space-y-1">
            <li>Log an expense: +{streak.rules.expenseLogged} XP (up to {streak.rules.expenseLoggedDailyCap} a day)</li>
            {streak.rules.missionRewards ? (
              <li>Daily mission: Easy {rewardLine(streak.rules.missionRewards.easy)}, Balanced {rewardLine(streak.rules.missionRewards.balanced)}, Advanced {rewardLine(streak.rules.missionRewards.advanced)}; self-reported {rewardLine(streak.rules.missionRewards.self_reported)}</li>
            ) : <li>Complete the daily mission: +{streak.rules.dailyMission} XP</li>}
            <li>Weekly goal: +{streak.rules.weeklyGoal} XP{streak.rules.points ? `, +${streak.rules.points.weeklyGoal} Points` : ''}</li>
            <li>Month within budget: +{streak.rules.monthWithinBudget} XP{streak.rules.points ? `, +${streak.rules.points.monthWithinBudget} Points` : ''}</li>
            <li>Every {streak.rules.streakMilestoneDays}-day streak: +{streak.rules.streakMilestone} XP{streak.rules.points ? `, +${streak.rules.points.streakMilestone} Points` : ''}</li>
          </ul>
          <p className="mt-2 text-ink-3">XP and Points reward logging honestly and staying within your plan. Spending more never earns either. Vittova Points are an in-app reward with no cash value.</p>
        </details>
      </motion.div>
    </motion.div>
  );
}

const LAST_SEEN_KEY = 'vittova.streakSeen.v1';

/** True once when the streak is higher than the last time Home showed it. */
function useStreakIncreased(current) {
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    if (typeof current !== 'number') return;
    let last = null;
    try { last = Number(window.localStorage.getItem(LAST_SEEN_KEY)); } catch { /* storage unavailable */ }
    if (last !== null && Number.isFinite(last) && current > last && last > 0) setCelebrate(true);
    try { window.localStorage.setItem(LAST_SEEN_KEY, String(current)); } catch { /* storage unavailable */ }
  }, [current]);
  return celebrate;
}

/**
 * @param {{streak: object|null, onChanged: () => Promise<void>}} props
 *        `streak` is the moneyStreak object from GET /api/money-streak, or null while loading.
 */
export default function MoneyStreakCard({ streak, onChanged }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const celebrate = useStreakIncreased(streak?.current);
  const m = streak?.today?.mission;
  const done = streak && (streak.today.status === 'done' || streak.today.status === 'on_track');
  return (
    <>
      {/* One row on Home: the streak and today's mission. The week, the
          mission details, difficulty, XP and Points are one tap in (the
          sheet); rewards and challenges are one tap across. */}
      <div className="v-enter v-item">
        <button type="button" disabled={!streak} onClick={() => setOpen(true)} className="v-press flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-label={streak ? `Money Streak: ${streak.current} days. Today's mission: ${m.title}` : 'Money Streak loading'}>
          <span className={`v-item-icon text-flame ${celebrate ? 'v-celebrate' : ''}`}>
            <Flame className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            {streak ? (
              <>
                <span className="flex items-center gap-2 text-sm font-medium text-ink">
                  {streak.current}-day streak
                  {streak.offline && <CloudOff className="h-3.5 w-3.5 text-ink-3" aria-label="Offline" />}
                </span>
                <span className="block truncate text-xs text-ink-2">{done ? <StatusPill tone="good">{m.title}</StatusPill> : m.title}</span>
              </>
            ) : (
              <>
                <span className="block h-5 w-28 animate-pulse rounded bg-surface-2" />
                <span className="mt-1 block text-xs text-ink-2">Money Streak</span>
              </>
            )}
          </span>
        </button>
        <button type="button" disabled={!streak} onClick={() => navigate(streak?.missions ? '/rewards' : '/save-to-earn')}
          className="v-press shrink-0 text-xs font-medium text-warn disabled:opacity-40 min-h-[44px] px-1"
          aria-label={streak?.missions ? 'Open Rewards' : 'Open Save-to-Earn challenges'}>
          {streak?.missions ? 'Rewards' : 'Challenges'}
        </button>
      </div>
      <AnimatePresence>{open && streak && <StreakSheet streak={streak} onClose={() => setOpen(false)} onChanged={onChanged} />}</AnimatePresence>
    </>
  );
}
