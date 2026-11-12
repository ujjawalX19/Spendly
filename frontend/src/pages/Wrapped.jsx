/**
 * Money Wrapped — a month or year in plain figures, from the person's own
 * expenses. Sharing is their choice and sends only counts (the server's
 * `share` object): no amounts, categories or merchants.
 */
import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { ChevronLeft, ChevronRight, Share2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiJson } from '../lib/apiConfig';
import { ErrorState, Skeleton } from '../components/ui';
import BackButton from '../components/BackButton';
import AskVittova from '../components/AskVittova';

const inr = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const fmtDay = (key) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', timeZone: 'UTC' });

export function wrappedShareText(share) {
  return `My ${share.label} on Vittova: ${share.expenseCount} expenses tracked, ${share.activeDays} days logged and ${share.noSpendDays} no-spend days.`;
}

function Stat({ label, value, sub }) {
  return (
    <div className="v-block p-4">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-2">{sub}</p>}
    </div>
  );
}

export default function Wrapped() {
  const { session } = useAuth();
  const [period, setPeriod] = useState('month');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setFailed(false);
    setData(null);
    try {
      setData((await apiJson(`/planning/wrapped?period=${period}&offset=${offset}`, { session })).wrapped);
    } catch {
      setFailed(true);
    }
  }, [session, period, offset]);
  useEffect(() => { load(); }, [load]);

  const share = async () => {
    const text = wrappedShareText(data.share);
    setNote('');
    try {
      if (Capacitor.isNativePlatform()) {
        const { Share } = await import('@capacitor/share');
        await Share.share({ text, dialogTitle: 'Share your summary' });
      } else if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        setNote('Copied. Only counts are included, never amounts.');
      }
    } catch (err) {
      if (!/cancel|abort/i.test(`${err?.name} ${err?.message}`)) setNote("We couldn't share that.");
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 pb-24 md:p-6">
      <BackButton />
      <h1 className="text-2xl font-bold text-ink">Money Wrapped</h1>
      <div role="group" aria-label="Summary period" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
        {[['month', 'Month'], ['year', 'Year']].map(([id, label]) => (
          <button key={id} type="button" aria-pressed={period === id} onClick={() => { setPeriod(id); setOffset(0); }} className={`min-h-[40px] rounded-lg text-sm font-medium ${period === id ? 'bg-surface text-ink' : 'text-ink-2'}`}>{label}</button>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <button type="button" aria-label="Previous period" onClick={() => setOffset((o) => o + 1)} className="v-press flex h-11 w-11 items-center justify-center rounded-full text-ink-2"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
        <p className="text-sm font-semibold text-ink" aria-live="polite">{data?.label || ' '}</p>
        <button type="button" aria-label="Next period" disabled={offset === 0} onClick={() => setOffset((o) => o - 1)} className="v-press flex h-11 w-11 items-center justify-center rounded-full text-ink-2 disabled:opacity-30"><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
      </div>
      {failed && <ErrorState onRetry={load} message="We couldn't build your summary. Your data wasn't changed." />}
      {!failed && !data && <Skeleton className="h-64 w-full" />}
      {data && !data.eligible && (
        <p className="v-block p-4 text-sm text-ink-soft">A summary needs at least {data.needed} expenses in the period. You have {data.expenseCount} so far.</p>
      )}
      {data?.eligible && (
        <>
          <Stat label="Total spent" value={inr(data.totalSpent)} sub={`${data.expenseCount} expenses`} />
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Days logged" value={data.activeDays} />
            <Stat label="No-spend days" value={data.noSpendDays} />
          </div>
          <Stat label="Top category" value={data.topCategory.name} sub={`${inr(data.topCategory.amount)}, ${data.topCategory.share}% of spending`} />
          <Stat label="Biggest day" value={inr(data.biggestDay.amount)} sub={fmtDay(data.biggestDay.date)} />
          {data.regular && <Stat label="Most frequent" value={data.regular.name} sub={`${data.regular.count} times`} />}
          {data.saved > 0 && <Stat label="Money-Saved" value={inr(data.saved)} sub="As you recorded it" />}
          <button type="button" onClick={share} className="v-press v-btn-secondary min-h-[48px] w-full"><Share2 className="h-4 w-4" aria-hidden="true" /> Share (counts only, no amounts)</button>
          {note && <p role="status" className="text-center text-xs text-ink-2">{note}</p>}
          <AskVittova screen="wrapped" question={period === 'year' ? 'How did I do this year, and what should I change?' : 'Give me a monthly summary'} label="Ask Vittova what this means" />
        </>
      )}
    </div>
  );
}
