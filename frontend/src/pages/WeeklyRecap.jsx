/**
 * Weekly recap (v1.14) — one week of missions, XP, Points, streak days,
 * budget, spending changes, savings and badges, and one thing to focus on.
 *
 * Everything comes from GET /api/rewards/recap. Spending is compared with
 * the week before only when both weeks have enough logged days; otherwise the
 * screen says the comparison is unavailable instead of guessing.
 *
 * Sharing is opt-in: the card is previewed first and holds only counts, XP,
 * Points, the best run, the level and a plain-words budget result. No
 * amounts, categories, merchants or goal names.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Share2, Award, Target } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiJson } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';
import { inr } from '../lib/moneyDisplay';
import { shareCardText } from '../lib/rewardsDisplay';
import { drawRecapCard, shareRecapCard } from '../lib/recapCard';
import { ErrorState, PrimaryButton, SectionLabel, Skeleton, StatusPill } from '../components/ui';

const STATUS = {
  kept: { tone: 'good', label: 'Kept' },
  missed: { tone: 'neutral', label: 'Not kept' },
  in_progress: { tone: 'neutral', label: 'Today' },
};
const dayName = (key) => new Date(`${key}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' });

function Stat({ label, value, hint }) {
  return (
    <div>
      <p className="text-xs text-ink-2">{label}</p>
      <p className="mt-1 text-[22px] font-semibold leading-none tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-ink-3">{hint}</p>}
    </div>
  );
}

export default function WeeklyRecap() {
  const { session } = useAuth();
  const [params, setParams] = useSearchParams();
  const week = params.get('week') || '';
  const [recap, setRecap] = useState(null);
  const [error, setError] = useState('');
  const [showCard, setShowCard] = useState(false);
  const [preview, setPreview] = useState('');
  const [shareNote, setShareNote] = useState('');
  const canvas = useRef(null);

  const load = useCallback(async () => {
    setError('');
    setRecap(null);
    try {
      const r = await apiJson(week ? `/rewards/recap?week=${encodeURIComponent(week)}` : '/rewards/recap', { session });
      setRecap(r.recap);
    } catch (err) {
      setError(friendlyError(err, "We couldn't load your weekly recap."));
    }
  }, [session, week]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!showCard || !recap) return;
    const c = canvas.current || document.createElement('canvas');
    canvas.current = c;
    drawRecapCard(c, recap.share);
    setPreview(c.toDataURL('image/png'));
  }, [showCard, recap]);

  const share = async () => {
    setShareNote('');
    const outcome = await shareRecapCard(canvas.current, shareCardText(recap.share));
    if (outcome === 'downloaded') setShareNote('Image saved to your downloads.');
    else if (outcome === 'failed') setShareNote("Sharing didn't work on this device.");
  };

  if (error) return <div className="pt-10"><ErrorState onRetry={load} message={error} /></div>;
  if (!recap) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading weekly recap">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  const go = (key) => setParams(key ? { week: key } : {});

  return (
    <div className="space-y-6 pb-6 text-ink">
      <header>
        <h1 className="text-2xl font-bold">Weekly recap</h1>
        <div className="mt-2 flex items-center justify-between gap-2">
          <button type="button" onClick={() => go(recap.previousWeek)} disabled={!recap.previousWeek} aria-label="Previous week"
            className="v-press flex h-11 w-11 items-center justify-center rounded-full bg-surface text-ink-2 disabled:opacity-40"><ChevronLeft className="h-5 w-5" /></button>
          <p className="text-sm font-semibold">{recap.week.label}{recap.week.complete ? '' : ' · so far'}</p>
          <button type="button" onClick={() => go(recap.nextWeek)} disabled={!recap.nextWeek} aria-label="Next week"
            className="v-press flex h-11 w-11 items-center justify-center rounded-full bg-surface text-ink-2 disabled:opacity-40"><ChevronRight className="h-5 w-5" /></button>
        </div>
      </header>

      <section className="v-block p-4" aria-label="The week in numbers">
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Missions kept" value={`${recap.missions.kept}/${recap.missions.counted || recap.missions.days.length}`} hint={recap.missions.inProgress ? 'Today still counts' : null} />
          <Stat label="Best run" value={`${recap.streak.bestRun}`} hint={recap.streak.bestRun === 1 ? 'day' : 'days in a row'} />
          <Stat label="XP earned" value={`+${recap.xp.earned}`} />
          <Stat label="Points earned" value={recap.pointsAvailable ? `+${recap.points.earned}` : '–'} hint={recap.points.reversed ? `${recap.points.reversed} reversed` : null} />
        </div>
        {/* Seven equal columns: the circles shrink to fit narrow phones and large text. */}
        <ol className="mt-4 grid grid-cols-7 gap-1 border-t border-line pt-4" aria-label="Days">
          {recap.missions.days.map((d) => {
            const st = STATUS[d.status] || STATUS.missed;
            return (
              <li key={d.dateKey} className="flex min-w-0 flex-col items-center gap-1">
                <span className={`flex aspect-square w-full max-w-8 items-center justify-center rounded-full text-xs font-bold ${d.status === 'kept' ? 'bg-flame text-on-fill' : 'bg-surface-3 text-ink-3'}`} aria-label={`${dayName(d.dateKey)}: ${st.label}`}>{d.status === 'kept' ? '✓' : '–'}</span>
                <span className="text-[10px] font-semibold text-ink-3">{dayName(d.dateKey)}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between"><SectionLabel>Budget</SectionLabel><StatusPill tone={recap.budget.status === 'over' ? 'warn' : recap.budget.status === 'not_enough_logging' ? 'neutral' : 'good'}>{recap.budget.words}</StatusPill></div>
        <div className="v-block p-4 text-sm text-ink-2">
          <p><span className="font-mono-finance font-semibold text-ink">{inr(recap.budget.spent)}</span> spent of a <span className="font-mono-finance">{inr(recap.budget.limit)}</span> weekly plan · logged on {recap.budget.activeDays} day{recap.budget.activeDays === 1 ? '' : 's'}</p>
        </div>
      </section>

      <section>
        <SectionLabel className="mb-2">Compared with the week before</SectionLabel>
        <div className="v-block p-4">
          {!recap.categories.available ? (
            <p className="text-sm text-ink-2">Unavailable. {recap.categories.reason}</p>
          ) : recap.categories.changes.length === 0 ? (
            <p className="text-sm text-ink-2">About the same as the week before.</p>
          ) : (
            <ul className="space-y-2">
              {recap.categories.changes.map((c) => (
                <li key={c.category} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink">{c.category}</span>
                  <span className={`font-mono-finance ${c.change > 0 ? 'text-warn' : 'text-accent'}`}>{c.change > 0 ? '+' : '−'}{inr(Math.abs(c.change))}{c.percent !== null ? ` (${c.percent > 0 ? '+' : ''}${c.percent}%)` : ''}</span>
                </li>
              ))}
              {!recap.week.complete && <li className="text-xs text-ink-3">Compared with the same {recap.categories.comparedDays} days of the week before.</li>}
            </ul>
          )}
        </div>
      </section>

      {(recap.savings.goals.length > 0 || recap.savings.addedInr > 0) && (
        <section>
          <SectionLabel className="mb-2">Savings</SectionLabel>
          <div className="v-block p-4 text-sm">
            <p className="text-ink-2">Put aside this week: <span className="font-mono-finance font-semibold text-ink">{inr(recap.savings.addedInr)}</span> <span className="text-xs text-ink-3">(self-reported)</span></p>
            <ul className="mt-2 space-y-1.5">
              {recap.savings.goals.map((g) => <li key={g.id} className="flex justify-between text-ink-2"><span className="truncate">{g.name}</span><span className="tabular-nums text-ink">{g.percent}%</span></li>)}
            </ul>
          </div>
        </section>
      )}

      {recap.achievements.length > 0 && (
        <section>
          <SectionLabel className="mb-2">Badges this week</SectionLabel>
          <ul className="v-block v-rows">
            {recap.achievements.map((b) => <li key={b.key} className="flex min-h-[48px] items-center gap-3 px-4 py-2 text-sm"><Award className="h-4 w-4 text-warn" aria-hidden="true" /> {b.title}</li>)}
          </ul>
        </section>
      )}

      <section>
        <SectionLabel className="mb-2">Next week</SectionLabel>
        <div className="v-block flex gap-3 p-4">
          <Target className="mt-0.5 h-5 w-5 shrink-0 text-ink-2" aria-hidden="true" />
          <div>
            <p className="font-semibold text-ink">{recap.focus.title}</p>
            <p className="mt-1 text-sm text-ink-2">{recap.focus.detail}</p>
          </div>
        </div>
      </section>

      <section>
        <SectionLabel className="mb-2">Share</SectionLabel>
        {!showCard ? (
          <div className="v-block p-4">
            <p className="text-sm text-ink-2">Make an image of your week to share. It shows missions, XP, Points, your best run, your level and whether you stayed within plan. No amounts, categories or goal names.</p>
            <PrimaryButton className="mt-3" onClick={() => setShowCard(true)}><Share2 className="h-4 w-4" aria-hidden="true" /> Preview share card</PrimaryButton>
          </div>
        ) : (
          <div className="v-block p-4">
            {preview ? <img src={preview} alt={`Share card: ${recap.share.title}. ${recap.share.stats.map((s) => `${s.label} ${s.value}`).join(', ')}.`} className="mx-auto w-full max-w-[320px] rounded-xl" /> : <Skeleton className="mx-auto h-[400px] w-[320px]" />}
            <PrimaryButton className="mt-3" onClick={share}><Share2 className="h-4 w-4" aria-hidden="true" /> Share</PrimaryButton>
            {shareNote && <p role="status" className="mt-2 text-xs text-ink-2">{shareNote}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
