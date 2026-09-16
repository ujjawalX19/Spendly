import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, RefreshCw, RotateCcw, X } from 'lucide-react';
import { adminApi } from '../lib/api';
import { useAdminData } from '../lib/useAdminData';
import { Button, ErrorBanner, PageHeader, ReasonDialog, Select, Skeleton, Unavailable, fmtDate, fmtNumber, fmtRelative, selectClass } from '../components/ui';

const DEFAULTS = { days: '7', severity: 'all', category: 'all', state: 'open', type: '', route: '', from: '', to: '', page: '1' };
const PAGE_SIZE = 25;

const STATUS_STYLE = {
  open: 'bg-red-500/10 text-red-300',
  regressed: 'bg-amber-400/10 text-amber-300',
  resolved: 'bg-lime-400/10 text-lime-300',
};

export default function Errors() {
  const [params, setParams] = useSearchParams();
  const f = Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, params.get(k) || v]));
  const page = Math.max(1, Number(f.page) || 1);
  const [resolving, setResolving] = useState(null);
  const [reopening, setReopening] = useState(null);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState(null);

  const query = { ...f, page, pageSize: PAGE_SIZE };
  if (f.from || f.to) delete query.days;
  const { data: d, error, loading, reload } = useAdminData('/errors', { query, refreshMs: 60_000 });

  const update = (next) => {
    const merged = { ...f, page: '1', ...next };
    setParams(Object.fromEntries(Object.entries(merged).filter(([k, v]) => v && v !== DEFAULTS[k])), { replace: true });
  };
  const filtered = Object.keys(DEFAULTS).some((k) => k !== 'page' && f[k] !== DEFAULTS[k]);

  const resolve = async (reasonText) => {
    await adminApi('/errors/resolve', { method: 'POST', body: { fingerprint: resolving.fingerprint, ...(reasonText ? { note: reasonText } : {}) } });
    setResolving(null);
    setMessage('Marked resolved. It re-opens automatically if it happens again.');
    reload({ quiet: true });
  };
  const reopen = async (reason) => {
    await adminApi('/errors/reopen', { method: 'POST', body: { fingerprint: reopening.fingerprint, reason } });
    setReopening(null);
    setMessage('Issue re-opened.');
    reload({ quiet: true });
  };

  return (
    <>
      <PageHeader title="Error Center" subtitle="Backend errors grouped by type, endpoint, code and status · no request data is ever recorded">
        <Button variant="ghost" onClick={() => reload()} loading={loading}>{!loading && <RefreshCw className="h-4 w-4" aria-hidden />}Refresh</Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Select label="Status" value={f.state} onChange={(v) => update({ state: v })} options={[['open', 'Open & regressed'], ['regressed', 'Regressed'], ['resolved', 'Resolved'], ['all', 'All']]} />
        <Select label="Severity" value={f.severity} onChange={(v) => update({ severity: v })} options={[['all', 'Any severity'], ['error', 'Error'], ['warning', 'Warning']]} />
        <Select label="Category" value={f.category} onChange={(v) => update({ category: v })} options={[['all', 'Any category'], ['backend', 'Backend (5xx)'], ['ai', 'AI'], ['import', 'Imports'], ['job', 'Jobs'], ['account', 'Account'], ['other', 'Other']]} />
        <Select label="Error type" value={f.type} onChange={(v) => update({ type: v })} options={[['', 'Any type'], ...(d?.filterOptions?.types || []).map((x) => [x, x])]} />
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-zinc-500">Endpoint contains</span>
          <input list="error-routes" defaultValue={f.route} onKeyDown={(e) => { if (e.key === 'Enter') update({ route: e.currentTarget.value.trim() }); }} onBlur={(e) => { if (e.currentTarget.value.trim() !== f.route) update({ route: e.currentTarget.value.trim() }); }} placeholder="/api/expenses" className={`${selectClass} w-48`} />
          <datalist id="error-routes">{(d?.filterOptions?.routes || []).map((r) => <option key={r} value={r} />)}</datalist>
        </label>
        <Select label="Period" value={f.from || f.to ? 'custom' : f.days} onChange={(v) => v !== 'custom' && update({ days: v, from: '', to: '' })} options={[['1', 'Last 24 hours'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['custom', 'Custom dates']]} />
        <label className="flex flex-col gap-1"><span className="text-[11px] text-zinc-500">From</span><input type="date" value={f.from} max={f.to || undefined} onChange={(e) => update({ from: e.target.value })} className={`${selectClass} [color-scheme:dark]`} /></label>
        <label className="flex flex-col gap-1"><span className="text-[11px] text-zinc-500">To</span><input type="date" value={f.to} min={f.from || undefined} onChange={(e) => update({ to: e.target.value })} className={`${selectClass} [color-scheme:dark]`} /></label>
        {filtered && <Button variant="ghost" onClick={() => setParams({}, { replace: true })}><X className="h-4 w-4" aria-hidden />Clear</Button>}
      </div>

      <ErrorBanner error={error} onRetry={reload} />
      {message && <p role="status" className="mb-3 rounded-lg bg-lime-400/10 px-3 py-2 text-sm text-lime-200">{message}</p>}
      {d && !d.available && <Unavailable note={d.note} />}
      {d?.available && d.resolutionNote && <div className="mb-3"><Unavailable note={d.resolutionNote} /></div>}

      {d?.available && (
        <p className="mb-3 text-sm text-zinc-400">
          {fmtNumber(d.summary.occurrences)} occurrences in {fmtNumber(d.summary.issues)} issues · <span className="text-red-300">{fmtNumber(d.summary.open)} open</span> · {fmtNumber(d.summary.errors)} errors, {fmtNumber(d.summary.warnings)} warnings · {fmtDate(d.window.from)} – {fmtDate(d.window.to)}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-zinc-800/80 bg-zinc-900/60">
        <table className="w-full min-w-[1000px] text-sm">
          <thead>
            <tr className="border-b border-zinc-800/80 text-left text-[11px] uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Error</th>
              <th className="px-3 py-3 font-medium">Endpoint</th>
              <th className="px-3 py-3 font-medium">HTTP / code</th>
              <th className="px-3 py-3 text-right font-medium">Count</th>
              <th className="px-3 py-3 font-medium">First seen</th>
              <th className="px-3 py-3 font-medium">Last seen</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {loading && !d ? <tr><td colSpan={8} className="px-4 py-4"><Skeleton className="h-10" /></td></tr>
              : !d?.available ? null
                : d.issues.length === 0 ? <tr><td colSpan={8} className="px-4 py-12 text-center text-zinc-500">{f.state === 'open' ? 'No open issues in this period.' : 'No issues match these filters.'}</td></tr>
                  : d.issues.map((i) => (
                    <tr key={i.fingerprint} className="align-top">
                      <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[i.status]}`}>{i.status}</span>
                        {i.resolution && <p className="mt-1 max-w-[160px] text-[11px] text-zinc-500" title={i.resolution.note || ''}>by {i.resolution.by} {fmtRelative(i.resolution.at)}{i.resolution.note ? ` · “${i.resolution.note}”` : ''}</p>}
                      </td>
                      <td className="px-3 py-3"><p className="font-mono text-xs text-zinc-200">{i.type}</p><p className={`text-[11px] ${i.severity === 'error' ? 'text-red-300/80' : 'text-amber-300/80'}`}>{i.severity} · {i.category}</p></td>
                      <td className="px-3 py-3 font-mono text-xs text-zinc-400">{i.route || '—'}</td>
                      <td className="px-3 py-3 font-mono text-xs text-zinc-300">{[i.statusCode, i.code].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="px-3 py-3 text-right tabular text-zinc-100">{fmtNumber(i.count)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-zinc-400">{fmtDate(i.firstSeenAt)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-zinc-400" title={fmtDate(i.lastSeenAt)}>{fmtRelative(i.lastSeenAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {i.status === 'resolved'
                          ? <Button variant="ghost" onClick={() => setReopening(i)} disabled={!d.resolutionAvailable}><RotateCcw className="h-4 w-4" aria-hidden />Re-open</Button>
                          : <Button variant="secondary" onClick={() => { setNote(''); setResolving(i); }} disabled={!d.resolutionAvailable}><CheckCircle2 className="h-4 w-4" aria-hidden />Resolve</Button>}
                      </td>
                    </tr>
                  ))}
          </tbody>
        </table>
      </div>

      {d?.available && (
        <div className="mt-4 flex items-center justify-between text-sm text-zinc-500">
          <span>{fmtNumber(d.pagination.total)} issues · page {page}</span>
          <div className="flex gap-2">
            <Button variant="ghost" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}><ChevronLeft className="h-4 w-4" aria-hidden />Previous</Button>
            <Button variant="ghost" disabled={!d.pagination.hasMore} onClick={() => update({ page: String(page + 1) })}>Next<ChevronRight className="h-4 w-4" aria-hidden /></Button>
          </div>
        </div>
      )}
      {d?.privacy && <p className="mt-3 text-xs text-zinc-600">{d.privacy}</p>}

      <ResolveDialog issue={resolving} note={note} setNote={setNote} onCancel={() => setResolving(null)} onConfirm={resolve} />
      <ReasonDialog
        open={Boolean(reopening)}
        title="Re-open issue"
        description={reopening ? `${reopening.type} on ${reopening.route || 'no route'}` : ''}
        confirmLabel="Re-open"
        onCancel={() => setReopening(null)}
        onConfirm={reopen}
      />
    </>
  );
}

/** Resolving needs confirmation; a note is optional and goes to the audit log. */
function ResolveDialog({ issue, note, setNote, onCancel, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  if (!issue) return null;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try { await onConfirm(note.trim()); } catch (x) { setErr(x); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="resolve-title">
      <div className="absolute inset-0 bg-black/70" onClick={() => !busy && onCancel()} />
      <form onSubmit={submit} className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <h3 id="resolve-title" className="text-lg font-semibold text-zinc-50">Mark issue resolved?</h3>
        <p className="mt-2 text-sm text-zinc-400"><span className="font-mono text-zinc-300">{issue.type}</span> on <span className="font-mono">{issue.route || '—'}</span> · {issue.count} occurrence(s). Recorded events are not changed; the issue re-opens if it occurs again.</p>
        <label htmlFor="resolve-note" className="mb-1.5 mt-4 block text-xs font-medium text-zinc-400">Note (optional, recorded in the audit log)</label>
        <textarea id="resolve-note" value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-lime-400 focus:outline-none" placeholder="e.g. Fixed in commit abc1234" />
        {err && <p className="mt-3 text-sm text-red-300">{err.message}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>Mark resolved</Button>
        </div>
      </form>
    </div>
  );
}
