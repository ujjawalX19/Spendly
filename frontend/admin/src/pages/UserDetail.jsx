import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, Ban, Bot, CalendarPlus, Crown, FileText, LogIn, Receipt, RotateCcw, Shield, Smartphone,
  Sparkles, UserPlus, Users as UsersIcon, XCircle, Repeat,
} from 'lucide-react';
import { adminApi } from '../lib/api';
import { useAdminData } from '../lib/useAdminData';
import { Button, Card, ErrorBanner, Metric, MetricGrid, PageHeader, ReasonDialog, Skeleton, fmtDate, fmtRelative } from '../components/ui';
import { ProDialogs } from '../components/ProDialogs';

const ACTION_LABELS = {
  user_viewed: 'Viewed profile', user_suspended: 'Suspended', user_reinstated: 'Reinstated',
  pro_granted: 'Granted Pro', pro_extended: 'Extended Pro', pro_revoked: 'Revoked Pro',
};

const EVENT_ICONS = {
  signup: UserPlus, login: LogIn, expense_created: Receipt, pdf_transactions: FileText, upi_confirmed: Smartphone,
  ai_used: Bot, subscription_added: Repeat, subscription_cancelled: Repeat, pdf_imported: FileText,
  group_created: UsersIcon, group_joined: UsersIcon, pro_changed: Crown, account_status: Shield,
};

const nullMetric = (value, note) => (value === null || value === undefined ? { value: null, note } : { value });

export default function UserDetail({ currentOwnerId }) {
  const { id } = useParams();
  const { data, error, loading, reload } = useAdminData(`/users/${id}`);
  const timeline = useAdminData(`/users/${id}/timeline`);
  const [dialog, setDialog] = useState(null); // suspend | reinstate | grant | extend | revoke
  const [notice, setNotice] = useState('');

  const u = data?.user;
  const isSelf = u?.id === currentOwnerId;

  const done = (result) => {
    setDialog(null);
    setNotice(result.authLayerUpdated === false
      ? `${result.message}. Warning: the sign-in ban could not be updated in Supabase Auth; API access is still blocked.`
      : result.message);
    reload({ quiet: true });
    timeline.reload({ quiet: true });
  };

  const setAccess = async (reason) => done(await adminApi(`/users/${id}/${dialog}`, { method: 'POST', body: { reason } }));

  return (
    <>
      <Link to="/users" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-100"><ArrowLeft className="h-4 w-4" aria-hidden />Users</Link>

      <ErrorBanner error={error} onRetry={reload} />

      {loading && !u ? <Skeleton className="h-64" /> : u && (
        <>
          <PageHeader title={u.name || u.email} subtitle={<span className="font-mono">{u.email}</span>}>
            {u.role === 'admin' && <span className="inline-flex items-center gap-1 rounded-full bg-lime-400/10 px-2.5 py-1 text-xs text-lime-300"><Shield className="h-3 w-3" aria-hidden />admin</span>}
            <span className={`rounded-full px-2.5 py-1 text-xs ${u.status === 'suspended' ? 'bg-red-500/15 text-red-300' : 'bg-zinc-800 text-zinc-300'}`}>{u.status}</span>
            <span className={`rounded-full px-2.5 py-1 text-xs ${u.pro.active ? 'bg-lime-400/10 text-lime-300' : 'bg-zinc-800 text-zinc-400'}`}>{u.pro.active ? 'Pro' : 'Free'}</span>
          </PageHeader>

          {notice && <p role="status" className="mb-4 rounded-lg bg-lime-400/10 px-4 py-2.5 text-sm text-lime-200">{notice}</p>}

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card title="Account">
                <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
                  <Fact label="User ID"><span className="break-all font-mono text-xs">{u.id}</span></Fact>
                  <Fact label="Created">{fmtDate(u.createdAt)}</Fact>
                  <Fact label="Last active">{u.lastActiveAt === undefined ? 'Not tracked yet' : u.lastActiveAt ? `${fmtRelative(u.lastActiveAt)} (${fmtDate(u.lastActiveAt)})` : 'No activity recorded'}</Fact>
                  <Fact label="Last sign-in">{u.auth ? fmtDate(u.auth.lastSignInAt) : 'Unavailable'}</Fact>
                  <Fact label="Authentication provider">{u.auth?.providers?.length ? u.auth.providers.join(', ') : '—'}</Fact>
                  <Fact label="Email confirmed">{u.auth ? (u.auth.emailConfirmed ? 'Yes' : 'No') : '—'}</Fact>
                  <Fact label="Status">{u.status}</Fact>
                  <Fact label="Plan">{u.pro.active ? (u.pro.expiresAt ? `Pro until ${fmtDate(u.pro.expiresAt)}` : 'Pro, no expiry') : u.pro.flagged ? `Free (Pro expired ${fmtDate(u.pro.expiresAt)})` : 'Free'}</Fact>
                  <Fact label="Budget / savings target">{u.settings.monthlyBudgetSet ? 'Budget set' : 'No budget'} · {u.settings.savingsTargetSet ? 'target set' : 'no target'}</Fact>
                  <Fact label="Streak">{u.streak.current ?? 0} days (best {u.streak.longest ?? 0}, {u.streak.freezes ?? 0} freezes)</Fact>
                </dl>
              </Card>

              <Card title="Usage" subtitle="Counts only — amounts, merchants and chat contents are never shown">
                <MetricGrid>
                  <Metric label="Expenses, all time" metric={nullMetric(data.usage.expensesTotal)} />
                  <Metric label="Expenses, 30 days" metric={nullMetric(data.usage.expenses30d)} />
                  <Metric label="Income" metric={nullMetric(data.usage.income, 'Vittova does not track income')} />
                  <Metric label="Goals" metric={nullMetric(data.usage.goals)} hint="Savings target set (one per user)" />
                  <Metric label="Subscriptions" metric={nullMetric(data.usage.subscriptions)} hint={data.usage.subscriptions === null ? undefined : `${data.usage.recurringBills ?? 0} bills, ${data.usage.cancelledSubscriptions ?? 0} cancelled`} />
                  <Metric label="Group Pools" metric={nullMetric(data.usage.groupPools)} />
                  <Metric label="AI questions, all time" metric={nullMetric(data.usage.aiQuestionsTotal)} />
                  <Metric label="AI questions, 30 days" metric={nullMetric(data.usage.aiQuestions30d)} />
                  <Metric label="UPI detections" metric={nullMetric(data.usage.upiDetections, 'Stay on the device until confirmed')} />
                  <Metric label="UPI confirmations, 30d" metric={nullMetric(data.usage.upiConfirmations30d)} />
                  <Metric label="Receipt scans, 30d" metric={nullMetric(data.usage.receiptScans30d)} />
                  <Metric label="PDF imports" metric={nullMetric(data.usage.pdfImports)} />
                  <Metric label="CSV imports" metric={nullMetric(data.usage.csvImports, 'Not a Vittova feature')} />
                </MetricGrid>
              </Card>

              <Timeline state={timeline} />
            </div>

            <div className="space-y-6">
              <Card title="Pro entitlement" subtitle="Manual grants only — billing is not connected">
                <p className="mb-4 text-sm text-zinc-300">
                  {u.pro.active ? (u.pro.expiresAt ? `Active until ${fmtDate(u.pro.expiresAt)}` : 'Active, no expiry')
                    : u.pro.flagged ? `Expired ${fmtDate(u.pro.expiresAt)}` : 'Free plan'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={() => setDialog('grant')}><Crown className="h-4 w-4" aria-hidden />{u.pro.flagged ? 'Set new Pro' : 'Grant Pro'}</Button>
                  {u.pro.flagged && u.pro.expiresAt && <Button onClick={() => setDialog('extend')}><CalendarPlus className="h-4 w-4" aria-hidden />Extend</Button>}
                  {u.pro.flagged && <Button variant="danger" onClick={() => setDialog('revoke')}><XCircle className="h-4 w-4" aria-hidden />Revoke</Button>}
                </div>
              </Card>

              <Card title="Access">
                {isSelf ? <p className="text-sm text-zinc-500">This is your owner account.</p>
                  : u.role === 'admin' ? <p className="text-sm text-zinc-500">Admin accounts cannot be suspended here.</p>
                    : u.status === 'suspended' ? (
                      <>
                        <p className="mb-4 text-sm text-zinc-400">Suspended: API requests and token refresh are blocked.</p>
                        <Button onClick={() => setDialog('reinstate')}><RotateCcw className="h-4 w-4" aria-hidden />Reinstate</Button>
                      </>
                    ) : (
                      <>
                        <p className="mb-4 text-sm text-zinc-400">Suspending blocks all API access immediately and stops sign-in refresh. Data is kept.</p>
                        <Button variant="danger" onClick={() => setDialog('suspend')}><Ban className="h-4 w-4" aria-hidden />Suspend account</Button>
                      </>
                    )}
              </Card>

              <Card title="Admin history">
                {data.auditTrail === null ? <p className="text-sm text-amber-300/80">Audit log unavailable (run v1.4 migration).</p>
                  : data.auditTrail.length === 0 ? <p className="text-sm text-zinc-500">No admin actions yet.</p> : (
                    <ol className="space-y-3">
                      {data.auditTrail.map((a) => (
                        <li key={a.id} className="border-b border-zinc-800/60 pb-3 text-sm last:border-0 last:pb-0">
                          <p className="text-zinc-200">{ACTION_LABELS[a.action] || a.action}</p>
                          {a.details?.reason && <p className="text-xs text-zinc-500">“{a.details.reason}”</p>}
                          <p className="text-[11px] text-zinc-600">{fmtDate(a.at)}</p>
                        </li>
                      ))}
                    </ol>
                  )}
              </Card>
            </div>
          </div>

          <ReasonDialog
            open={dialog === 'suspend'} danger title="Suspend account" confirmLabel="Suspend"
            description={`${u.email} will be blocked from the app immediately.`}
            onCancel={() => setDialog(null)} onConfirm={setAccess}
          />
          <ReasonDialog
            open={dialog === 'reinstate'} title="Reinstate account" confirmLabel="Reinstate"
            description={`${u.email} will regain access.`}
            onCancel={() => setDialog(null)} onConfirm={setAccess}
          />
          <ProDialogs user={{ id: u.id, email: u.email, expiresAt: u.pro.expiresAt }} dialog={dialog} onClose={() => setDialog(null)} onDone={done} />
        </>
      )}
    </>
  );
}

function Timeline({ state }) {
  const { data, error, loading, reload } = state;
  return (
    <Card title="Activity timeline" subtitle={data ? `Last ${data.windowDays} days · grouped per day · no amounts or contents` : undefined}>
      <ErrorBanner error={error} onRetry={reload} />
      {loading && !data ? <Skeleton className="h-40" /> : data && (
        <>
          {data.unavailable.length > 0 && <p className="mb-3 text-xs text-amber-300/80">Unavailable: {data.unavailable.join(', ')}</p>}
          {data.events.length === 0 ? <p className="text-sm text-zinc-500">No recorded activity in this window.</p> : (
            <ol className="relative space-y-4 border-l border-zinc-800 pl-6">
              {data.events.map((e, i) => {
                const Icon = EVENT_ICONS[e.type] || Sparkles;
                return (
                  <li key={`${e.at}-${e.type}-${i}`} className="relative">
                    <span className="absolute -left-[33px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 ring-1 ring-zinc-700">
                      <Icon className={`h-3 w-3 ${e.type === 'pro_changed' || e.type === 'account_status' ? 'text-lime-300' : 'text-zinc-400'}`} aria-hidden />
                    </span>
                    <p className="text-sm text-zinc-200">{e.label}{e.reason && <span className="text-zinc-500"> — “{e.reason}”</span>}</p>
                    <p className="text-[11px] text-zinc-500">{fmtDate(e.at)}</p>
                  </li>
                );
              })}
            </ol>
          )}
          {data.truncated && <p className="mt-3 text-xs text-zinc-500">Very active user: only the most recent 1,000 expenses and questions were scanned.</p>}
          <details className="mt-4 text-xs text-zinc-500">
            <summary className="cursor-pointer select-none hover:text-zinc-300">Not recorded by Vittova</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">{data.notTracked.map((n) => <li key={n}>{n}</li>)}</ul>
          </details>
        </>
      )}
    </Card>
  );
}

function Fact({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-zinc-200">{children}</dd>
    </div>
  );
}
