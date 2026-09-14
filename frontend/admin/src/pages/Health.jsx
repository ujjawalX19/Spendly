import { RefreshCw } from 'lucide-react';
import { useAdminData } from '../lib/useAdminData';
import { Button, Card, ErrorBanner, PageHeader, Skeleton, StatusBadge, fmtDate, fmtNumber, fmtPercent, fmtRelative } from '../components/ui';

const COMPONENTS = [
  ['api', 'Backend API'], ['database', 'Database'], ['auth', 'Authentication'], ['ai', 'AI / Gemini'],
  ['upi', 'UPI processing'], ['pdfImport', 'PDF import'], ['background', 'Background jobs'],
];

export default function Health() {
  const { data, error, loading, reload } = useAdminData('/health', { refreshMs: 30_000 });
  const c = data?.components;

  return (
    <>
      <PageHeader title="System health" subtitle={data ? `Checked ${fmtDate(data.checkedAt)} · refreshes every 30s` : 'Live checks against production services'}>
        <Button variant="ghost" onClick={() => reload()} loading={loading}>{!loading && <RefreshCw className="h-4 w-4" aria-hidden />}Run checks</Button>
      </PageHeader>

      <div className="space-y-6">
        <ErrorBanner error={error} onRetry={reload} />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {COMPONENTS.map(([key, label]) => (
            <div key={key} className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-zinc-100">{label}</h2>
                {c ? <StatusBadge status={c[key]?.status} /> : <Skeleton className="h-6 w-20" />}
              </div>
              {c ? <ComponentDetail id={key} item={c[key]} /> : <Skeleton className="h-10" />}
            </div>
          ))}
        </div>

        {c && (
          <Card title="API traffic" subtitle={`In-memory since the last restart (${fmtDate(c.api.since)}); resets when the server restarts`}>
            <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Requests" value={fmtNumber(c.api.totalRequests)} />
              <Stat label="Server errors" value={fmtNumber(c.api.totalServerErrors)} />
              <Stat label={`Error rate (last ${fmtNumber(c.api.sampleSize)})`} value={fmtPercent(c.api.errorRate)} />
              <Stat label="Latency p50" value={c.api.latencyMs.p50 === null ? '—' : `${c.api.latencyMs.p50} ms`} />
              <Stat label="Latency p95" value={c.api.latencyMs.p95 === null ? '—' : `${c.api.latencyMs.p95} ms`} />
              <Stat label="Uptime" value={formatUptime(c.api.uptimeSeconds)} />
            </dl>
          </Card>
        )}

        <Card title="Recent errors & warnings" subtitle={data ? (data.errors.tracking ? `${fmtNumber(data.errors.last24h)} errors in the last 24h · error codes only, no user data` : 'Error tracking unavailable — run supabase/v1_4_admin_ops.sql') : undefined}>
          {!data ? <Skeleton className="h-24" /> : data.errors.recent.length === 0 ? (
            <p className="text-sm text-zinc-500">{data.errors.tracking ? 'No errors recorded.' : 'Not tracked yet.'}</p>
          ) : (
            <div className="-mx-5 -my-5 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-800/80 text-left text-[11px] uppercase tracking-wider text-zinc-500">
                    <th className="px-5 py-3 font-medium">When</th>
                    <th className="px-3 py-3 font-medium">Severity</th>
                    <th className="px-3 py-3 font-medium">Type</th>
                    <th className="px-3 py-3 font-medium">Where</th>
                    <th className="px-5 py-3 font-medium">Code</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {data.errors.recent.map((e, i) => (
                    <tr key={`${e.at}-${i}`}>
                      <td className="whitespace-nowrap px-5 py-2.5 text-xs text-zinc-400" title={fmtDate(e.at)}>{fmtRelative(e.at)}</td>
                      <td className="px-3 py-2.5 text-xs"><span className={e.severity === 'error' ? 'text-red-300' : 'text-amber-300'}>{e.severity}</span></td>
                      <td className="px-3 py-2.5 font-mono text-xs text-zinc-300">{e.type}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-zinc-500">{e.route || '—'}</td>
                      <td className="px-5 py-2.5 font-mono text-xs text-zinc-400">{e.statusCode || e.code || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function ComponentDetail({ id, item }) {
  if (!item) return null;
  const rows = [];
  if (item.latencyMs !== undefined && typeof item.latencyMs === 'number') rows.push(['Latency', `${item.latencyMs} ms`]);
  if (id === 'api') rows.push(['Version', item.version || 'unknown'], ['Node', item.node]);
  if (id === 'ai') {
    rows.push(['Model', item.model], ['Calls since restart', `${item.callsSinceRestart} (${item.failuresSinceRestart} failed)`], ['Last success', fmtRelative(item.lastSuccessAt)]);
    if (item.lastFailureAt) rows.push(['Last failure', `${fmtRelative(item.lastFailureAt)} · ${item.lastFailureCode}`]);
    rows.push(['Errors, last hour', fmtNumber(item.errorsLastHour)]);
  }
  if (id === 'upi') rows.push(['Last confirmed payment', fmtRelative(item.lastConfirmedAt)]);
  if (id === 'pdfImport') rows.push(['Last successful import', fmtRelative(item.lastSuccessAt)], ['Failures, 24h', item.failures24h === null ? '—' : fmtNumber(item.failures24h)]);
  if (id === 'background') rows.push(['Job', item.job], ['Schedule', item.schedule], ['Last success', fmtRelative(item.lastSuccessAt)]);

  return (
    <>
      <p className="text-sm text-zinc-400">{item.detail}</p>
      {rows.length > 0 && (
        <dl className="mt-3 space-y-1 text-xs">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3"><dt className="text-zinc-500">{k}</dt><dd className="truncate text-right text-zinc-300">{v}</dd></div>
          ))}
        </dl>
      )}
      {item.note && <p className="mt-2 text-[11px] text-zinc-500">{item.note}</p>}
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-1 tabular text-lg font-semibold text-zinc-100">{value}</dd>
    </div>
  );
}

function formatUptime(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}
