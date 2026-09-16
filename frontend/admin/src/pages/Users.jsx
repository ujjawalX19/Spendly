import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Search, Shield, X } from 'lucide-react';
import { useAdminData } from '../lib/useAdminData';
import { Button, ErrorBanner, PageHeader, Skeleton, fmtDate, fmtNumber, fmtRelative } from '../components/ui';

const PAGE_SIZE = 25;
const DEFAULTS = { q: '', plan: 'all', activity: 'all', status: 'all', createdFrom: '', createdTo: '', sort: 'newest', page: '1' };

const SELECTS = [
  { key: 'plan', label: 'Plan', options: [['all', 'All plans'], ['free', 'Free'], ['pro', 'Pro']] },
  { key: 'activity', label: 'Activity', options: [['all', 'Any activity'], ['active', 'Active (30d)'], ['inactive', 'Inactive (30d+)']] },
  { key: 'status', label: 'Status', options: [['all', 'Any status'], ['active', 'Active'], ['suspended', 'Suspended']] },
  { key: 'sort', label: 'Sort', options: [['newest', 'Newest'], ['oldest', 'Oldest'], ['last_active', 'Last active'], ['last_activity', 'Last activity'], ['expenses', 'Most expenses'], ['ai_usage', 'Most AI usage'], ['name', 'Name']] },
];

const selectClass = 'rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus:border-lime-400 focus:outline-none';

export default function Users() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const f = Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, params.get(k) || v]));
  const page = Math.max(1, Number(f.page) || 1);
  const [search, setSearch] = useState(f.q);

  const update = (next) => {
    const merged = { ...f, page: '1', ...next };
    setParams(Object.fromEntries(Object.entries(merged).filter(([k, v]) => v && v !== DEFAULTS[k])), { replace: true });
  };

  // Debounced search.
  useEffect(() => {
    if (search === f.q) return undefined;
    const timer = setTimeout(() => update({ q: search.trim() }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const { data, error, loading, reload } = useAdminData('/users', {
    query: { ...f, page, pageSize: PAGE_SIZE },
  });
  const users = data?.users || [];
  const total = data?.pagination?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = ['plan', 'activity', 'status', 'createdFrom', 'createdTo', 'q'].some((k) => f[k] !== DEFAULTS[k]);

  return (
    <>
      <PageHeader title="Users" subtitle={data ? `${fmtNumber(total)} ${filtered ? 'matching' : 'registered'}` : 'Registered accounts'} />

      <div className="mb-3">
        <label className="relative block">
          <span className="sr-only">Search users</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email, name, or exact user ID"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-lime-400 focus:outline-none"
          />
        </label>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        {SELECTS.map(({ key, label, options }) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-[11px] text-zinc-500">{label}</span>
            <select value={f[key]} onChange={(e) => update({ [key]: e.target.value })} className={selectClass}>
              {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        ))}
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-zinc-500">Joined from</span>
          <input type="date" value={f.createdFrom} max={f.createdTo || undefined} onChange={(e) => update({ createdFrom: e.target.value })} className={`${selectClass} [color-scheme:dark]`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-zinc-500">Joined to</span>
          <input type="date" value={f.createdTo} min={f.createdFrom || undefined} onChange={(e) => update({ createdTo: e.target.value })} className={`${selectClass} [color-scheme:dark]`} />
        </label>
        {filtered && (
          <Button variant="ghost" onClick={() => { setSearch(''); setParams({}, { replace: true }); }}><X className="h-4 w-4" aria-hidden />Clear</Button>
        )}
      </div>

      <ErrorBanner error={error} onRetry={reload} />
      {data && data.usageAvailable === false && (
        <p className="mb-3 text-xs text-amber-300/80">Usage columns and activity data need supabase/v1_4_admin_ops.sql.</p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-zinc-800/80 bg-zinc-900/60">
        <table className="w-full min-w-[1320px] text-sm">
          <thead>
            <tr className="border-b border-zinc-800/80 text-left text-[11px] uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-3 py-3 font-medium">Created</th>
              <th className="px-3 py-3 font-medium">Last active</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Plan</th>
              <th className="px-3 py-3 text-right font-medium">Expenses</th>
              <th className="px-3 py-3 text-right font-medium">Goals</th>
              <th className="px-3 py-3 text-right font-medium">Subs</th>
              <th className="px-3 py-3 text-right font-medium">AI Qs</th>
              <th className="px-3 py-3 text-right font-medium">Pools</th>
              <th className="px-3 py-3 text-right font-medium">Scans</th>
              <th className="px-3 py-3 text-right font-medium">Imports</th>
              <th className="px-3 py-3 font-medium">App</th>
              <th className="px-4 py-3 font-medium">Last activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {loading && !data ? Array.from({ length: 8 }, (_, i) => (
              <tr key={i}><td colSpan={14} className="px-4 py-3"><Skeleton className="h-6" /></td></tr>
            )) : users.length === 0 ? (
              <tr><td colSpan={14} className="px-4 py-12 text-center text-zinc-500">No users match these filters.</td></tr>
            ) : users.map((u) => (
              <tr key={u.id} onClick={() => navigate(`/users/${u.id}`)} className={`cursor-pointer hover:bg-zinc-800/40 ${loading ? 'opacity-60' : ''}`}>
                <td className="max-w-[260px] px-4 py-3">
                  <Link to={`/users/${u.id}`} onClick={(e) => e.stopPropagation()} className="block min-w-0 focus:outline-none focus-visible:underline">
                    <span className="flex items-center gap-1.5 truncate font-medium text-zinc-100">
                      {u.name || <span className="text-zinc-500">No name</span>}
                      {u.role === 'admin' && <Shield className="h-3.5 w-3.5 shrink-0 text-lime-300" aria-label="Admin" />}
                    </span>
                    <span className="block truncate font-mono text-xs text-zinc-500">{u.email}</span>
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-zinc-400">{fmtDate(u.createdAt, { time: false })}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs text-zinc-400" title={u.lastActiveAt ? fmtDate(u.lastActiveAt) : undefined}>{u.lastActiveAt === undefined ? '—' : fmtRelative(u.lastActiveAt)}</td>
                <td className="px-3 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${u.status === 'suspended' ? 'bg-red-500/15 text-red-300' : 'bg-zinc-800 text-zinc-300'}`}>{u.status}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-xs">
                  {u.pro.active ? <span className="text-lime-300">Pro</span>
                    : u.pro.flagged ? <span className="text-amber-300">Pro expired</span>
                      : <span className="text-zinc-500">Free</span>}
                </td>
                <Count value={u.usage?.expenses} />
                <Count value={u.usage?.goals} />
                <Count value={u.usage?.subscriptions} />
                <Count value={u.usage?.aiQuestions} />
                <Count value={u.usage?.groupPools} />
                <Count value={u.usage?.scannedExpenses} />
                <Count value={u.usage?.statementImports} />
                <td className="whitespace-nowrap px-3 py-3 text-xs text-zinc-400" title={u.device?.lastSeenAt ? `Last seen ${fmtDate(u.device.lastSeenAt)}` : undefined}>
                  {u.device === null ? '—' : u.device?.platform ? `${u.device.platform} ${u.device.appVersion || ''}` : <span className="text-zinc-600">not reported</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-400">{u.usage ? fmtRelative(u.usage.lastActivityAt) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-zinc-500">
        <span>Page {page} of {pages}</span>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={page <= 1 || loading} onClick={() => update({ page: String(page - 1) })}><ChevronLeft className="h-4 w-4" aria-hidden />Previous</Button>
          <Button variant="ghost" disabled={!data?.pagination?.hasMore || loading} onClick={() => update({ page: String(page + 1) })}>Next<ChevronRight className="h-4 w-4" aria-hidden /></Button>
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-600">Last active = last authenticated API request. Last activity = last expense, AI question or import. App = platform and version last reported by the user's app (builds with telemetry only).</p>
    </>
  );
}

function Count({ value }) {
  return (
    <td className={`px-3 py-3 text-right tabular text-xs ${value ? 'text-zinc-200' : 'text-zinc-600'}`}>
      {value === undefined || value === null ? '—' : fmtNumber(value)}
    </td>
  );
}
