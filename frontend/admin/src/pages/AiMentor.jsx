import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useAdminData } from '../lib/useAdminData';
import { Button, Card, ErrorBanner, Metric, MetricGrid, PageHeader, Rows, Skeleton, StatusBadge, Unavailable, fmtDate, fmtNumber, fmtPercent, fmtRelative } from '../components/ui';
import { DailyBars, RatioBar } from '../components/charts';

const ms = (v) => (v === null || v === undefined ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${v} ms`);

export default function AiMentor() {
  const { data: d, error, loading, reload } = useAdminData('/ai', { refreshMs: 60_000 });

  return (
    <>
      <PageHeader title="AI Mentor" subtitle="Gemini availability, answer outcomes, quota and failures · no questions or answers are shown">
        <Button variant="ghost" onClick={() => reload()} loading={loading}>{!loading && <RefreshCw className="h-4 w-4" aria-hidden />}Refresh</Button>
      </PageHeader>

      <div className="space-y-6">
        <ErrorBanner error={error} onRetry={reload} />
        {!d ? <Skeleton className="h-64" /> : (
          <>
            <Card title="Health">
              <div className="flex flex-wrap items-center gap-4">
                <StatusBadge status={d.health.state} />
                <p className="text-sm text-zinc-300">{d.health.detail}</p>
              </div>
              <p className="mt-3 text-[11px] text-zinc-500">GREEN working normally · YELLOW degraded or falling back · RED production AI unavailable · UNKNOWN not enough requests to judge</p>
              <div className="mt-4 grid gap-6 sm:grid-cols-2">
                <Rows rows={[
                  ['Gemini configured', d.config.geminiConfigured ? 'Yes' : 'No'],
                  ['Model', d.config.model],
                  ['Reply timeout', ms(d.config.replyTimeoutMs)],
                ]} />
                <Rows rows={[
                  ['Gemini calls since restart', `${fmtNumber(d.sinceRestart.calls)} (${fmtNumber(d.sinceRestart.failures)} failed, ${fmtNumber(d.sinceRestart.timeouts)} timeouts)`],
                  ['Gemini latency since restart', `avg ${ms(d.sinceRestart.latencyMs.avg)} · p95 ${ms(d.sinceRestart.latencyMs.p95)}`],
                  ['Last success / failure', `${fmtRelative(d.sinceRestart.lastSuccessAt)} / ${fmtRelative(d.sinceRestart.lastFailureAt)}`],
                ]} />
              </div>
            </Card>

            <Card title="Requests" subtitle={d.questions.note}>
              <MetricGrid>
                <Metric label="Total AI questions" metric={d.questions.total} />
                <Metric label="Today" metric={d.questions.today} />
                <Metric label="Last 7 days" metric={d.questions.last7d} />
                <Metric label="Last 30 days" metric={d.questions.last30d} />
              </MetricGrid>
            </Card>

            <Card title="Answer outcomes" subtitle="Gemini = model reply shown · fallback = Gemini failed or its reply was rejected, calculated answer shown · calculated = Gemini not configured">
              {!d.outcomes ? <Unavailable note={d.outcomesNote} /> : (
                <>
                  <div className="grid gap-6 lg:grid-cols-3">
                    {[['Today', d.outcomes.today], ['Last 7 days', d.outcomes.last7d], ['Last 30 days', d.outcomes.last30d]].map(([label, o]) => (
                      <div key={label} className="rounded-xl bg-zinc-950/60 p-4">
                        <p className="mb-3 text-xs font-medium text-zinc-400">{label}</p>
                        <Rows rows={[
                          ['Requests', fmtNumber(o.requests)],
                          ['Successful (Gemini)', fmtNumber(o.geminiAnswers)],
                          ['Fallback answers', `${fmtNumber(o.fallbackAnswers)} (${fmtPercent(o.fallbackRate)})`],
                          ['Failed requests', `${fmtNumber(o.failed)}${o.failed ? ` · ${Object.entries(o.failedBreakdown).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}`],
                          ['Avg response', ms(o.avgResponseMs)],
                          ['p95 response', ms(o.p95ResponseMs)],
                        ]} />
                      </div>
                    ))}
                  </div>
                  <h3 className="mb-2 mt-6 text-xs font-medium text-zinc-400">Outcome mix, last 30 days</h3>
                  <RatioBar parts={[
                    { label: 'Gemini', value: d.outcomes.last30d.geminiAnswers },
                    { label: 'Fallback', value: d.outcomes.last30d.fallbackAnswers },
                    { label: 'Failed', value: d.outcomes.last30d.failed },
                  ]} />
                  <h3 className="mb-2 mt-6 text-xs font-medium text-zinc-400">Per day, last 14 days</h3>
                  <DailyBars data={d.outcomes.daily} series={[{ key: 'gemini', label: 'Gemini' }, { key: 'fallback', label: 'Fallback' }, { key: 'failed', label: 'Failed' }]} />
                  {d.outcomes.topics30d.length > 0 && (
                    <>
                      <h3 className="mb-2 mt-6 text-xs font-medium text-zinc-400">Question types, last 30 days (classified intent)</h3>
                      <div className="flex flex-wrap gap-2">
                        {d.outcomes.topics30d.map((t) => <span key={t.intent} className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300">{t.intent.replace(/_/g, ' ')} <span className="tabular text-zinc-100">{t.count}</span></span>)}
                      </div>
                    </>
                  )}
                </>
              )}
            </Card>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card title="Daily free quota" subtitle="Free plan AI messages today (Pro users are not metered)">
                {!d.quota ? <Unavailable note="Could not read quota counters" /> : (
                  <MetricGrid>
                    <Metric label="Daily limit per user" metric={{ value: d.quota.dailyFreeLimit }} />
                    <Metric label="Users asking today" metric={{ value: d.quota.usersUsingToday }} />
                    <Metric label="Messages used today" metric={{ value: d.quota.messagesUsedToday }} />
                    <Metric label="At the limit" metric={{ value: d.quota.usersAtLimit }} />
                    <Metric label="Near the limit (80%+)" metric={{ value: d.quota.usersNearLimit }} hint={`Resets ${fmtDate(d.quota.resetsAt)}`} />
                  </MetricGrid>
                )}
                <p className="mt-4 text-xs text-zinc-500">Gemini billing quota is not exposed by the API; check Google AI Studio for the project's usage. <Link to="/pro" className="text-lime-300">Quota by user →</Link></p>
              </Card>

              <Card title="Failures (all AI features)" subtitle="Gemini errors from the mentor, receipt scan and PDF import · last 30 days">
                {!d.failures ? <Unavailable note={d.failuresNote} /> : (
                  <>
                    <MetricGrid>
                      <Metric label="Gemini errors, 24h" metric={{ value: d.failures.geminiErrors24h }} />
                      <Metric label="Gemini errors, 30d" metric={{ value: d.failures.geminiErrors30d }} />
                      <Metric label="Timeouts, 30d" metric={{ value: d.failures.timeouts30d }} />
                      <Metric label="HTTP errors, 30d" metric={{ value: d.failures.httpErrors30d }} />
                      <Metric label="Replies rejected, 30d" metric={{ value: d.failures.rejectedReplies30d }} hint="Unverified figures or malformed; fallback shown" />
                    </MetricGrid>
                    <h3 className="mb-2 mt-5 text-xs font-medium text-zinc-400">Most common failure types</h3>
                    {d.failures.byCode.length === 0 ? <p className="text-sm text-zinc-500">No Gemini errors recorded.</p> : (
                      <ul className="space-y-1 text-sm">
                        {d.failures.byCode.map((c) => (
                          <li key={c.code} className="flex justify-between"><span className="font-mono text-xs text-zinc-300">{c.code} <span className="text-zinc-600">({c.kind})</span></span><span className="tabular text-zinc-100">{c.count}</span></li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </Card>
            </div>

            {d.failures && (
              <Card title="Recent AI errors" subtitle="Codes only — provider messages can echo prompts and are never stored">
                {d.failures.recent.length === 0 ? <p className="text-sm text-zinc-500">None in the last 30 days.</p> : (
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500"><th className="pb-2 font-medium">When</th><th className="pb-2 font-medium">Type</th><th className="pb-2 font-medium">Code</th><th className="pb-2 font-medium">Where</th></tr></thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {d.failures.recent.map((e, i) => (
                        <tr key={`${e.at}-${i}`}>
                          <td className="py-1.5 text-xs text-zinc-400" title={fmtDate(e.at)}>{fmtRelative(e.at)}</td>
                          <td className="py-1.5 font-mono text-xs text-zinc-300">{e.type}</td>
                          <td className="py-1.5 font-mono text-xs text-zinc-200">{e.code || '—'}</td>
                          <td className="py-1.5 font-mono text-xs text-zinc-500">{e.route || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            )}
            <p className="text-xs text-zinc-600">{d.privacy}</p>
          </>
        )}
      </div>
    </>
  );
}
