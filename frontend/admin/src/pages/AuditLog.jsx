import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAdminData } from '../lib/useAdminData';
import { Button, ErrorBanner, PageHeader, Skeleton, fmtDate } from '../components/ui';

const ACTIONS = [
  ['', 'All actions'],
  ['admin_login', 'Console sign-in'],
  ['user_viewed', 'User viewed'],
  ['user_suspended', 'User suspended'],
  ['user_reinstated', 'User reinstated'],
  ['pro_granted', 'Pro granted'],
  ['pro_extended', 'Pro extended'],
  ['pro_revoked', 'Pro revoked'],
  ['error_resolved', 'Error resolved'],
  ['error_reopened', 'Error re-opened'],
  ['admin_access_denied', 'Access denied'],
];
const PAGE_SIZE = 50;

/** Render audit details without dumping raw JSON: reason first, then parameters. */
function Details({ details }) {
  if (!details || Object.keys(details).length === 0) return <span className="text-zinc-600">—</span>;
  const { reason, previous, ...rest } = details;
  return (
    <div className="space-y-0.5">
      {reason && <p className="text-zinc-300">“{reason}”</p>}
      {Object.entries(rest).map(([k, v]) => (
        <p key={k} className="text-zinc-500"><span className="text-zinc-600">{k}:</span> {v === null ? 'none' : String(v)}</p>
      ))}
      {previous && <p className="text-zinc-600">previous: {previous.isPro ? `Pro${previous.expiresAt ? ` until ${fmtDate(previous.expiresAt, { time: false })}` : ', no expiry'}` : 'free'}</p>}
    </div>
  );
}

export default function AuditLog() {
  const [params, setParams] = useSearchParams();
  const action = params.get('action') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const { data, error, loading, reload } = useAdminData('/audit-log', { query: { action, page, pageSize: PAGE_SIZE } });

  const setQuery = (next) => setParams(Object.fromEntries(Object.entries({ action, page: '1', ...next }).filter(([k, v]) => v && !(k === 'page' && v === '1'))), { replace: true });

  return (
    <>
      <PageHeader title="Audit log" subtitle="Every admin action and refused access attempt. Append-only.">
        <select value={action} onChange={(e) => setQuery({ action: e.target.value })} aria-label="Filter by action"
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus:border-lime-400 focus:outline-none">
          {ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </PageHeader>

      <ErrorBanner error={error} onRetry={reload} />

      <div className="overflow-x-auto rounded-2xl border border-zinc-800/80 bg-zinc-900/60">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-zinc-800/80 text-left text-[11px] uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-3 py-3 font-medium">Action</th>
              <th className="px-3 py-3 font-medium">Actor</th>
              <th className="px-3 py-3 font-medium">Target</th>
              <th className="px-3 py-3 font-medium">Details</th>
              <th className="px-4 py-3 font-medium">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {loading && !data ? (
              <tr><td colSpan={6} className="px-4 py-4"><Skeleton className="h-10" /></td></tr>
            ) : data?.entries.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-zinc-500">No entries.</td></tr>
            ) : data?.entries.map((e) => (
              <tr key={e.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-400">{fmtDate(e.at)}</td>
                <td className="px-3 py-3 font-mono text-xs">
                  <span className={e.action === 'admin_access_denied' || e.action.endsWith('_failed') ? 'text-red-300' : 'text-zinc-200'}>{e.action}</span>
                </td>
                <td className="max-w-[200px] truncate px-3 py-3 font-mono text-xs text-zinc-400">{e.actor || '—'}</td>
                <td className="px-3 py-3 font-mono text-xs">
                  {e.targetUserId ? <Link to={`/users/${e.targetUserId}`} className="text-zinc-300 hover:text-lime-300">{e.targetUserId.slice(0, 8)}…</Link> : <span className="text-zinc-600">—</span>}
                </td>
                <td className="max-w-[320px] px-3 py-3 text-xs"><Details details={e.details} /></td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-500">{e.ip || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && (
        <div className="mt-4 flex items-center justify-between text-sm text-zinc-500">
          <span>{data.pagination.total} entries · page {page}</span>
          <div className="flex gap-2">
            <Button variant="ghost" disabled={page <= 1} onClick={() => setQuery({ page: String(page - 1) })}><ChevronLeft className="h-4 w-4" aria-hidden />Previous</Button>
            <Button variant="ghost" disabled={!data.pagination.hasMore} onClick={() => setQuery({ page: String(page + 1) })}>Next<ChevronRight className="h-4 w-4" aria-hidden /></Button>
          </div>
        </div>
      )}
    </>
  );
}
