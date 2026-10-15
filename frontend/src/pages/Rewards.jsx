/**
 * Rewards (v1.14) — level, XP, Vittova Points, streak, today's mission, the
 * last two weeks of mission rewards, achievements and the reward history.
 *
 * Read-only: every reward is earned and paid on the server (GET /api/rewards,
 * GET /api/money-streak). Challenges stay in Save-to-Earn and are linked
 * from here, not repeated. Points are an in-app reward with no cash value,
 * and the screen says so wherever a balance is shown.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Award, CalendarDays, ChevronDown, ChevronRight, CloudOff, Flame, Lock, PiggyBank, Target, Trophy } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiJson } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';
import { missionStatus } from '../lib/moneyDisplay';
import { eventStatus, missionDayStatus, rewardLine } from '../lib/rewardsDisplay';
import { cacheMissionState, cachedMissionState, KINDS } from '../lib/offlineQueue';
import { syncMissionReminders } from '../lib/missionReminders';
import { flushQueue } from '../lib/missionSync';
import { usePendingActions } from '../hooks/usePendingActions';
import { StreakSheet } from '../components/MoneyStreakCard';
import { ErrorState, SecondaryButton, SectionLabel, Skeleton, StatusPill, Surface, useEasedNumber } from '../components/ui';

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : '');
const fmtDay = (key) => fmtDate(`${key}T12:00:00+05:30`);

function Bar({ pct, tone = 'bg-accent', label }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

function Count({ value }) {
  const n = useEasedNumber(Number(value) || 0, 600);
  return <span className="tabular-nums">{Math.round(n).toLocaleString('en-IN')}</span>;
}

function PendingSync({ items, session }) {
  const waiting = items.filter((i) => i.status === 'pending');
  const ended = items.filter((i) => i.status === 'expired' || i.status === 'failed');
  if (!waiting.length && !ended.length) return null;
  return (
    <Surface aria-label="Waiting to sync">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink"><CloudOff className="h-4 w-4 text-ink-2" aria-hidden="true" /> Saved on this phone</p>
      <ul className="mt-2 space-y-1.5 text-xs text-ink-2">
        {waiting.map((i) => <li key={i.id}>{KINDS[i.kind].label} · {fmtDay(i.dateKey)} · waiting to sync. Rewards appear once it does.</li>)}
        {ended.map((i) => <li key={i.id} className="text-ink-3">{KINDS[i.kind].label} · {fmtDay(i.dateKey)} · {i.lastError}</li>)}
      </ul>
      {waiting.length > 0 && <SecondaryButton className="mt-3" onClick={() => flushQueue(session)}>Try now</SecondaryButton>}
    </Surface>
  );
}

export default function Rewards() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const pending = usePendingActions(session);
  const [data, setData] = useState(null);
  const [streak, setStreak] = useState(null);
  const [error, setError] = useState('');
  const [disabled, setDisabled] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [showLevels, setShowLevels] = useState(false);
  const [history, setHistory] = useState({ events: [], next: null });
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [r, s] = await Promise.all([
        apiJson('/rewards', { session }),
        apiJson('/money-streak', { session }).catch(() => null),
      ]);
      setData(r.rewards);
      setHistory(r.rewards.history);
      if (s?.moneyStreak) {
        setStreak(s.moneyStreak);
        cacheMissionState(userId, s.moneyStreak);
        syncMissionReminders(s.moneyStreak).catch(() => {});
      } else {
        setStreak((x) => x || cachedMissionState(userId));
      }
    } catch (err) {
      if (err?.data?.code === 'FEATURE_DISABLED') setDisabled(true);
      else {
        setStreak((x) => x || cachedMissionState(userId));
        setError(friendlyError(err, "We couldn't load your rewards."));
      }
    }
  }, [session, userId]);

  useEffect(() => { load(); }, [load]);

  const more = async () => {
    if (!history.next) return;
    setLoadingMore(true);
    try {
      const r = await apiJson(`/rewards/history?before=${encodeURIComponent(history.next)}&limit=30`, { session });
      setHistory((h) => ({ events: [...h.events, ...r.events], next: r.next }));
    } catch { /* the button stays; the user can tap again */ }
    finally { setLoadingMore(false); }
  };

  if (disabled) return <div className="pt-10 text-center text-sm text-ink-2">Rewards aren&apos;t available right now.</div>;
  if (error && !data) {
    return (
      <div className="space-y-4 pt-4">
        <PendingSync items={pending} session={session} />
        <ErrorState onRetry={load} message={error} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading rewards">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  const level = data.level;
  const today = streak?.today;
  const todayStatus = today ? missionStatus(today.status) : null;
  const earned = data.achievements.filter((b) => b.earned);
  const locked = data.achievements.filter((b) => !b.earned);

  return (
    <div className="space-y-6 pb-6 text-ink">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Rewards</h1>
          <p className="mt-1 text-sm text-ink-2">XP, Vittova Points, missions and badges.</p>
        </div>
        <Link to="/rewards/recap" className="v-press v-btn-secondary shrink-0 px-3 text-[13px]"><CalendarDays className="h-4 w-4" aria-hidden="true" /> Weekly recap</Link>
      </header>

      {/* Overview */}
      <section className="v-block p-4" aria-label="Overview">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-ink-2">Level {level.level}</p>
            <p className="mt-1 text-xl font-bold">{level.levelName}</p>
          </div>
          <p className="text-right text-sm text-ink-2"><span className="text-xl font-semibold text-ink"><Count value={level.total} /></span> XP</p>
        </div>
        <div className="mt-3"><Bar pct={level.progressPercent} tone="bg-warn" label="Progress to the next level" /></div>
        <p className="mt-1.5 text-[11px] text-ink-3">{level.nextLevel ? `${level.nextLevel.xpToGo.toLocaleString('en-IN')} XP to level ${level.nextLevel.level}, ${level.nextLevel.name}` : 'Top level reached'}</p>

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4">
          <div>
            <p className="text-xs text-ink-2">Vittova Points</p>
            <p className="mt-1 text-[22px] font-semibold leading-none">{data.points ? <Count value={data.points.balance} /> : '–'}</p>
            {streak?.points?.pending ? <p className="mt-1 text-[11px] text-ink-3">+{streak.points.pending} pending today</p> : null}
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-xs text-ink-2"><Flame className="h-3.5 w-3.5 text-flame" aria-hidden="true" /> Money Streak</p>
            <p className="mt-1 text-[22px] font-semibold leading-none tabular-nums">{streak ? streak.current : '–'}<span className="ml-1 text-xs font-normal text-ink-2">days</span></p>
            <p className="mt-1 text-[11px] text-ink-3">Best {Math.max(data.streak.longest, streak?.longest || 0)} days</p>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-ink-3">{data.points ? data.points.note : "Vittova Points aren't available just yet. Your XP and badges are unaffected."}</p>
        {data.recentAchievement && (
          <p className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-sm"><Award className="h-4 w-4 text-warn" aria-hidden="true" /> Latest badge: <span className="font-semibold">{data.recentAchievement.title}</span> <span className="text-xs text-ink-3">{fmtDate(data.recentAchievement.earnedAt)}</span></p>
        )}
      </section>

      <PendingSync items={pending} session={session} />

      {/* Today's mission */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <SectionLabel>Today&apos;s mission</SectionLabel>
          {todayStatus && <StatusPill tone={todayStatus.tone === 'good' ? 'good' : todayStatus.tone === 'bad' ? 'warn' : 'neutral'}>{todayStatus.label}</StatusPill>}
        </div>
        {today ? (
          <button type="button" onClick={() => setSheet(true)} className="v-press v-block flex w-full items-center gap-3 p-4 text-left">
            <Target className="h-5 w-5 shrink-0 text-ink-2" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{today.mission.title}</span>
              <span className="mt-0.5 block text-xs text-ink-2">{today.mission.personalised ? `${today.mission.difficultyLabel} · ${rewardLine(today.mission.reward)}` : rewardLine(today.mission.reward)}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
          </button>
        ) : <Skeleton className="h-16 w-full rounded-2xl" />}
      </section>

      {/* Mission rewards, last 14 days */}
      {data.missions.days.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <SectionLabel>Mission rewards</SectionLabel>
            <span className="text-xs text-ink-3">{data.missions.kept} earned · last 14 days</span>
          </div>
          <ul className="v-block v-rows">
            {data.missions.days.map((d) => {
              const st = missionDayStatus(d.status);
              return (
                <li key={d.day} className="flex min-h-[56px] items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{d.title}</span>
                    <span className="block text-xs text-ink-3">{fmtDay(d.day)} · {d.difficultyLabel}{d.selfReported ? ' · self-reported' : ''}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <StatusPill tone={st.tone}>{st.label}</StatusPill>
                    <span className={`block text-xs ${d.status === 'earned' ? 'text-ink' : 'text-ink-3'}`}>{rewardLine(d.reward)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Elsewhere: challenges (Save-to-Earn) and goals, linked rather than repeated */}
      <section className="v-block v-rows">
        <Link to="/save-to-earn" className="v-press flex min-h-[56px] items-center gap-3 px-4 py-2.5">
          <Trophy className="h-5 w-5 shrink-0 text-ink-2" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Challenges</span>
            <span className="block truncate text-xs text-ink-3">
              {data.challenges.active.length ? `${data.challenges.active[0].title} · ${rewardLine(data.challenges.active[0].reward)} when completed` : `${data.challenges.completed} completed · Save-to-Earn`}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
        </Link>
        <Link to="/goals" className="v-press flex min-h-[56px] items-center gap-3 px-4 py-2.5">
          <PiggyBank className="h-5 w-5 shrink-0 text-ink-2" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Savings goals</span>
            <span className="block truncate text-xs text-ink-3">Milestones at 25, 50, 75 and 100%</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
        </Link>
      </section>

      {/* Levels */}
      <section>
        <button type="button" onClick={() => setShowLevels((v) => !v)} aria-expanded={showLevels} className="v-press flex min-h-[44px] w-full items-center justify-between">
          <SectionLabel>All levels</SectionLabel>
          <ChevronDown className={`h-4 w-4 text-ink-3 transition-transform motion-reduce:transition-none ${showLevels ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {showLevels && (
          <ol className="v-block v-rows">
            {level.levels.map((l) => (
              <li key={l.level} className="flex min-h-[48px] items-center gap-3 px-4 py-2">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${l.reached ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-3'}`}>{l.level}</span>
                <span className={`flex-1 text-sm ${l.reached ? 'font-medium text-ink' : 'text-ink-2'}`}>{l.name}</span>
                <span className="text-xs tabular-nums text-ink-3">{l.minXp.toLocaleString('en-IN')} XP</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Achievements */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <SectionLabel>Badges</SectionLabel>
          <span className="text-xs text-ink-3">{earned.length} of {data.achievements.length}</span>
        </div>
        <ul className="v-block v-rows">
          {[...earned, ...locked].map((b) => (
            <li key={b.key} className="flex min-h-[56px] items-center gap-3 px-4 py-2.5">
              {b.earned ? <Award className="h-5 w-5 shrink-0 text-warn" aria-hidden="true" /> : <Lock className="h-5 w-5 shrink-0 text-ink-3" aria-hidden="true" />}
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium ${b.earned ? 'text-ink' : 'text-ink-2'}`}>{b.title}</span>
                <span className="block text-xs text-ink-3">{b.earned ? b.desc : b.requirement}</span>
              </span>
              <span className="shrink-0 text-xs text-ink-3">{b.earned ? fmtDate(b.earnedAt) : 'Locked'}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* History */}
      <section>
        <SectionLabel className="mb-2">Reward history</SectionLabel>
        {history.events.length === 0 ? (
          <p className="text-sm text-ink-2">Rewards you earn appear here, with where they came from.</p>
        ) : (
          <>
            <ul className="v-block v-rows">
              {history.events.map((e) => {
                const st = eventStatus(e);
                return (
                  <li key={e.id} className="flex min-h-[56px] items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{e.title}</span>
                      <span className="block truncate text-xs text-ink-3">{e.detail}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={`block text-sm font-semibold tabular-nums ${e.points < 0 ? 'text-warn' : 'text-ink'}`}>{rewardLine({ xp: e.xp, points: e.points })}</span>
                      <span className="block text-[11px] text-ink-3">{st.label !== 'Confirmed' ? `${st.label} · ` : ''}{fmtDate(e.at)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {history.next && <SecondaryButton className="mt-3 w-full" onClick={more} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Show more'}</SecondaryButton>}
          </>
        )}
      </section>

      <AnimatePresence>{sheet && streak && <StreakSheet streak={streak} onClose={() => setSheet(false)} onChanged={load} />}</AnimatePresence>
    </div>
  );
}
