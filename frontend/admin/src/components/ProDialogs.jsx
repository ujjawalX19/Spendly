import { useState } from 'react';
import { adminApi } from '../lib/api';
import { ReasonDialog, fmtDate } from './ui';

const GRANT_OPTIONS = [['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['365', '1 year'], ['none', 'No expiry']];
const EXTEND_OPTIONS = [['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['365', '1 year']];

const selectClass = 'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-lime-400 focus:outline-none';

/**
 * Grant / extend / revoke Pro for one user. Shared by the user detail page and
 * the Pro management page. Every action requires a reason (audited server-side).
 *
 * @param {{id: string, email: string, expiresAt: string|null}} user
 * @param {'grant'|'extend'|'revoke'|string|null} dialog
 */
export function ProDialogs({ user, dialog, onClose, onDone }) {
  const [grantDays, setGrantDays] = useState('30');
  const [extendDays, setExtendDays] = useState('30');

  const grant = async (reason) => {
    const expiresAt = grantDays === 'none' ? null : new Date(Date.now() + Number(grantDays) * 86400000).toISOString();
    onDone(await adminApi(`/users/${user.id}/pro`, { method: 'POST', body: { reason, expiresAt } }));
  };
  const extend = async (reason) => onDone(await adminApi(`/users/${user.id}/pro/extend`, { method: 'POST', body: { reason, days: Number(extendDays) } }));
  const revoke = async (reason) => onDone(await adminApi(`/users/${user.id}/pro`, { method: 'DELETE', body: { reason } }));

  const base = user.expiresAt && new Date(user.expiresAt) > new Date() ? new Date(user.expiresAt) : new Date();
  const extendedTo = new Date(base.getTime() + Number(extendDays) * 86400000);

  return (
    <>
      <ReasonDialog
        open={dialog === 'grant'} title="Grant Pro" confirmLabel="Grant Pro"
        description={`Sets ${user.email}'s Pro entitlement, replacing any existing expiry. No payment is taken or recorded.`}
        onCancel={onClose} onConfirm={grant}
      >
        <label htmlFor="grant-days" className="mb-1.5 block text-xs font-medium text-zinc-400">Duration (from now)</label>
        <select id="grant-days" value={grantDays} onChange={(e) => setGrantDays(e.target.value)} className={selectClass}>
          {GRANT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </ReasonDialog>

      <ReasonDialog
        open={dialog === 'extend'} title="Extend Pro" confirmLabel="Extend"
        description={`Adds time to ${user.email}'s current expiry (or from today if it has lapsed).`}
        onCancel={onClose} onConfirm={extend}
      >
        <label htmlFor="extend-days" className="mb-1.5 block text-xs font-medium text-zinc-400">Add</label>
        <select id="extend-days" value={extendDays} onChange={(e) => setExtendDays(e.target.value)} className={selectClass}>
          {EXTEND_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <p className="mt-2 text-xs text-zinc-500">New expiry: {fmtDate(extendedTo.toISOString())}</p>
      </ReasonDialog>

      <ReasonDialog
        open={dialog === 'revoke'} danger title="Revoke Pro" confirmLabel="Revoke"
        description={`Pro features stop working for ${user.email} on their next request.`}
        onCancel={onClose} onConfirm={revoke}
      />
    </>
  );
}
