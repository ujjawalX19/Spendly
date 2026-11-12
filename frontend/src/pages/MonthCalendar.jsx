/**
 * Month Calendar (Pro) — each day's spending, bills due and goal dates, from
 * GET /api/planning/calendar. A free user sees what it is and a way to Pro,
 * never an empty month that looks like real data.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiJson } from '../lib/apiConfig';
import { ErrorState, Skeleton } from '../components/ui';
import BackButton from '../components/BackButton';
import AskVittova from '../components/AskVittova';

const inr = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const thisMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(new Date());

function shift(month, by) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
const monthName = (month) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayName = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

export default function MonthCalendar() {
  const { session } = useAuth();
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');
  const [picked, setPicked] = useState(null);

  const load = useCallback(async () => {
    setState('loading');
    setPicked(null);
    try {
      const r = await apiJson(`/planning/calendar?month=${month}`, { session });
      setData(r.calendar);
      setState('ready');
    } catch (err) {
      setState(err.status === 403 ? 'pro' : 'failed');
    }
  }, [session, month]);
  useEffect(() => { load(); }, [load]);

  if (state === 'pro') {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-4 pb-24 md:p-6">
      <BackButton />
        <h1 className="text-2xl font-bold text-ink">Month Calendar</h1>
        <section className="v-block p-4">
          <p className="text-sm leading-relaxed text-ink-soft">See each day's spending, the bills due and your goal dates in one view. The Month Calendar is part of Vittova Pro.</p>
          <Link to="/pro" className="v-press v-btn-primary mt-3 inline-flex min-h-[44px] items-center px-4 text-sm no-underline">See Vittova Pro</Link>
        </section>
      </div>
    );
  }

  const lead = data ? (new Date(`${data.days[0].date}T12:00:00Z`).getUTCDay() + 6) % 7 : 0;
  const day = picked && data ? data.days.find((d) => d.date === picked) : null;

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 pb-24 md:p-6">
      <BackButton />
      <h1 className="text-2xl font-bold text-ink">Month Calendar</h1>
      <div className="flex items-center justify-between">
        <button type="button" aria-label="Previous month" onClick={() => setMonth((m) => shift(m, -1))} className="v-press flex h-11 w-11 items-center justify-center rounded-full text-ink-2"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
        <p className="text-sm font-semibold text-ink" aria-live="polite">{monthName(month)}</p>
        <button type="button" aria-label="Next month" onClick={() => setMonth((m) => shift(m, 1))} className="v-press flex h-11 w-11 items-center justify-center rounded-full text-ink-2"><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
      </div>
      {state === 'failed' && <ErrorState onRetry={load} message="We couldn't load your calendar. Your data wasn't changed." />}
      {state === 'loading' && <Skeleton className="h-80 w-full" />}
      {state === 'ready' && data && (
        <>
          <dl className="v-block grid grid-cols-2 gap-3 p-4 text-sm">
            <div><dt className="text-xs text-ink-3">Spent</dt><dd className="font-semibold tabular-nums text-ink">{inr(data.totalSpent)}</dd></div>
            <div><dt className="text-xs text-ink-3">Bills in the month</dt><dd className="font-semibold tabular-nums text-ink">{inr(data.totalBills)}</dd></div>
          </dl>
          <div className="v-block p-2">
            <div className="grid grid-cols-7 text-center text-[11px] text-ink-3" aria-hidden="true">{WEEK.map((w, i) => <span key={i} className="py-1">{w}</span>)}</div>
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: lead }).map((_, i) => <span key={`lead-${i}`} />)}
              {data.days.map((d) => {
                const n = Number(d.date.slice(8));
                const marks = [d.spent > 0 && `${inr(d.spent)} spent`, d.bills.length > 0 && `${d.bills.length} bill due`, d.goals.length > 0 && 'goal date'].filter(Boolean).join(', ');
                return (
                  <button key={d.date} type="button" aria-pressed={picked === d.date} aria-label={`${dayName(d.date)}${marks ? `: ${marks}` : ''}`} onClick={() => setPicked(d.date)}
                    className={`flex min-h-[48px] flex-col items-center justify-start rounded-lg py-1 ${picked === d.date ? 'bg-surface-3' : ''}`}>
                    <span className="text-xs text-ink">{n}</span>
                    {d.spent > 0 && <span className="max-w-full truncate text-[9px] tabular-nums text-ink-2">{Math.round(d.spent).toLocaleString('en-IN')}</span>}
                    <span className="mt-0.5 flex gap-0.5" aria-hidden="true">
                      {d.bills.length > 0 && <span className="h-1 w-1 rounded-full bg-warn" />}
                      {d.goals.length > 0 && <span className="h-1 w-1 rounded-full bg-accent" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="px-1 text-xs text-ink-3"><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-warn" aria-hidden="true" />Bill due <span className="ml-3 mr-1 inline-block h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />Goal date</p>
          {day && (
            <section className="v-block p-4" aria-live="polite">
              <h2 className="text-[15px] font-semibold text-ink">{dayName(day.date)}</h2>
              <p className="mt-1 text-sm text-ink-2">{day.expenses ? `${inr(day.spent)} across ${day.expenses} expense${day.expenses === 1 ? '' : 's'}` : 'No expenses recorded'}</p>
              {day.bills.map((b) => <p key={b.name} className="mt-1 text-sm text-ink-soft">Bill: {b.name}, {inr(b.amount)}</p>)}
              {day.goals.map((g) => <p key={g} className="mt-1 text-sm text-ink-soft">Goal date: {g}</p>)}
            </section>
          )}
          {data.totalBills > 0 && <AskVittova screen="calendar" question="What bills are coming up, and will I have enough for them?" />}
        </>
      )}
    </div>
  );
}
