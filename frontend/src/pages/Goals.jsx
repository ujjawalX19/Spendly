/**
 * Savings goals (v1.14) — what the user is saving for, how far along they
 * are, what to put aside each month, and milestone rewards.
 *
 * Progress is only what the user records as put aside: Vittova can't see a
 * bank balance, so every amount is labelled self-reported, and spending less
 * is never counted as saving. Progress, pace, suggestions and rewards all come
 * from the server (GET /api/goals). Adding money goes through the offline
 * queue: without signal it is kept on the phone, shown as waiting, and sent
 * once (it carries its own reference, so a retry is never counted twice).
 */
import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Archive, Check, ChevronDown, CloudOff, Loader2, Pencil, PiggyBank, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiJson } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';
import { inr, parseAmount } from '../lib/moneyDisplay';
import { goalPace, rewardLine } from '../lib/rewardsDisplay';
import { istDateKey } from '../lib/offlineQueue';
import { submitAction } from '../lib/missionSync';
import { usePendingActions } from '../hooks/usePendingActions';
import { EmptyState, ErrorState, PrimaryButton, SecondaryButton, SectionLabel, Skeleton, StatusPill } from '../components/ui';

const fmtDay = (key) => new Date(`${key}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

function Sheet({ title, onClose, children }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="v-scrim absolute inset-0" onClick={onClose} />
      <motion.div role="dialog" aria-modal="true" aria-label={title}
        className="v-sheet relative z-10 max-h-[92vh] w-full max-w-md overflow-y-auto p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom)+var(--v-kb,0px))]"
        initial={reduce ? false : { y: '100%' }} animate={{ y: 0 }} exit={reduce ? { opacity: 0 } : { y: '100%' }}
        transition={{ type: 'tween', duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-ink-2"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function Field({ label, hint, children, id }) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

function GoalForm({ goal, kinds, onClose, onSaved }) {
  const { session } = useAuth();
  const tomorrow = (() => { const d = new Date(Date.now() + 86400000); return istDateKey(d); })();
  const [name, setName] = useState(goal?.name || '');
  const [kind, setKind] = useState(goal?.kind || 'custom');
  const [target, setTarget] = useState(goal ? String(goal.targetInr) : '');
  const [date, setDate] = useState(goal?.targetDate || '');
  const [plan, setPlan] = useState(goal?.planMonthlyInr != null ? String(goal.planMonthlyInr) : '');
  const [note, setNote] = useState(goal?.note || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    const t = parseAmount(target);
    if (!name.trim()) return setError('Give the goal a name.');
    if (t.error) return setError(t.error);
    if (!date) return setError('Pick a target date.');
    const p = plan.trim() ? parseAmount(plan) : null;
    if (p?.error) return setError(`Monthly plan: ${p.error}`);
    setSaving(true);
    try {
      const body = { name: name.trim(), kind, targetInr: Math.round(t.amount), targetDate: date, note: note.trim() || null, planMonthlyInr: p ? Math.round(p.amount) : null };
      const r = goal
        ? await apiJson(`/goals/${goal.id}`, { session, method: 'PATCH', body })
        : await apiJson('/goals', { session, method: 'POST', body });
      onSaved(r);
    } catch (err) {
      setError(friendlyError(err, "We couldn't save the goal. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title={goal ? 'Edit goal' : 'New savings goal'} onClose={onClose}>
      <Field label="Name" id="goal-name"><input id="goal-name" className="v-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="New laptop" /></Field>
      <Field label="What it's for" id="goal-kind">
        <select id="goal-kind" className="v-input" value={kind} onChange={(e) => setKind(e.target.value)}>
          {kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
      </Field>
      <Field label="Target" id="goal-target" hint="Goals of ₹1,000 or more earn milestone rewards.">
        <input id="goal-target" className="v-input font-mono" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="₹40,000" />
      </Field>
      <Field label="Target date" id="goal-date"><input id="goal-date" type="date" className="v-input" min={tomorrow} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Monthly plan (optional)" id="goal-plan" hint="What you plan to put aside each month. We'll tell you if it covers the goal.">
        <input id="goal-plan" className="v-input font-mono" inputMode="numeric" value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="₹5,000" />
      </Field>
      <Field label="Note (optional)" id="goal-note"><input id="goal-note" className="v-input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
      <PrimaryButton onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4" aria-hidden="true" /> {goal ? 'Save changes' : 'Create goal'}</>}</PrimaryButton>
    </Sheet>
  );
}

function AddMoney({ goal, onClose, onDone }) {
  const { session } = useAuth();
  const today = istDateKey();
  const [amount, setAmount] = useState('');
  const [on, setOn] = useState(today);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    const a = parseAmount(amount);
    if (a.error) return setError(a.error);
    setSaving(true);
    try {
      const r = await submitAction(session, 'goal_contribution', { amountInr: Math.round(a.amount), contributedOn: on, note: note.trim() || undefined }, { goalId: goal.id });
      if (r.status === 'failed') setError(r.message || "We couldn't add that. Please try again.");
      else onDone(r.status);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet title={`Add to ${goal.name}`} onClose={onClose}>
      <p className="mb-4 text-sm text-ink-2">Record money you've already moved to savings. Vittova can't see your bank, so this is self-reported.</p>
      <Field label="Amount put aside" id="add-amount">
        <input id="add-amount" autoFocus className="v-input font-mono text-lg" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="₹500" />
      </Field>
      <Field label="Date" id="add-date"><input id="add-date" type="date" className="v-input" max={today} value={on} onChange={(e) => setOn(e.target.value)} /></Field>
      <Field label="Note (optional)" id="add-note"><input id="add-note" className="v-input" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
      <PrimaryButton onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4" aria-hidden="true" /> Add</>}</PrimaryButton>
    </Sheet>
  );
}

function Bar({ pct, label }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out motion-reduce:transition-none" style={{ width: `${pct}%` }} />
    </div>
  );
}

function GoalCard({ goal, waiting, onAdd, onEdit, onArchive, onRestore, onRemove, busy }) {
  const [open, setOpen] = useState(false);
  const archived = goal.status === 'archived';
  return (
    <li className="v-block p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-ink">{goal.name}</p>
          <p className="text-xs text-ink-3">{goal.kindLabel.toLowerCase() !== goal.name.toLowerCase() ? `${goal.kindLabel} · ` : ''}by {fmtDay(goal.targetDate)}</p>
        </div>
        <StatusPill tone={goal.pace === 'reached' || goal.pace === 'on_track' ? 'good' : 'neutral'}>{goalPace(goal)}</StatusPill>
      </div>
      <div className="mt-3"><Bar pct={goal.percent} label={`${goal.name} progress`} /></div>
      <div className="mt-1.5 flex justify-between text-xs">
        <span className="text-ink-2"><span className="font-mono-finance font-semibold text-ink">{inr(goal.savedInr)}</span> of {inr(goal.targetInr)} · {goal.percent}%</span>
        <span className="text-ink-3">self-reported</span>
      </div>
      {waiting > 0 && <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-2"><CloudOff className="h-3.5 w-3.5" aria-hidden="true" /> {inr(waiting)} waiting to sync</p>}
      {goal.suggested && !archived && (
        <p className="mt-2 text-xs text-ink-2">
          To finish on time: about <span className="font-semibold text-ink">{inr(goal.suggested.monthlyInr)}</span> a month ({inr(goal.suggested.weeklyInr)} a week).
          {goal.planCovers === true && ' Your plan covers it.'}
          {goal.planCovers === false && ` Your plan of ${inr(goal.planMonthlyInr)} a month falls short.`}
        </p>
      )}

      {/* Milestones */}
      <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Milestones">
        {goal.milestones.map((m) => (
          <li key={m.pct} className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${m.reached ? 'border-transparent bg-surface-2 text-ink' : 'border-line text-ink-3'}`}
            title={m.rewarded ? `Rewarded ${rewardLine(m.reward)}` : undefined}>
            {m.reached ? '✓ ' : ''}{m.label}{m.reversed ? ' (corrected)' : ''}
          </li>
        ))}
      </ol>
      {!goal.rewards.eligible && <p className="mt-2 text-[11px] text-ink-3">{goal.rewards.why}</p>}
      {goal.rewards.eligible && goal.percent >= 100 && goal.rewards.completionWaitDays > 0 && !goal.milestones[4].rewarded && (
        <p className="mt-2 text-[11px] text-ink-3">The 100% reward is paid once the goal is a week old ({goal.rewards.completionWaitDays} day{goal.rewards.completionWaitDays === 1 ? '' : 's'} to go).</p>
      )}

      <div className={`mt-3 grid gap-2 ${archived ? 'grid-cols-1' : 'grid-cols-[1.4fr_1fr_1fr]'}`}>
        {!archived && <SecondaryButton className="px-2 text-[13px]" onClick={onAdd} disabled={busy}><Plus className="h-4 w-4" aria-hidden="true" /> Add money</SecondaryButton>}
        {!archived && <SecondaryButton className="px-2 text-[13px]" onClick={onEdit} disabled={busy} aria-label={`Edit ${goal.name}`}><Pencil className="h-4 w-4" aria-hidden="true" /> Edit</SecondaryButton>}
        {!archived && <SecondaryButton className="px-2 text-[13px]" onClick={onArchive} disabled={busy} aria-label={`Archive ${goal.name}`}><Archive className="h-4 w-4" aria-hidden="true" /> Archive</SecondaryButton>}
        {archived && <SecondaryButton onClick={onRestore} disabled={busy}><RotateCcw className="h-4 w-4" aria-hidden="true" /> Restore</SecondaryButton>}
      </div>

      {goal.contributions.length > 0 && (
        <div className="mt-3 border-t border-line pt-2">
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="v-press flex min-h-[44px] w-full items-center justify-between text-xs font-semibold text-ink-2">
            {goal.contributions.length} entr{goal.contributions.length === 1 ? 'y' : 'ies'}
            <ChevronDown className={`h-4 w-4 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {open && (
            <ul className="space-y-1">
              {goal.contributions.map((c) => (
                <li key={c.id} className="flex min-h-[44px] items-center justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-mono-finance text-ink">{inr(c.amountInr)}</span>
                    <span className="ml-2 text-xs text-ink-3">{fmtDay(c.contributedOn)} · self-reported{c.note ? ` · ${c.note}` : ''}</span>
                  </span>
                  {!archived && (
                    <button type="button" onClick={() => onRemove(c)} aria-label={`Remove ${inr(c.amountInr)} entry from ${fmtDay(c.contributedOn)}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-3"><Trash2 className="h-4 w-4" /></button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

export default function Goals() {
  const { session } = useAuth();
  const pending = usePendingActions(session);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [disabled, setDisabled] = useState(false);
  const [form, setForm] = useState(null); // null | 'new' | goal
  const [adding, setAdding] = useState(null);
  const [removing, setRemoving] = useState(null); // { goal, contribution }
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const apply = (r) => setData({ goals: r.goals, archived: r.archived, kinds: r.kinds, limits: r.limits, note: r.note, rewards: r.rewards });

  const load = useCallback(async () => {
    setError('');
    try {
      apply(await apiJson('/goals', { session }));
    } catch (err) {
      if (err?.data?.code === 'FEATURE_DISABLED') setDisabled(true);
      else setError(friendlyError(err, "We couldn't load your goals."));
    }
  }, [session]);

  useEffect(() => { load(); }, [load]);
  // When a queued contribution syncs, show the new totals.
  const synced = pending.filter((i) => i.kind === 'goal_contribution' && i.status === 'done').length;
  useEffect(() => { if (synced) load(); }, [synced, load]);

  const waitingFor = (goalId) => pending
    .filter((i) => i.kind === 'goal_contribution' && i.status === 'pending' && i.goalId === goalId)
    .reduce((s, i) => s + (Number(i.body.amountInr) || 0), 0);

  const act = async (fn, okText) => {
    setBusy(true);
    setNote('');
    try {
      apply(await fn());
      if (okText) setNote(okText);
    } catch (err) {
      setNote(friendlyError(err, "That didn't work. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  if (disabled) return <div className="pt-10 text-center text-sm text-ink-2">Savings goals aren&apos;t available right now.</div>;
  if (error && !data) return <div className="pt-10"><ErrorState onRetry={load} message={error} /></div>;
  if (!data) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading goals">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-44 w-full rounded-2xl" />
      </div>
    );
  }

  const active = data.goals.filter((g) => g.status === 'active').length;

  return (
    <div className="space-y-6 pb-6 text-ink">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Savings goals</h1>
          <p className="mt-1 text-sm text-ink-2">Set a target, put money aside, track it here.</p>
        </div>
        <button type="button" onClick={() => setForm('new')} disabled={active >= data.limits.maxActive}
          className="v-press v-btn-primary shrink-0 px-3 text-[13px] disabled:opacity-50"><Plus className="h-4 w-4" aria-hidden="true" /> New goal</button>
      </header>

      <p className="rounded-xl bg-surface px-4 py-3 text-xs text-ink-2">{data.note}</p>
      {note && <p role="status" className="text-sm text-ink-2">{note}</p>}

      {data.goals.length === 0 ? (
        <EmptyState icon={PiggyBank} title="No goals yet"
          body="A laptop, an emergency fund, a trip: name it, set a date, and Vittova shows what to put aside each month."
          action={<PrimaryButton onClick={() => setForm('new')}>Create your first goal</PrimaryButton>} />
      ) : (
        <ul className="space-y-3">
          {data.goals.map((g) => (
            <GoalCard key={g.id} goal={g} busy={busy} waiting={waitingFor(g.id)}
              onAdd={() => setAdding(g)} onEdit={() => setForm(g)}
              onArchive={() => act(() => apiJson(`/goals/${g.id}/archive`, { session, method: 'POST' }), 'Goal archived. Restore it any time.')}
              onRemove={(c) => setRemoving({ goal: g, contribution: c })} />
          ))}
        </ul>
      )}

      {data.archived.length > 0 && (
        <section>
          <button type="button" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived} className="v-press flex min-h-[44px] w-full items-center justify-between">
            <SectionLabel>Archived ({data.archived.length})</SectionLabel>
            <ChevronDown className={`h-4 w-4 text-ink-3 transition-transform motion-reduce:transition-none ${showArchived ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {showArchived && (
            <ul className="space-y-3">
              {data.archived.map((g) => (
                <GoalCard key={g.id} goal={g} busy={busy} waiting={0}
                  onRestore={() => act(() => apiJson(`/goals/${g.id}/restore`, { session, method: 'POST' }), 'Goal restored.')} />
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="text-xs text-ink-3">
        <p>Milestones: goal set {rewardLine(data.rewards[0])}; 25%, 50% and 75% {rewardLine(data.rewards[25])} each; reached {rewardLine(data.rewards[100])}. Each is paid once per goal, for goals of {inr(data.limits.minRewardTarget)} or more and the first {data.limits.rewardedGoalsPerMonth} goals you create each month. Removing an entry reverses the Points for any milestone the goal no longer reaches.</p>
      </section>

      <AnimatePresence>
        {form && (
          <GoalForm goal={form === 'new' ? null : form} kinds={data.kinds} onClose={() => setForm(null)}
            onSaved={(r) => { apply(r); setForm(null); setNote(form === 'new' ? 'Goal created.' : 'Goal saved.'); }} />
        )}
        {adding && (
          <AddMoney goal={adding} onClose={() => setAdding(null)}
            onDone={(status) => { setAdding(null); setNote(status === 'pending' ? 'Saved on this phone. It will be added once you are back online.' : 'Added.'); load(); }} />
        )}
        {removing && (
          <Sheet title="Remove this entry?" onClose={() => setRemoving(null)}>
            <p className="mb-4 text-sm text-ink-2">
              {inr(removing.contribution.amountInr)} from {fmtDay(removing.contribution.contributedOn)} comes off {removing.goal.name}. If the goal drops below a milestone, the Points for it are reversed and it is not paid again.
            </p>
            <PrimaryButton disabled={busy} onClick={async () => {
              const { goal, contribution } = removing;
              setRemoving(null);
              await act(() => apiJson(`/goals/${goal.id}/contributions/${contribution.id}`, { session, method: 'DELETE' }), 'Entry removed.');
            }}>Remove entry</PrimaryButton>
            <SecondaryButton className="mt-2 w-full" onClick={() => setRemoving(null)}>Keep it</SecondaryButton>
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
}
