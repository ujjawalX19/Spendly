/**
 * Reports — a week, month or year from the person's own records, with income
 * they entered themselves and a CSV to take away. All from
 * GET /api/planning/report; the page does no sums of its own.
 */
import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileText, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiJson, authHeaders, apiUrl } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';
import { markStep } from '../lib/homePrefs';
import { saveCsv, savePdf } from '../lib/saveCsv';
import { ErrorState, Skeleton } from '../components/ui';
import BackButton from '../components/BackButton';
import AskVittova from '../components/AskVittova';

const PERIODS = [['week', 'Week'], ['month', 'Month'], ['year', 'Year']];
const SOURCES = ['Salary', 'Freelance', 'Family', 'Refund', 'Other'];
const inr = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

function IncomeForm({ onAdded, onCancel }) {
  const { session } = useAuth();
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('Salary');
  const [date, setDate] = useState(todayKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const field = 'min-h-[44px] w-full rounded-xl border border-line-strong bg-surface-2 px-3 text-ink';
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiJson('/planning/income', { session, method: 'POST', body: { amount_inr: Number(amount), source, received_on: date } });
      onAdded();
    } catch (err) {
      setError(friendlyError(err, "We couldn't save that. Please try again."));
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="mt-3 space-y-3 border-t border-line pt-3">
      <div>
        <label htmlFor="income-amount" className="mb-1 block text-xs font-medium text-ink-2">Amount (₹)</label>
        <input id="income-amount" type="number" inputMode="numeric" min="1" step="1" required autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} className={field} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="income-source" className="mb-1 block text-xs font-medium text-ink-2">Type</label>
          <select id="income-source" value={source} onChange={(e) => setSource(e.target.value)} className={field}>
            {SOURCES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="income-date" className="mb-1 block text-xs font-medium text-ink-2">Received on</label>
          <input id="income-date" type="date" required max={todayKey()} value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        </div>
      </div>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="v-press v-btn-primary min-h-[44px] px-4 text-sm disabled:opacity-60">{busy ? 'Saving…' : 'Save income'}</button>
        <button type="button" onClick={onCancel} className="v-press v-btn-secondary">Cancel</button>
      </div>
    </form>
  );
}

export default function Reports() {
  const { session } = useAuth();
  const [period, setPeriod] = useState('month');
  const [offset, setOffset] = useState(0);
  const [report, setReport] = useState(null);
  const [income, setIncome] = useState([]);
  const [failed, setFailed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => { markStep('report'); }, []);

  const load = useCallback(async () => {
    setFailed(false);
    setReport(null);
    try {
      const r = await apiJson(`/planning/report?period=${period}&offset=${offset}`, { session });
      setReport(r.report);
      if (r.report.incomeAvailable) {
        const list = await apiJson('/planning/income', { session });
        setIncome(list.income);
      }
    } catch {
      setFailed(true);
    }
  }, [session, period, offset]);
  useEffect(() => { load(); }, [load]);

  const exportCsv = async () => {
    setNote('');
    try {
      const res = await fetch(apiUrl(`/planning/report.csv?period=${period}&offset=${offset}`), { headers: authHeaders(session, { json: false }) });
      if (!res.ok) throw new Error('export');
      await saveCsv(`vittova-report-${period}-${todayKey()}.csv`, await res.text(), 'Vittova report');
    } catch {
      setNote("We couldn't export this report. Please try again.");
    }
  };

  const exportPdf = async () => {
    setNote('');
    try {
      const res = await fetch(apiUrl(`/planning/report.pdf?period=${period}&offset=${offset}`), { headers: authHeaders(session, { json: false }) });
      if (res.status === 403) { setNote('PDF reports are part of Vittova Pro. CSV export is free.'); return; }
      if (!res.ok) throw new Error('export');
      await savePdf(`vittova-report-${period}-${todayKey()}.pdf`, await res.blob(), 'Vittova report');
    } catch {
      setNote("We couldn't create the PDF. Please try again.");
    }
  };

  const removeIncome = async (id) => {
    setNote('');
    try {
      await apiJson(`/planning/income/${id}`, { session, method: 'DELETE' });
      load();
    } catch (err) {
      setNote(friendlyError(err, "We couldn't remove that."));
    }
  };

  const empty = report && report.expenseCount === 0 && report.incomeCount === 0;
  const biggest = report?.categories.find((c) => c.amount > 0);

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 pb-24 md:p-6">
      <BackButton />
      <h1 className="text-2xl font-bold text-ink">Reports</h1>

      <div role="group" aria-label="Report period" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
        {PERIODS.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={period === id} onClick={() => { setPeriod(id); setOffset(0); }}
            className={`min-h-[40px] rounded-lg text-sm font-medium ${period === id ? 'bg-surface text-ink' : 'text-ink-2'}`}>{label}</button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button type="button" aria-label="Previous period" onClick={() => setOffset((o) => o + 1)} className="v-press flex h-11 w-11 items-center justify-center rounded-full text-ink-2"><ChevronLeft className="h-5 w-5" aria-hidden="true" /></button>
        <p className="text-sm font-semibold text-ink" aria-live="polite">{report?.label || ' '}</p>
        <button type="button" aria-label="Next period" disabled={offset === 0} onClick={() => setOffset((o) => o - 1)} className="v-press flex h-11 w-11 items-center justify-center rounded-full text-ink-2 disabled:opacity-30"><ChevronRight className="h-5 w-5" aria-hidden="true" /></button>
      </div>

      {failed && <ErrorState onRetry={load} message="We couldn't build this report. Your data wasn't changed." />}
      {!failed && !report && <Skeleton className="h-64 w-full" />}

      {report && (
        <>
          {report.expenseCount >= 5 && <AskVittova screen="reports" question={period === 'week' ? 'Why did I spend more this week?' : 'Give me a monthly summary'} label="Ask Vittova to explain this" />}
          <section className="v-block p-4" aria-label="Summary">
            <p className="v-label">Spent</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-ink">{inr(report.totalSpent)}</p>
            <p className="mt-1 text-xs text-ink-3">{report.expenseCount} expense{report.expenseCount === 1 ? '' : 's'}{report.monthlyBudget ? ` · budget ${inr(report.monthlyBudget)}` : ''}</p>
            {report.incomeCount > 0 && (
              <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm">
                <div><dt className="text-xs text-ink-3">Income you entered</dt><dd className="font-semibold tabular-nums text-ink">{inr(report.totalIncome)}</dd></div>
                <div><dt className="text-xs text-ink-3">Income minus spending</dt><dd className={`font-semibold tabular-nums ${report.net < 0 ? 'text-danger' : 'text-ink'}`}>{report.net < 0 ? '−' : ''}{inr(Math.abs(report.net))}</dd></div>
              </dl>
            )}
          </section>

          {empty && <p className="px-1 text-sm text-ink-2">Nothing recorded for this period yet. Expenses you add will appear here.</p>}
          {biggest && <p className="px-1 text-sm text-ink-2"><span className="font-medium text-ink">{biggest.category}</span> took the largest share: {biggest.share}% of your spending.</p>}

          {report.categories.length > 0 && (
            <section aria-labelledby="by-category">
              <h2 id="by-category" className="v-label mb-2 px-1">By category</h2>
              <ul className="v-block v-rows px-4">
                {report.categories.map((c) => (
                  <li key={c.category} className="py-3">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium text-ink">{c.category}</span>
                      <span className="tabular-nums text-ink">{inr(c.amount)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                      <div className={`h-full rounded-full ${c.over ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${c.share}%` }} />
                    </div>
                    <p className={`mt-1 text-xs ${c.over ? 'font-semibold text-danger' : 'text-ink-3'}`}>
                      {c.share}% · {c.count} expense{c.count === 1 ? '' : 's'}{c.limit != null ? ` · limit ${inr(c.limit)}${c.over ? ' (over)' : ''}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {report.incomeAvailable && (
            <section className="v-block p-4" aria-labelledby="income-title">
              <div className="flex items-center justify-between gap-3">
                <h2 id="income-title" className="text-[15px] font-semibold text-ink">Income</h2>
                {!adding && <button type="button" onClick={() => setAdding(true)} className="v-press v-btn-secondary"><Plus className="h-4 w-4" aria-hidden="true" /> Add</button>}
              </div>
              <p className="mt-1 text-xs text-ink-3">Optional, and only what you enter here. Vittova can't see your bank balance.</p>
              {adding && <IncomeForm onCancel={() => setAdding(false)} onAdded={() => { setAdding(false); load(); }} />}
              {income.length > 0 && (
                <ul className="v-rows mt-2">
                  {income.slice(0, 10).map((i) => (
                    <li key={i.id} className="flex min-h-[48px] items-center justify-between gap-2 text-sm">
                      <span className="min-w-0"><span className="block font-medium text-ink">{inr(i.amount_inr)} · {i.source}</span><span className="block text-xs text-ink-3">{i.received_on}</span></span>
                      <button type="button" aria-label={`Remove ${inr(i.amount_inr)} ${i.source} income`} onClick={() => removeIncome(i.id)} className="flex h-11 w-11 shrink-0 items-center justify-center text-ink-3"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {note && <p role="alert" className="px-1 text-sm text-danger">{note}</p>}
          <button type="button" onClick={exportCsv} disabled={empty} className="v-press v-btn-secondary min-h-[48px] w-full disabled:opacity-50"><Download className="h-4 w-4" aria-hidden="true" /> Export this report (CSV)</button>
          <button type="button" onClick={exportPdf} disabled={empty} className="v-press v-btn-secondary min-h-[48px] w-full disabled:opacity-50"><FileText className="h-4 w-4" aria-hidden="true" /> Download PDF (Pro)</button>
        </>
      )}
    </div>
  );
}
