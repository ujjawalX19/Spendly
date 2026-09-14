import { Link } from 'react-router-dom';
import { CreditCard, RefreshCw } from 'lucide-react';
import { useAdminData } from '../lib/useAdminData';
import { Button, Card, ErrorBanner, Metric, MetricGrid, PageHeader, Skeleton, StatusBadge, fmtDate, fmtPercent } from '../components/ui';

const COMPONENT_LABELS = {
  api: 'Backend API', database: 'Database', auth: 'Authentication', ai: 'AI / Gemini',
  upi: 'UPI processing', pdfImport: 'PDF import', background: 'Background jobs',
};

export default function Overview() {
  const overview = useAdminData('/overview', { refreshMs: 60_000 });
  const health = useAdminData('/health', { refreshMs: 60_000 });
  const d = overview.data;

  return (
    <>
      <PageHeader title="Overview" subtitle={d ? `Generated ${fmtDate(d.generatedAt)} · periods in ${d.timezone}` : 'Live figures from the production database'}>
        <Button variant="ghost" onClick={() => { overview.reload(); health.reload(); }} loading={overview.loading}>
          {!overview.loading && <RefreshCw className="h-4 w-4" aria-hidden />}Refresh
        </Button>
      </PageHeader>

      <div className="space-y-6">
        <ErrorBanner error={overview.error} onRetry={overview.reload} />

        <HealthStrip health={health} />

        {!d ? <LoadingCards /> : (
          <>
            <Card title="Users" subtitle="“Active” means an authenticated API request (tracked since the v1.4 migration)">
              <MetricGrid>
                <Metric label="Registered users" metric={d.users.total} />
                <Metric label="New today" metric={d.users.newToday} />
                <Metric label="New this week" metric={d.users.newWeek} hint="Since Monday" />
                <Metric label="New this month" metric={d.users.newMonth} />
                <Metric label="Active today" metric={d.users.activeToday} />
                <Metric label="Active, last 7 days" metric={d.users.active7d} />
                <Metric label="Active, last 30 days" metric={d.users.active30d} />
                <Metric label="Inactive (30+ days)" metric={d.users.inactive} />
                <Metric label="Suspended" metric={d.users.suspended} />
                <Metric label="Deleted, last 30 days" metric={d.users.deleted30d} />
              </MetricGrid>
            </Card>

            <Card title="Pro" subtitle="Entitlements in profiles; purchases are not enabled" action={<Link to="/pro" className="text-xs text-lime-300 hover:text-lime-200">Manage →</Link>}>
              <MetricGrid>
                <Metric label="Active Pro users" metric={d.pro.active} />
                <Metric label="Free users" metric={d.pro.freeUsers} />
                <Metric label="Pro flag set (incl. expired)" metric={d.pro.totalFlagged} />
                <Metric label="Conversion rate" metric={d.pro.conversionRate} format={fmtPercent} hint="Active Pro ÷ registered users" />
                <Metric label="New Pro, last 30 days" metric={d.pro.newPro30d} />
                <Metric label="Entitlement changes, 30 days" metric={d.pro.entitlementChanges30d} />
                <Metric label="Expiring within 7 days" metric={d.pro.expiringSoon} />
                <div className="min-w-0">
                  <p className="text-xs text-zinc-500">Revenue</p>
                  {d.pro.revenue.connected === false ? (
                    <p className="mt-2 inline-flex items-center gap-2 rounded-lg bg-zinc-800/80 px-2.5 py-1.5 text-sm text-zinc-300"><CreditCard className="h-4 w-4 text-zinc-500" aria-hidden />Billing not connected</p>
                  ) : <Metric label="" metric={d.pro.revenue} />}
                </div>
              </MetricGrid>
            </Card>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card title="Expenses & capture">
                <MetricGrid>
                  <Metric label="Expenses today" metric={d.usage.expenses.today} />
                  <Metric label="This week" metric={d.usage.expenses.week} />
                  <Metric label="This month" metric={d.usage.expenses.month} />
                  <Metric label="UPI detections" metric={d.usage.upi.detections} />
                  <Metric label="UPI confirmations (month)" metric={d.usage.upi.confirmationsMonth} />
                  <Metric label="Receipt scans (month)" metric={d.usage.receiptScansMonth} />
                </MetricGrid>
              </Card>

              <Card title="Imports">
                <MetricGrid>
                  <Metric label="PDF imports (month)" metric={d.usage.imports.pdfMonth} />
                  <Metric label="Imported transactions (month)" metric={d.usage.imports.pdfTransactionsMonth} />
                  <Metric label="PDF failures (month)" metric={d.usage.imports.pdfFailuresMonth} />
                  <Metric label="CSV imports" metric={d.usage.imports.csv} />
                </MetricGrid>
              </Card>

              <Card title="AI coach">
                <MetricGrid>
                  <Metric label="Questions today" metric={d.usage.ai.questionsToday} />
                  <Metric label="Questions, 7 days" metric={d.usage.ai.questions7d} />
                  <Metric label="Questions, 30 days" metric={d.usage.ai.questions30d} />
                  <Metric label="AI users, 30 days" metric={d.usage.ai.users30d} />
                  <Metric label="AI errors, 24h" metric={d.usage.ai.errors24h} />
                  <Metric label="AI errors, 7 days" metric={d.usage.ai.errors7d} />
                  <Metric label="Rejected replies, 7 days" metric={d.usage.ai.rejectedReplies7d} hint="Gemini output with unverified figures; calculated answer used" />
                </MetricGrid>
              </Card>

              <Card title="Group Pools, goals & subscriptions">
                <MetricGrid>
                  <Metric label="Group Pools" metric={d.usage.groups.total} />
                  <Metric label="Created this month" metric={d.usage.groups.createdMonth} />
                  <Metric label="Active pools, 7 days" metric={d.usage.groups.activePools7d} />
                  <Metric label="Shared expenses, 7 days" metric={d.usage.groups.expenses7d} />
                  <Metric label="Settlements, 7 days" metric={d.usage.groups.settlements7d} />
                  <Metric label="Savings targets set" metric={d.usage.goals.savingsTargets} />
                  <Metric label="Goals" metric={d.usage.goals.goals} />
                  <Metric label="Active recurring bills" metric={d.usage.subscriptions.recurringBillsActive} />
                  <Metric label="Recurring bills added (month)" metric={d.usage.subscriptions.recurringBillsAddedMonth} />
                  <Metric label="Subscriptions marked cancelled" metric={d.usage.subscriptions.cancelledTracked} hint={d.usage.subscriptions.note} />
                </MetricGrid>
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function HealthStrip({ health }) {
  const components = health.data?.components;
  return (
    <Card title="System status" action={<Link to="/health" className="text-xs text-lime-300 hover:text-lime-200">Details →</Link>}>
      {health.error ? <ErrorBanner error={health.error} onRetry={health.reload} /> : !components ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">{Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {Object.entries(COMPONENT_LABELS).map(([key, label]) => (
            <div key={key} className="rounded-xl bg-zinc-950/60 px-3 py-2.5">
              <p className="mb-1.5 truncate text-xs text-zinc-500">{label}</p>
              <StatusBadge status={components[key]?.status} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function LoadingCards() {
  return (
    <div className="space-y-6">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-2xl border border-zinc-800/80 p-5">
          <Skeleton className="mb-5 h-4 w-32" />
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">{Array.from({ length: 8 }, (_, j) => <Skeleton key={j} className="h-12" />)}</div>
        </div>
      ))}
    </div>
  );
}
