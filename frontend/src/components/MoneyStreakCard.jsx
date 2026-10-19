/**
 * Money Streak — the dashboard tile and its detail sheet.
 *
 * Everything shown comes from GET /api/money-streak; the client never
 * computes a streak or XP (backend/lib/moneyStreak.js does, and only the
 * server writes it). Animations stay to a tap scale and the sheet slide.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Flame, X, Loader2, Target, Trophy } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiJson } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';
import { dayDot, inr, missionStatus, TONE_CLASSES } from '../lib/moneyDisplay';

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
            {size !== 'sm' && <span className="text-[10px] font-bold text-zinc-500">{d.weekday}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function StreakSheet({ streak, onClose, onChanged }) {
  const { session } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const status = missionStatus(streak.today.status);
  const xp = streak.xp;
  const weeklyPercent = streak.weekly.limit > 0 ? Math.min(100, Math.round((streak.weekly.spent / streak.weekly.limit) * 100)) : 0;

  const markNoSpend = async () => {
    setSaving(true);
    setError('');
    try {
      await apiJson('/money-streak/no-spend', { session, method: 'POST' });
      await onChanged();
    } catch (err) {
      setError(friendlyError(err, "We couldn't save that. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="v-scrim absolute inset-0" onClick={onClose} />
      <motion.div
        role="dialog" aria-modal="true" aria-labelledby="streak-title"
        className="relative z-10 max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-zinc-800 bg-zinc-900 p-6 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 340, damping: 30 }}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-zinc-700 sm:hidden" />
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="v-label">Money Streak</p>
            <h2 id="streak-title" className="flex items-center gap-2 text-2xl font-bold text-ink">{streak.current} day{streak.current === 1 ? '' : 's'} <Flame className="h-5 w-5 text-flame" aria-hidden="true" /></h2>
            {streak.longest > streak.current && <p className="text-xs text-ink-3">Best: {streak.longest} days</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2"><X className="h-4 w-4" /></button>
        </div>

        <WeekDots week={streak.week} size="lg" />
        {streak.today.status === 'to_do' && <p className="mt-3 text-center text-sm font-semibold text-ink-2">Log today to keep your streak.</p>}

        <section className="mt-5 rounded-2xl bg-surface-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="v-label flex items-center gap-2"><Target className="h-4 w-4" aria-hidden="true" /> Today's mission</p>
            <span className={`text-xs font-semibold ${TONE_CLASSES[status.tone]}`}>{status.label}</span>
          </div>
          <h3 className="mt-2 font-bold text-white">{streak.today.mission.title}</h3>
          <p className="mt-1 text-sm text-zinc-400">{streak.today.mission.detail}</p>
          {streak.today.mission.id === 'under_limit' && (
            <p className="mt-2 text-xs text-zinc-500">Spent today: <span className="font-mono text-zinc-300">{inr(streak.today.spent)}</span> of <span className="font-mono text-zinc-300">{inr(streak.today.limit)}</span></p>
          )}
          {streak.today.status === 'on_track' && <p className="mt-2 text-xs text-zinc-500">It counts once the day ends.</p>}
          {streak.today.canMarkNoSpend && (
            <button type="button" onClick={markNoSpend} disabled={saving} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 py-2.5 text-sm font-bold text-zinc-100 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'I spent nothing today'}
            </button>
          )}
          {streak.today.noSpendMarked && <p className="mt-2 text-xs font-bold text-lime-300">Marked as a no-spend day ✓</p>}
          {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
        </section>

        <section className="mt-2 rounded-2xl bg-surface-2 p-4">
          <p className="v-label">This week's goal</p>
          <p className="mt-1 text-sm text-zinc-300">Spend within <span className="font-mono">{inr(streak.weekly.limit)}</span> and log on {streak.weekly.minActiveDays} days.</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
            <div className={`h-full rounded-full ${streak.weekly.status === 'over' ? 'bg-rose-500' : 'bg-lime-400'}`} style={{ width: `${weeklyPercent}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-zinc-500"><span className="font-mono">{inr(streak.weekly.spent)}</span> spent · {streak.weekly.activeDays} of {streak.weekly.minActiveDays} days logged</p>
        </section>

        <section className="mt-2 rounded-2xl bg-surface-2 p-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 font-semibold text-ink"><Trophy className="h-4 w-4 text-ink-2" aria-hidden="true" /> Level {xp.level} · {xp.levelName}</p>
            <p className="font-mono text-sm text-zinc-300">{xp.total} XP</p>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={xp.progressPercent}>
            <div className="h-full rounded-full bg-ink-2" style={{ width: `${xp.progressPercent}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-zinc-500">{xp.nextLevel ? `${xp.nextLevel.xpToGo} XP to ${xp.nextLevel.name}` : 'Top level reached'}{xp.today ? ` · +${xp.today} XP today` : ''}</p>
        </section>

        <details className="mt-2 px-1 py-2 text-xs text-ink-2">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center font-semibold text-ink-2">How XP works</summary>
          <ul className="mt-2 space-y-1">
            <li>Log an expense: +{streak.rules.expenseLogged} XP (up to {streak.rules.expenseLoggedDailyCap} a day)</li>
            <li>Complete the daily mission: +{streak.rules.dailyMission} XP</li>
            <li>Weekly goal: +{streak.rules.weeklyGoal} XP</li>
            <li>Month within budget: +{streak.rules.monthWithinBudget} XP</li>
            <li>Every {streak.rules.streakMilestoneDays}-day streak: +{streak.rules.streakMilestone} XP</li>
          </ul>
          <p className="mt-2 text-zinc-500">XP rewards logging honestly and staying within your plan. Spending more never earns XP.</p>
        </details>
      </motion.div>
    </motion.div>
  );
}

/**
 * @param {{streak: object|null, onChanged: () => Promise<void>, variants?: object}} props
 *        `streak` is the moneyStreak object from GET /api/money-streak, or null while loading.
 */
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
  return (
    <>
      {/* One row on Home: the streak and today's mission. The week, the XP and
          the rules are one tap in (the sheet); challenges are one tap across. */}
      <div className="v-enter v-item">
        <button type="button" disabled={!streak} onClick={() => setOpen(true)} className="v-press flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-label={streak ? `Money Streak: ${streak.current} days. Today's mission and this week` : 'Money Streak loading'}>
          <span className={`v-item-icon text-flame ${celebrate ? 'v-celebrate' : ''}`}>
            <Flame className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            {streak ? (
              <>
                <span className="block text-sm font-medium text-ink">{streak.current}-day streak</span>
                <span className="block truncate text-xs text-ink-2">{streak.today.mission.title}</span>
              </>
            ) : (
              <>
                <span className="block h-5 w-28 animate-pulse rounded bg-surface-2" />
                <span className="mt-1 block text-xs text-ink-2">Money Streak</span>
              </>
            )}
          </span>
        </button>
        <button type="button" disabled={!streak} onClick={() => navigate('/save-to-earn')}
          className="v-press shrink-0 text-xs font-medium text-warn disabled:opacity-40 min-h-[44px] px-1"
          aria-label="Open Save-to-Earn challenges">
          Challenges
        </button>
      </div>
      <AnimatePresence>{open && streak && <StreakSheet streak={streak} onClose={() => setOpen(false)} onChanged={onChanged} />}</AnimatePresence>
    </>
  );
}
