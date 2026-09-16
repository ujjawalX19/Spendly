import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarPlus, ChevronLeft, ChevronRight, CreditCard, XCircle } from 'lucide-react';
import { useAdminData } from '../lib/useAdminData';
import { Button, Card, ErrorBanner, Metric, MetricGrid, PageHeader, Skeleton, fmtDate, fmtPercent } from '../components/ui';

const QUOTA_LABELS = { chat_message: 'AI messages (per day)', receipt_scan: 'Receipt scans (per month)', add_expense: 'Expenses (per day)' };
import { ProDialogs } from '../components/ProDialogs';

const STATES = [['active', 'Active'], ['expiring', 'Expiring ≤ 7 days'], ['expired', 'Expired'], ['all', 'All Pro flags']];
const PAGE_SIZE = 25;
const ACTION_LABELS = { pro_granted: 'Granted', pro_extended: 'Extended', pro_revoked: 'Revoked' };

export default function Pro() {
  const [params, setParams] = useSearchParams();
  const state = params.get('state') || 'active';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const { data, error, loading, reload } = useAdminData('/pro', { query: { state, page, pageSize: PAGE_SIZE } });
  const [action, setAction] = useState(null); // { dialog, user }
  const [notice, setNotice] = useState('');

  const setQuery = (next) => setParams(Object.fromEntries(Object.entries({ state, page: '1', ...next }).filter(([k, v]) => !(k === 'state' && v === 'active') && !(k === 'page' && v === '1'))), { replace: true });

  const done = (result) => {
    setAction(null);
    setNotice(result.message);
    reload({ quiet: true });
  };

  const s = data?.summary;

  return (
    <>
      <PageHeader title="Pro management" subtitle="Entitlements, expiries and every change made to them" />

      <div className="space-y-6">
        <ErrorBanner error={error} onRetry={reload} />
        {notice && <p role="status" className="rounded-lg bg-lime-400/10 px-4 py-2.5 text-sm text-lime-200">{notice}</p>}

        <Card>
          {!s ? <Skeleton className="h-16" /> : (
            <MetricGrid>
              <Metric label="Active Pro users" metric={{ value: s.activePro }} />
              <Metric label="Free users" metric={{ value: s.freeUsers }} hint="Includes expired Pro flags" />
              <Metric label="Conversion" metric={{ value: s.conversionRate }} format={fmtPercent} hint="Active Pro ÷ all users" />
              <Metric label="Expiring within 7 days" metric={{ value: s.expiringSoon }} />
              <Metric label="Expired Pro flags" metric={{ value: s.expiredFlags }} />
              <div>
                <p className="text-xs text-zinc-500">Billing</p>
                <p className="mt-2 inline-flex items-center gap-2 rounded-lg bg-zinc-800/80 px-2.5 py-1.5 text-sm text-zinc-300">
                  <CreditCard className="h-4 w-4 text-zinc-500" aria-hidden />{data.billing.connected ? 'Connected' : 'Billing: Not enabled'}
                </p>
                {!data.billing.connected && <p className="mt-1 text-[11px] text-zinc-500">Every entitlement is a manual grant. No revenue exists.</p>}
              </div>
              <Metric label="Revenue" metric={data.revenue} />
              <Metric label="Purchase attempts, 30 days" metric={data.purchaseAttempts30d} hint={data.purchaseAttempts30d?.users !== undefined ? `${data.purchaseAttempts30d.users} user(s)` : undefined} />
            </MetricGrid>
          )}
        </Card>

        <Card title="Free-tier quota usage" subtitle="Current period, from the counters the server enforces · Pro users are not metered">
          {!data?.quotas ? <Skeleton className="h-24" /> : (
            <div className="grid gap-6 lg:grid-cols-3">
              {Object.entries(data.quotas).map(([feature, q]) => (
                <div key={feature} className="rounded-xl bg-zinc-950/60 p-4">
                  <p className="text-xs font-medium text-zinc-400">{QUOTA_LABELS[feature] || feature}</p>
                  {q.value === null ? <p className="mt-2 text-sm text-amber-300/80">{q.note}</p> : (
                    <>
                      <p className="mt-2 text-sm text-zinc-300">Limit {q.limit} · <span className="tabular text-zinc-100">{q.usersUsing}</span> users · <span className="tabular text-zinc-100">{q.used}</span> used</p>
                      <p className="mt-1 text-sm"><span className="text-red-300">{q.atLimit} at limit</span> · <span className="text-amber-300">{q.nearLimit} near limit</span></p>
                      {q.approaching.length > 0 && (
                        <ul className="mt-3 space-y-1 text-xs">
                          {q.approaching.map((u) => (
                            <li key={u.id} className="flex justify-between gap-2"><Link to={`/users/${u.id}`} className="truncate font-mono text-zinc-400 hover:text-lime-300">{u.email}</Link><span className="tabular text-zinc-200">{u.used}/{q.limit}</span></li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="mt-4 text-xs text-zinc-500">Future billing data (subscriptions, renewals, cancellations, revenue) will appear here once Google Play Billing with server-side verification exists. Nothing is shown until then.</p>
        </Card>

        <Card
          title="Pro users"
          subtitle="Grant new Pro from a user's page (Users → user)"
          action={(
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Entitlement state">
              {STATES.map(([v, l]) => (
                <button key={v} type="button" onClick={() => setQuery({ state: v })} aria-pressed={state === v}
                  className={`rounded-full px-3 py-1 text-xs ${state === v ? 'bg-lime-400 text-zinc-950' : 'bg-zinc-800/70 text-zinc-400 hover:text-zinc-100'}`}>{l}</button>
              ))}
            </div>
          )}
        >
          <div className="-mx-5 -my-5 overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-zinc-800/80 text-left text-[11px] uppercase tracking-wider text-zinc-500">
                  <th className="px-5 py-3 font-medium">User</th>
                  <th className="px-3 py-3 font-medium">State</th>
                  <th className="px-3 py-3 font-medium">Activated</th>
                  <th className="px-3 py-3 font-medium">Expires</th>
                  <th className="px-3 py-3 font-medium">Source</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {loading && !data ? (
                  <tr><td colSpan={6} className="px-5 py-4"><Skeleton className="h-8" /></td></tr>
                ) : data?.users.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-10 text-center text-zinc-500">No users in this state.</td></tr>
                ) : data?.users.map((u) => (
                  <tr key={u.id} className="hover:bg-zinc-800/30">
                    <td className="max-w-[260px] px-5 py-3">
                      <Link to={`/users/${u.id}`} className="block truncate text-zinc-100 hover:text-lime-300">{u.name || u.email}</Link>
                      {u.name && <span className="block truncate font-mono text-xs text-zinc-500">{u.email}</span>}
                    </td>
                    <td className="px-3 py-3 text-xs">{u.active ? <span className="text-lime-300">Active</span> : <span className="text-amber-300">Expired</span>}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-zinc-400">{u.activatedAt ? fmtDate(u.activatedAt, { time: false }) : '—'}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-zinc-400">{u.expiresAt ? fmtDate(u.expiresAt) : 'No expiry'}</td>
                    <td className="px-3 py-3 text-xs text-zinc-400">{u.source}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        {u.expiresAt && <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setAction({ dialog: 'extend', user: u })}><CalendarPlus className="h-3.5 w-3.5" aria-hidden />Extend</Button>}
                        <Button variant="ghost" className="px-2 py-1 text-xs text-red-300 hover:text-red-200" onClick={() => setAction({ dialog: 'revoke', user: u })}><XCircle className="h-3.5 w-3.5" aria-hidden />Revoke</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {data && (
          <div className="flex items-center justify-between text-sm text-zinc-500">
            <span>{data.pagination.total} in this state · page {page}</span>
            <div className="flex gap-2">
              <Button variant="ghost" disabled={page <= 1} onClick={() => setQuery({ page: String(page - 1) })}><ChevronLeft className="h-4 w-4" aria-hidden />Previous</Button>
              <Button variant="ghost" disabled={!data.pagination.hasMore} onClick={() => setQuery({ page: String(page + 1) })}>Next<ChevronRight className="h-4 w-4" aria-hidden /></Button>
            </div>
          </div>
        )}

        <Card title="Entitlement history" subtitle="Latest 50 changes, from the audit log">
          {!data ? <Skeleton className="h-24" /> : data.history === null ? (
            <p className="text-sm text-amber-300/80">Audit log unavailable — run supabase/v1_4_admin_ops.sql.</p>
          ) : data.history.length === 0 ? <p className="text-sm text-zinc-500">No entitlement changes yet.</p> : (
            <div className="-mx-5 -my-5 overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-800/80 text-left text-[11px] uppercase tracking-wider text-zinc-500">
                    <th className="px-5 py-3 font-medium">When</th>
                    <th className="px-3 py-3 font-medium">Change</th>
                    <th className="px-3 py-3 font-medium">User</th>
                    <th className="px-3 py-3 font-medium">Expiry</th>
                    <th className="px-5 py-3 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {data.history.map((h) => (
                    <tr key={h.id}>
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-zinc-400">{fmtDate(h.at)}</td>
                      <td className="px-3 py-3 text-xs text-zinc-200">{ACTION_LABELS[h.action] || h.action}{h.days ? ` +${h.days}d` : ''}</td>
                      <td className="max-w-[220px] truncate px-3 py-3 text-xs">
                        {h.targetUserId ? <Link to={`/users/${h.targetUserId}`} className="font-mono text-zinc-300 hover:text-lime-300">{h.targetEmail || h.targetUserId.slice(0, 8)}</Link> : '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-zinc-400">
                        {h.action === 'pro_revoked' ? '—' : h.expiresAt ? fmtDate(h.expiresAt, { time: false }) : 'No expiry'}
                        {h.previous && <span className="block text-[11px] text-zinc-600">was {h.previous.isPro ? (h.previous.expiresAt ? fmtDate(h.previous.expiresAt, { time: false }) : 'no expiry') : 'free'}</span>}
                      </td>
                      <td className="px-5 py-3 text-xs text-zinc-400">{h.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {action && <ProDialogs user={action.user} dialog={action.dialog} onClose={() => setAction(null)} onDone={done} />}
    </>
  );
}
