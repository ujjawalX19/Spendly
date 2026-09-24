/**
 * Campaigns — sponsored challenge management (owner only).
 *
 * Everything here goes through /api/admin/campaigns, which re-checks the owner
 * on every request and audits every change. Metrics are campaign-level counts;
 * no user, transaction or spending detail is shown or shared with sponsors.
 * Voucher codes are write-only: the console shows how many exist, never the
 * codes. Rules and rewards lock once a campaign is published.
 */

import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../lib/api';
import { Button, Card, ErrorBanner, PageHeader, Skeleton, fmtDate, selectClass } from '../components/ui';

const TYPES = [
  ['no_food_delivery', 'Zero food delivery'],
  ['home_food', 'Home food'],
  ['no_impulse', 'No impulse purchases'],
  ['daily_target', 'Stay under a daily target'],
  ['weekend_budget', 'Weekend budget'],
  ['spend_less', 'Spend less than usual'],
];
const PARAM_FOR = { daily_target: ['dailyTarget', 'Daily target (₹)'], weekend_budget: ['weekendBudget', 'Weekend budget (₹)'], spend_less: ['amount', 'Spend less by (₹)'] };
const NEXT = { draft: ['scheduled', 'archived'], scheduled: ['paused', 'ended'], active: ['paused', 'ended'], paused: ['scheduled', 'ended'], ended: ['archived'], archived: [] };
const ACTION_LABEL = { scheduled: 'Publish / resume', paused: 'Pause', ended: 'End now', archived: 'Archive' };
const STATUS_STYLE = {
  draft: 'bg-zinc-800 text-zinc-300', scheduled: 'bg-sky-500/15 text-sky-300', active: 'bg-lime-400/15 text-lime-300',
  paused: 'bg-amber-400/15 text-amber-300', ended: 'bg-zinc-800 text-zinc-400', archived: 'bg-zinc-900 text-zinc-500',
};

const input = 'w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-lime-400 focus:outline-none';
const toLocalInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

function Field({ label, children, hint }) {
  return (
    <label className="block text-xs text-zinc-400">
      {label}
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-zinc-600">{hint}</p>}
    </label>
  );
}

function NewCampaign({ sponsors, onCreated, onSponsorAdded }) {
  const now = new Date();
  const [f, setF] = useState({
    sponsorId: '', name: '', challengeType: 'no_food_delivery', durationDays: 7, param: '',
    rewardLabel: '₹200 voucher', rewardValueInr: 200, voucherExpiry: '',
    startsAt: toLocalInput(now), endsAt: toLocalInput(new Date(now.getTime() + 30 * 86400000)),
    eligibility: 'Vittova Pro members in India. One reward per person.',
    terms: 'Complete the challenge rule for every day of the challenge while logging your spending in Vittova. Rewards are given in the order challenges are completed, while stocks last. Vouchers are issued by the sponsor and subject to the sponsor\'s terms. No purchase or payment is needed to take part.',
  });
  const [newSponsor, setNewSponsor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const addSponsor = async () => {
    setError(null);
    try {
      const { sponsor } = await adminApi('/campaigns/sponsors', { method: 'POST', body: { name: newSponsor.trim() } });
      setNewSponsor('');
      await onSponsorAdded();
      setF((prev) => ({ ...prev, sponsorId: sponsor.id }));
    } catch (e) { setError(e); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const param = PARAM_FOR[f.challengeType];
    try {
      await adminApi('/campaigns', {
        method: 'POST',
        body: {
          sponsorId: f.sponsorId, name: f.name.trim(), challengeType: f.challengeType, durationDays: Number(f.durationDays),
          params: param ? { [param[0]]: Number(f.param) } : {},
          rewardLabel: f.rewardLabel.trim(), rewardValueInr: Number(f.rewardValueInr), voucherExpiry: f.voucherExpiry || null,
          startsAt: new Date(f.startsAt).toISOString(), endsAt: new Date(f.endsAt).toISOString(),
          eligibility: f.eligibility.trim(), terms: f.terms.trim(), targetAudience: 'all_pro',
        },
      });
      onCreated();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const param = PARAM_FOR[f.challengeType];
  return (
    <Card title="New campaign" subtitle="Created as a draft. Rules and reward lock when you publish.">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Sponsor">
          <select className={`${selectClass} w-full`} value={f.sponsorId} onChange={set('sponsorId')} required>
            <option value="">Choose…</option>
            {sponsors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div className="mt-2 flex gap-2">
            <input className={input} placeholder="Add a sponsor" value={newSponsor} onChange={(e) => setNewSponsor(e.target.value)} />
            <Button onClick={addSponsor} disabled={newSponsor.trim().length < 2}>Add</Button>
          </div>
        </Field>
        <Field label="Campaign name (shown to users)"><input className={input} value={f.name} onChange={set('name')} required minLength={3} maxLength={120} placeholder="7-Day Zero Food-Delivery Challenge" /></Field>
        <Field label="Challenge" hint="Only challenges that reward spending less or more carefully.">
          <select className={`${selectClass} w-full`} value={f.challengeType} onChange={set('challengeType')}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </Field>
        <Field label="Length (days)"><input type="number" min={3} max={30} className={input} value={f.durationDays} onChange={set('durationDays')} /></Field>
        {param && <Field label={param[1]}><input type="number" min={50} className={input} value={f.param} onChange={set('param')} required /></Field>}
        <Field label="Reward (fixed, shown to users)"><input className={input} value={f.rewardLabel} onChange={set('rewardLabel')} required /></Field>
        <Field label="Reward value (₹)"><input type="number" min={1} className={input} value={f.rewardValueInr} onChange={set('rewardValueInr')} /></Field>
        <Field label="Voucher use-by (optional)"><input type="date" className={input} value={f.voucherExpiry} onChange={set('voucherExpiry')} /></Field>
        <Field label="Opens"><input type="datetime-local" className={input} value={f.startsAt} onChange={set('startsAt')} /></Field>
        <Field label="Closes"><input type="datetime-local" className={input} value={f.endsAt} onChange={set('endsAt')} /></Field>
        <div className="sm:col-span-2"><Field label="Eligibility"><textarea className={input} rows={2} value={f.eligibility} onChange={set('eligibility')} /></Field></div>
        <div className="sm:col-span-2"><Field label="Terms (shown before joining)"><textarea className={input} rows={4} value={f.terms} onChange={set('terms')} /></Field></div>
        <div className="sm:col-span-2 flex items-center gap-3">
          <Button type="submit" variant="primary" loading={busy}>Create draft</Button>
          <p className="text-[11px] text-zinc-500">Users always see "Sponsored by {sponsors.find((s) => s.id === f.sponsorId)?.name || '…'}".</p>
        </div>
        <div className="sm:col-span-2"><ErrorBanner error={error} /></div>
      </form>
    </Card>
  );
}

function CampaignRow({ c, onChanged }) {
  const [codes, setCodes] = useState('');
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(null);
  const m = c.metrics || {};

  const act = async (kind, fn) => {
    setBusy(kind);
    setError(null);
    try { await fn(); await onChanged(); } catch (e) { setError(e); } finally { setBusy(''); }
  };
  const addCodes = () => act('codes', async () => {
    const list = codes.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    await adminApi(`/campaigns/${c.id}/vouchers`, { method: 'POST', body: { codes: list } });
    setCodes('');
  });

  return (
    <Card
      title={c.name}
      subtitle={`${TYPES.find(([v]) => v === c.challenge_type)?.[1] || c.challenge_type} · ${c.duration_days} days · ${c.reward_label} · ${fmtDate(c.starts_at, { time: false })} → ${fmtDate(c.ends_at, { time: false })}`}
      action={<span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${STATUS_STYLE[c.effective_status]}`}>{c.effective_status}</span>}
    >
      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
        {[['Impressions', m.impressions], ['Views', m.views], ['Enrolments', m.enrollments], ['Active', m.activeParticipants], ['Completed', m.completed],
          ['Completion rate', m.completionRate === null ? '—' : `${m.completionRate}%`], ['Rewards issued', m.rewardsIssued], ['Redeemed', m.rewardsRedeemed],
          ['Vouchers', m.voucherInventory], ['Remaining', m.remainingInventory]].map(([k, v]) => (
          <div key={k}><dt className="text-xs text-zinc-500">{k}</dt><dd className="tabular text-lg font-semibold text-zinc-100">{v ?? '—'}</dd></div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {NEXT[c.effective_status].map((s) => (
          <Button key={s} variant={s === 'ended' || s === 'archived' ? 'danger' : 'secondary'} loading={busy === s}
            onClick={() => act(s, () => adminApi(`/campaigns/${c.id}/status`, { method: 'POST', body: { status: s } }))}>{ACTION_LABEL[s]}</Button>
        ))}
        <Button variant="ghost" loading={busy === 'report'} onClick={() => act('report', async () => setReport((await adminApi(`/campaigns/${c.id}/report`)).report))}>Sponsor report</Button>
      </div>
      {!['ended', 'archived'].includes(c.effective_status) && (
        <div className="mt-4">
          <p className="text-xs text-zinc-500">Add the sponsor's voucher codes (one per line). They are never shown here again.</p>
          <textarea className={`${input} mt-1 font-mono`} rows={3} value={codes} onChange={(e) => setCodes(e.target.value)} placeholder="BRAND-200-0001" />
          <Button className="mt-2" loading={busy === 'codes'} disabled={!codes.trim()} onClick={addCodes}>Add codes</Button>
        </div>
      )}
      {report && (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-300">
          <p className="mb-2 font-semibold text-zinc-100">Safe to share with the sponsor</p>
          <ul className="grid grid-cols-2 gap-1 sm:grid-cols-4">
            {Object.entries(report).filter(([k]) => k !== 'note').map(([k, v]) => <li key={k}>{k}: <span className="tabular text-zinc-100">{v ?? '—'}</span></li>)}
          </ul>
          <p className="mt-2 text-zinc-500">{report.note}</p>
        </div>
      )}
      <div className="mt-3"><ErrorBanner error={error} /></div>
    </Card>
  );
}

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState(null);
  const [sponsors, setSponsors] = useState([]);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [c, s] = await Promise.all([adminApi('/campaigns'), adminApi('/campaigns/sponsors')]);
      setCampaigns(c.campaigns);
      setSponsors(s.sponsors);
    } catch (e) { setError(e); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const disabled = error?.data?.code === 'FEATURE_DISABLED';
  return (
    <div>
      <PageHeader title="Campaigns" subtitle="Sponsored money challenges. Sponsors see counts only, never user data.">
        {!disabled && <Button variant="primary" onClick={() => setCreating((v) => !v)}>{creating ? 'Close' : 'New campaign'}</Button>}
      </PageHeader>
      {disabled ? (
        <Card><p className="text-sm text-zinc-400">The campaign dashboard is switched off. Set <code className="text-zinc-200">CAMPAIGN_DASHBOARD_ENABLED=true</code> on the server (after running <code className="text-zinc-200">v1_10_sponsored_challenges.sql</code>) to use it. Users see challenges only when <code className="text-zinc-200">SPONSORED_CHALLENGES_ENABLED=true</code>.</p></Card>
      ) : (
        <div className="space-y-5">
          <ErrorBanner error={error} onRetry={load} />
          {creating && <NewCampaign sponsors={sponsors} onSponsorAdded={load} onCreated={() => { setCreating(false); load(); }} />}
          {!campaigns && !error && <Skeleton className="h-40" />}
          {campaigns && !campaigns.length && <Card><p className="text-sm text-zinc-400">No campaigns yet.</p></Card>}
          {campaigns?.map((c) => <CampaignRow key={c.id} c={c} onChanged={load} />)}
        </div>
      )}
    </div>
  );
}
