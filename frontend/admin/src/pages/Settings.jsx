import { CheckCircle2, XCircle } from 'lucide-react';
import { useAdminData } from '../lib/useAdminData';
import { Card, ErrorBanner, PageHeader, Rows, Skeleton, fmtDate } from '../components/ui';

const Flag = ({ ok, yes = 'Yes', no = 'No' }) => (
  <span className={`inline-flex items-center gap-1 ${ok ? 'text-lime-300' : 'text-amber-300'}`}>
    {ok ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <XCircle className="h-3.5 w-3.5" aria-hidden />}{ok ? yes : no}
  </span>
);

export default function Settings() {
  const { data: d, error, reload } = useAdminData('/settings');

  return (
    <>
      <PageHeader title="Settings" subtitle="Read-only configuration status. Secrets are never sent to this page; configuration changes happen in Render and Supabase." />
      <ErrorBanner error={error} onRetry={reload} />
      {!d ? <Skeleton className="h-64" /> : (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card title="Access">
            <Rows rows={[
              ['ADMIN_EMAIL configured', <Flag key="a" ok={d.owner.adminEmailConfigured} />],
              ['Owner address', d.owner.adminEmail || '—'],
            ]} />
            <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-zinc-500">{d.security.map((s) => <li key={s}>{s}</li>)}</ul>
          </Card>

          <Card title="Environment">
            <Rows rows={[
              ['Environment', d.environment.nodeEnv],
              ['Deployed commit', d.environment.version || 'unknown'],
              ['Server started', fmtDate(d.environment.startedAt)],
              ['Business timezone', d.environment.timezone],
              ['Node', d.environment.node],
            ]} />
          </Card>

          <Card title="Features">
            <Rows rows={[
              ['Billing', d.features.billing.enabled ? <Flag key="b" ok yes="Enabled" /> : <span key="b" className="text-amber-300">Not enabled</span>],
              ['Gemini', <Flag key="g" ok={d.features.gemini.configured} yes={`Configured · ${d.features.gemini.model}`} no="Not configured" />],
              ['Daily burn-rate job', d.features.burnRateJob.enabled ? 'Enabled' : 'Disabled'],
              ['Play Console reporting', <span key="p" className="text-amber-300">Not connected</span>],
            ]} />
            <p className="mt-3 text-xs text-zinc-500">{d.features.billing.note}</p>
            <h3 className="mb-2 mt-5 text-xs font-medium text-zinc-400">Free-tier limits</h3>
            <Rows rows={[
              ['AI messages per day', d.freeTierLimits.chat_message],
              ['Receipt scans per month', d.freeTierLimits.receipt_scan],
              ['Expenses per day', d.freeTierLimits.add_expense],
            ]} />
          </Card>

          <Card title="Database migrations">
            {Object.entries(d.migrations).map(([name, m]) => (
              <div key={name} className="mb-4 last:mb-0">
                <p className="mb-1.5 flex items-center justify-between text-sm"><span className="font-mono text-zinc-200">{name}.sql</span><Flag ok={m.applied} yes="Applied" no="Not applied" /></p>
                <p className="text-xs text-zinc-500">{Object.entries(m.objects).map(([o, ok]) => `${o} ${ok ? '✓' : '✗'}`).join(' · ')}</p>
              </div>
            ))}
            <h3 className="mb-2 mt-5 text-xs font-medium text-zinc-400">Retention</h3>
            <ul className="list-disc space-y-1 pl-5 text-xs text-zinc-500">{d.retention.map((r) => <li key={r}>{r}</li>)}</ul>
          </Card>
        </div>
      )}
    </>
  );
}
