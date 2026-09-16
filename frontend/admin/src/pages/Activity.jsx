import { Link, useSearchParams } from 'react-router-dom';
import { RefreshCw, Store } from 'lucide-react';
import { useAdminData } from '../lib/useAdminData';
import { Button, Card, ErrorBanner, Metric, MetricGrid, PageHeader, Select, Skeleton, Unavailable, fmtDate, fmtNumber, fmtPercent, fmtRelative } from '../components/ui';
import { DailyBars } from '../components/charts';
import { EVENT_LABELS } from '../lib/labels';

const RANGES = [['7', 'Last 7 days'], ['14', 'Last 14 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']];

const byPlatform = (m) => (m ? ['android', 'web', 'ios'].filter((p) => m[p]).map((p) => `${p} ${m[p]}`).join(' · ') : '');

export default function Activity() {
  const [params, setParams] = useSearchParams();
  const days = params.get('days') || '30';
  const activity = useAdminData('/activity', { query: { days } });
  const installs = useAdminData('/installs', { query: { days } });
  const engagement = useAdminData('/engagement');
  const reload = () => { activity.reload(); installs.reload(); engagement.reload(); };

  return (
    <>
      <PageHeader title="Activity & analytics" subtitle="Installs, engagement and product events — counted from recorded rows only">
        <Select value={days} onChange={(v) => setParams(v === '30' ? {} : { days: v }, { replace: true })} options={RANGES} label="" />
        <Button variant="ghost" onClick={reload} loading={activity.loading}>{!activity.loading && <RefreshCw className="h-4 w-4" aria-hidden />}Refresh</Button>
      </PageHeader>

      <div className="space-y-6">
        <InstallsSection state={installs} />
        <EngagementSection state={engagement} />
        <EventsSection state={activity} />
      </div>
    </>
  );
}

function InstallsSection({ state }) {
  const d = state.data;
  return (
    <Card title="Downloads & installs" subtitle={d?.available ? d.note : 'App first launches reported by Vittova'}>
      <ErrorBanner error={state.error} onRetry={state.reload} />
      <div className="mb-5 flex items-start gap-3 rounded-xl bg-zinc-950/60 px-4 py-3">
        <Store className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
        <div className="text-sm">
          <p className="font-medium text-zinc-200">Play Store downloads: <span className="text-amber-300">unavailable</span></p>
          <p className="mt-0.5 text-xs text-zinc-500">{d?.playStore?.note || 'Google Play Console reporting is not connected.'}</p>
        </div>
      </div>
      {!d ? <Skeleton className="h-40" /> : !d.available ? <Unavailable note={d.note} /> : (
        <>
          <MetricGrid>
            <Metric label="Total first launches" metric={{ value: d.totals.all }} hint={byPlatform(d.totals.byPlatform)} />
            <Metric label="New today" metric={{ value: d.totals.today }} hint={byPlatform(d.totals.todayByPlatform)} />
            <Metric label="New this week" metric={{ value: d.totals.week }} hint={byPlatform(d.totals.weekByPlatform)} />
            <Metric label="New this month" metric={{ value: d.totals.month }} hint={byPlatform(d.totals.monthByPlatform)} />
            <Metric label="Installs active, 7 days" metric={{ value: d.totals.active7d }} />
            <Metric label="Installs active, 30 days" metric={{ value: d.totals.active30d }} hint={byPlatform(d.totals.active30dByPlatform)} />
            <Metric label="Linked to an account" metric={{ value: d.totals.linkedToAccount }} />
            <Metric label="Uninstalls" metric={d.uninstalls} />
          </MetricGrid>
          <p className="mt-2 text-[11px] text-zinc-600">Tracking since {fmtDate(d.trackingSince)}. Android installs from APKs built before this telemetry are not counted.</p>
          <h3 className="mb-2 mt-6 text-xs font-medium text-zinc-400">New installs per day</h3>
          <DailyBars data={d.trend} series={[{ key: 'android', label: 'Android' }, { key: 'web', label: 'Web' }, { key: 'ios', label: 'iOS' }]} />

          <h3 className="mb-2 mt-6 text-xs font-medium text-zinc-400">App versions</h3>
          {d.versions.length === 0 ? <p className="text-sm text-zinc-500">No versions reported yet.</p> : (
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="border-b border-zinc-800/80 text-left text-[11px] uppercase tracking-wider text-zinc-500">
                  <th className="px-5 py-2 font-medium">Platform</th><th className="px-3 py-2 font-medium">Version</th>
                  <th className="px-3 py-2 text-right font-medium">Installs</th><th className="px-3 py-2 text-right font-medium">Active 30d</th>
                  <th className="px-3 py-2 text-right font-medium">Users 30d</th><th className="px-3 py-2 font-medium">First seen</th><th className="px-5 py-2 font-medium">Last seen</th>
                </tr></thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {d.versions.map((v) => (
                    <tr key={`${v.platform}-${v.version}`}>
                      <td className="px-5 py-2 text-zinc-300">{v.platform}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        <span className="text-zinc-100">{v.version}</span>
                        {v.newest && <span className="ml-2 rounded bg-lime-400/10 px-1.5 py-0.5 text-[10px] text-lime-300">newest</span>}
                        {v.outdated && <span className="ml-2 rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-300">outdated</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular text-zinc-200">{fmtNumber(v.installs)}</td>
                      <td className="px-3 py-2 text-right tabular text-zinc-200">{fmtNumber(v.active30d)}</td>
                      <td className="px-3 py-2 text-right tabular text-zinc-200">{fmtNumber(v.activeUsers30d)}</td>
                      <td className="px-3 py-2 text-xs text-zinc-400">{fmtDate(v.firstSeenAt, { time: false })}</td>
                      <td className="px-5 py-2 text-xs text-zinc-400">{fmtRelative(v.lastSeenAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function EngagementSection({ state }) {
  const d = state.data;
  return (
    <Card title="Engagement & retention" subtitle="From signup dates, last authenticated request and recorded expenses / AI questions / imports">
      <ErrorBanner error={state.error} onRetry={state.reload} />
      {!d ? <Skeleton className="h-32" /> : !d.available ? <Unavailable note={d.note} /> : (
        <MetricGrid>
          <Metric label="DAU (today)" metric={d.dau} />
          <Metric label="WAU (7 days)" metric={d.wau} />
          <Metric label="MAU (30 days)" metric={d.mau} />
          <Metric label="Stickiness" metric={d.stickiness} format={fmtPercent} />
          <Metric label="Returning users" metric={d.returningUsers} />
          <Metric label="Users with 1+ expense" metric={d.usersWith1Expense} />
          <Metric label="Users with 5+ expenses" metric={d.usersWith5Expenses} />
          <Metric label="Signup → first expense" metric={d.signupToFirstExpense} format={fmtPercent} />
          <Metric label="Signup → first AI question" metric={d.signupToFirstAiQuestion} format={fmtPercent} />
          <Metric label="7-day retention" metric={d.retention7d} format={fmtPercent} />
          <Metric label="30-day retention" metric={d.retention30d} format={fmtPercent} />
        </MetricGrid>
      )}
    </Card>
  );
}

function EventsSection({ state }) {
  const d = state.data;
  return (
    <>
      <Card title="Product events" subtitle={d?.available ? `Tracking since ${fmtDate(d.trackingSince)} · server events are trusted; client events are reported by the app` : 'Recorded product events'}>
        <ErrorBanner error={state.error} onRetry={state.reload} />
        {!d ? <Skeleton className="h-48" /> : !d.available ? <Unavailable note={d.note} /> : (
          <>
            <MetricGrid>
              <Metric label="Events" metric={{ value: d.totals.events }} hint={`${fmtNumber(d.totals.server)} server · ${fmtNumber(d.totals.client)} app`} />
              <Metric label="Signed-in users with events" metric={{ value: d.totals.users }} />
            </MetricGrid>
            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-medium text-zinc-400">Signed-in users with any event, per day</h3>
                <DailyBars data={d.daily} series={[{ key: 'users', label: 'Users' }]} />
              </div>
              <div>
                <h3 className="mb-2 text-xs font-medium text-zinc-400">Expenses created and AI answers, per day</h3>
                <DailyBars data={d.daily} series={[{ key: 'expense_created', label: 'Expenses' }, { key: 'ai_question_answered', label: 'AI answers' }]} stacked={false} />
              </div>
            </div>
            {d.truncated && <p className="mt-2 text-xs text-amber-300/80">Row scan limit reached — counts are a lower bound. Choose a shorter range.</p>}
          </>
        )}
      </Card>

      {d?.available && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card title="Event breakdown">
            {d.byName.length === 0 ? <p className="text-sm text-zinc-500">No events in this period.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500"><th className="pb-2 font-medium">Event</th><th className="pb-2 font-medium">Source</th><th className="pb-2 text-right font-medium">Count</th><th className="pb-2 text-right font-medium">Users</th></tr></thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {d.byName.map((e) => (
                    <tr key={`${e.source}-${e.name}`}>
                      <td className="py-1.5 text-zinc-200" title={e.name}>{EVENT_LABELS[e.name] || e.name}</td>
                      <td className="py-1.5 text-xs text-zinc-500">{e.source === 'server' ? 'server' : 'app'}</td>
                      <td className="py-1.5 text-right tabular text-zinc-100">{fmtNumber(e.count)}</td>
                      <td className="py-1.5 text-right tabular text-zinc-400">{fmtNumber(e.users)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Failure rates" subtitle="error = server failure · limited = quota/rate limit · blocked = Pro-only · rejected = invalid request">
            {d.failureRates.length === 0 ? <p className="text-sm text-zinc-500">No attempts recorded in this period.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500"><th className="pb-2 font-medium">Action</th><th className="pb-2 text-right font-medium">OK</th><th className="pb-2 text-right font-medium">Failed</th><th className="pb-2 text-right font-medium">Rate</th></tr></thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {d.failureRates.map((f) => (
                    <tr key={f.label} className="align-top">
                      <td className="py-1.5 text-zinc-200">{f.label}
                        {f.failed > 0 && <p className="text-[11px] text-zinc-500">{Object.entries(f.breakdown).map(([k, v]) => `${k} ${v}`).join(' · ')}</p>}
                      </td>
                      <td className="py-1.5 text-right tabular text-zinc-300">{fmtNumber(f.success)}</td>
                      <td className="py-1.5 text-right tabular text-zinc-300">{fmtNumber(f.failed)}</td>
                      <td className={`py-1.5 text-right tabular ${f.failureRate > 0.1 ? 'text-red-300' : f.failureRate > 0 ? 'text-amber-300' : 'text-zinc-400'}`}>{fmtPercent(f.failureRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Recent activity" subtitle="Latest 50 events · names and codes only" className="xl:col-span-2">
            {d.recent.length === 0 ? <p className="text-sm text-zinc-500">No events yet.</p> : (
              <div className="-mx-5 -my-5 max-h-[420px] overflow-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="sticky top-0 bg-zinc-900"><tr className="border-b border-zinc-800/80 text-left text-[11px] uppercase tracking-wider text-zinc-500">
                    <th className="px-5 py-2 font-medium">When</th><th className="px-3 py-2 font-medium">Event</th><th className="px-3 py-2 font-medium">User</th><th className="px-3 py-2 font-medium">Platform</th><th className="px-5 py-2 font-medium">Details</th>
                  </tr></thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {d.recent.map((e, i) => (
                      <tr key={`${e.at}-${i}`}>
                        <td className="whitespace-nowrap px-5 py-2 text-xs text-zinc-400" title={fmtDate(e.at)}>{fmtRelative(e.at)}</td>
                        <td className="px-3 py-2 text-zinc-200">{EVENT_LABELS[e.name] || e.name}</td>
                        <td className="px-3 py-2 font-mono text-xs">{e.userId ? <Link to={`/users/${e.userId}`} className="text-zinc-300 hover:text-lime-300">{e.userId.slice(0, 8)}…</Link> : <span className="text-zinc-600">anonymous</span>}</td>
                        <td className="px-3 py-2 text-xs text-zinc-400">{e.platform ? `${e.platform} ${e.appVersion || ''}` : e.source}</td>
                        <td className="px-5 py-2 font-mono text-xs text-zinc-500">{[...Object.entries(e.props).map(([k, v]) => `${k}=${v}`), e.durationMs ? `${e.durationMs}ms` : null].filter(Boolean).join(' ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Not tracked" subtitle="Stated rather than estimated" className="xl:col-span-2">
            <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-400">{d.notTracked.map((n) => <li key={n}>{n}</li>)}</ul>
          </Card>
        </div>
      )}
    </>
  );
}
