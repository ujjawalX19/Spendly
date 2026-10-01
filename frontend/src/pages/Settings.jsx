/**
 * Settings.jsx — Vittova "Profile" tab
 * ─────────────────────────────────────────────────────────────
 * Budget and target, notifications, the features that moved off Home
 * (groups, recurring charges, statement import, audit, challenges),
 * data export, legal links and account deletion.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet, Target, Trash2, Shield, FileText, Crown,
  ChevronRight, Loader2, AlertTriangle, Check, LogOut, Download,
  Users, Repeat, Radar, Gift, Bell, Trophy, Zap, Settings2, MessageSquareText
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePro } from '../contexts/ProContext';
import { usePaymentTracking } from '../contexts/PaymentTrackingContext';
import { TRACKING } from '../lib/paymentTracking';
import SmsAccessSheet from '../components/SmsAccessSheet';
import { useExpenses } from '../hooks/useExpenses';
import { friendlyError } from '../lib/errors';
import { API_URL as API_BASE_URL, apiJson } from '../lib/apiConfig';
import { remindersSupported, remindersWanted, turnRemindersOff, turnRemindersOn } from '../lib/debitReminders';

const API_URL = API_BASE_URL;


/**
 * fetch() resolves on 4xx/5xx, so every call has to check `ok` itself.
 * This turns a failed response into an Error carrying the status and the
 * server's own message, which is what friendlyError reads.
 */
async function httpError(response) {
  const body = await response.json().catch(() => ({}));
  const err = new Error(body.message || `HTTP ${response.status}`);
  err.status = response.status;
  err.data = body;
  return err;
}

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 280, damping: 22 } },
};

/**
 * A titled group of rows in one container, divided by hairlines: the page reads
 * as a few sections instead of a stack of separate cards. `note` sits under the
 * group (a status line).
 */
function SettingsGroup({ title, note, children }) {
  return (
    <motion.section variants={cardVariants} aria-label={title}>
      <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-zinc-500">{title}</h2>
      <div className="divide-y divide-white/[.06] overflow-hidden rounded-2xl border border-white/[.06] bg-zinc-900">
        {children}
      </div>
      {note}
    </motion.section>
  );
}

// `color` is accepted for the few rows that carry a state (an export error);
// ordinary rows share one neutral icon, so colour keeps its meaning.
function SettingRow({ icon: Icon, label, value, color, onClick, danger = false }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button', onClick } : {})}
      className={`flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${onClick ? 'hover:bg-white/[.03] active:bg-white/[.05]' : ''}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${danger ? 'bg-red-500/10' : 'bg-white/[.06]'}`}>
          <Icon className={`h-5 w-5 ${danger ? 'text-red-400' : color === 'text-red-400' ? color : 'text-zinc-300'}`} strokeWidth={1.9} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className={`text-[15px] font-semibold ${danger ? 'text-red-400' : 'text-white'}`}>{label}</p>
          {value && <p className="mt-0.5 text-xs leading-snug text-zinc-500">{value}</p>}
        </div>
      </div>
      {onClick && <ChevronRight className={`h-4 w-4 shrink-0 ${danger ? 'text-red-500/70' : 'text-zinc-600'}`} aria-hidden="true" />}
    </Tag>
  );
}

function EditBudgetModal({ current, onClose, onSave }) {
  const [budget, setBudget] = useState(current.toString());
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const val = parseInt(budget);
    if (isNaN(val) || val < 500) return;
    setSaving(true);
    await onSave(val);
    setSaving(false);
    onClose();
  };

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-6 pb-[calc(2rem+env(safe-area-inset-bottom))] z-10"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
      >
        <h2 className="text-lg font-bold text-white mb-4">Edit Monthly Budget</h2>
        <div className="relative mb-4">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">₹</span>
          <input
            type="number" autoFocus value={budget}
            onChange={e => setBudget(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl pl-8 pr-4 py-3 text-zinc-100 font-mono outline-none focus:border-lime-500/60"
            min="500" step="500"
          />
        </div>
        <p className="text-xs text-zinc-500 mb-4">Minimum ₹500. This affects your Safe-to-Spend calculation.</p>
        <motion.button
          whileTap={{ scale: 0.97 }} onClick={handleSave} disabled={saving}
          className="w-full bg-lime-400 text-black font-black py-3 rounded-2xl text-sm disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Save budget</>}
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

function EditInvestmentTargetModal({ current, onClose, onSave }) {
  const [target, setTarget] = useState(current.toString());
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const val = parseInt(target);
    if (isNaN(val) || val < 0) return;
    setSaving(true);
    await onSave(val);
    setSaving(false);
    onClose();
  };

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-6 pb-[calc(2rem+env(safe-area-inset-bottom))] z-10"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
      >
        <h2 className="text-lg font-bold text-white mb-2">Set Investment Target</h2>
        <p className="text-xs text-zinc-500 mb-4">
          How much do you want to invest per month? This amount is deducted from your Safe-to-Spend calculation.
        </p>
        <div className="relative mb-4">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">₹</span>
          <input
            type="number" autoFocus value={target}
            onChange={e => setTarget(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl pl-8 pr-4 py-3 text-zinc-100 font-mono outline-none focus:border-sky-500/60"
            min="0" step="100"
          />
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {[500, 1000, 2000, 5000].map(amt => (
            <button
              key={amt}
              type="button"
              onClick={() => setTarget(amt.toString())}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                parseInt(target) === amt
                  ? 'bg-sky-400 text-black border-sky-400'
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600'
              }`}
            >
              ₹{amt.toLocaleString('en-IN')}
            </button>
          ))}
        </div>
        <motion.button
          whileTap={{ scale: 0.97 }} onClick={handleSave} disabled={saving}
          className="w-full bg-sky-400 text-black font-black py-3 rounded-2xl text-sm disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Save target</>}
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

function DeleteAccountModal({ onClose, onDelete }) {
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (confirmation !== 'DELETE') return;
    setDeleting(true);
    await onDelete();
    setDeleting(false);
  };

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-md bg-zinc-900 border border-red-500/20 rounded-t-3xl sm:rounded-3xl p-6 pb-[calc(2rem+env(safe-area-inset-bottom))] z-10"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
      >
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-red-400" />
          <h2 className="text-lg font-bold text-red-400">Delete account</h2>
        </div>
        <p className="text-sm text-zinc-400 mb-2">This will permanently delete:</p>
        <ul className="text-xs text-zinc-500 space-y-1 mb-4 list-disc pl-4">
          <li>Your login, and you will be signed out on every device</li>
          <li>All expenses, recurring bills and statement-import history</li>
          <li>Your Spend Score history, streaks and AI coach conversations</li>
          <li>Group pools you created, and your membership of other pools</li>
          <li>Recurring-payment audit, Pro purchase and sponsored-challenge records</li>
        </ul>
        <p className="text-xs text-amber-200/90 mb-2">Paying for Vittova Pro? Cancel it in Google Play first: deleting your account does not stop Google Play charges.</p>
        <p className="text-xs text-zinc-500 mb-4">This cannot be undone. Export your expenses first if you want a copy.</p>
        <p className="text-sm text-zinc-400 mb-3">Type <span className="font-mono text-red-400 font-bold">DELETE</span> to confirm:</p>
        <input
          type="text" value={confirmation}
          onChange={e => setConfirmation(e.target.value)}
          className="w-full bg-zinc-800 border border-red-500/30 rounded-2xl px-4 py-3 text-zinc-100 font-mono outline-none focus:border-red-500/60 mb-4"
          placeholder="Type DELETE"
        />
        <div className="flex gap-3">
          <motion.button whileTap={{ scale: 0.97 }} onClick={onClose}
            className="flex-1 bg-zinc-800 text-zinc-400 font-bold py-3 rounded-2xl text-sm">
            Cancel
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }} onClick={handleDelete}
            disabled={confirmation !== 'DELETE' || deleting}
            className="flex-1 bg-red-500 text-white font-black py-3 rounded-2xl text-sm disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Trash2 className="w-4 h-4" /> Delete Forever</>}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** A switch row: the state is in the text too, never only in the colour. */
function ToggleRow({ icon: Icon, label, detail, on, busy, onToggle, disabled }) {
  return (
    <div className="flex min-h-[60px] items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[.06]"><Icon className="h-5 w-5 text-zinc-300" strokeWidth={1.9} aria-hidden="true" /></div>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-white">{label}</p>
          {detail && <p className="mt-0.5 text-xs leading-snug text-zinc-500">{detail}</p>}
        </div>
      </div>
      {/* The switch alone says on or off; the 44px button around it is the touch target. */}
      <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onToggle} disabled={disabled || busy}
        className="flex min-h-[44px] shrink-0 items-center pl-2 disabled:opacity-40">
        {/* left-0: without it the knob starts at the button's centred text position and sits outside the track. */}
        <span className={`relative block h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${on ? 'bg-lime-400' : 'bg-zinc-700'}`}>
          <span className={`absolute left-0 top-1 block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${on ? 'translate-x-6' : 'translate-x-1'}`} />
        </span>
      </button>
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { user, session, logout, applyServerProfile } = useAuth();
  const { isPro, features } = usePro();
  const tracking = usePaymentTracking();
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [showSmsSheet, setShowSmsSheet] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [banner, setBanner] = useState(null); // { type, message }
  const [exportState, setExportState] = useState('idle'); // idle | working | done | error
  const [exportError, setExportError] = useState('');
  const { exportCsv } = useExpenses();
  const [reminders, setReminders] = useState(remindersWanted());
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderNote, setReminderNote] = useState('');

  // Debit reminders: the same switch as on the Subscription audit screen.
  const toggleReminders = async () => {
    setReminderNote('');
    setReminderBusy(true);
    try {
      if (reminders) {
        await turnRemindersOff();
        setReminders(false);
        return;
      }
      const audit = await apiJson('/subscription-audit', { session }).catch(() => null);
      const outcome = await turnRemindersOn(audit?.reminders || []);
      if (outcome === 'on') setReminders(true);
      else if (outcome === 'denied') setReminderNote('Notifications are off for Vittova. Turn them on in Android settings to get reminders.');
      else setReminderNote('Reminders work in the Vittova Android app.');
    } catch {
      setReminderNote("Something went wrong. Your settings weren't changed. Try again.");
    } finally {
      setReminderBusy(false);
    }
  };

  // Taking your data with you is a trust feature, so it is on the free tier.
  const handleExport = async () => {
    setExportState('working');
    setExportError('');
    const result = await exportCsv();
    if (result.cancelled) {
      setExportState('idle');
    } else if (result.success) {
      setExportError(result.message || '');
      setExportState('done');
      setTimeout(() => setExportState('idle'), 4000);
    } else {
      setExportState('error');
      setExportError(result.message || 'Export failed.');
    }
  };

  const handleSaveBudget = async (newBudget) => {
    try {
      const response = await fetch(`${API_URL}/account/budget`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ monthly_budget: newBudget }),
      });
      if (!response.ok) throw await httpError(response);
      const data = await response.json();
      applyServerProfile({ monthly_budget: data.monthly_budget });
      setBanner({ type: 'success', message: 'Budget updated.' });
    } catch (err) {
      console.error('Failed to update budget:', err);
      setBanner({ type: 'error', message: friendlyError(err, "We couldn't save your budget. Please try again.") });
    }
  };

  const handleSaveTarget = async (newTarget) => {
    try {
      const response = await fetch(`${API_URL}/account/investment-target`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ investment_target: newTarget }),
      });
      if (!response.ok) throw await httpError(response);
      const data = await response.json();
      applyServerProfile({ investment_target: data.investment_target });
      setBanner({ type: 'success', message: 'Investment target updated.' });
    } catch (err) {
      console.error('Failed to update investment target:', err);
      setBanner({ type: 'error', message: friendlyError(err, "We couldn't save your investment target. Please try again.") });
    }
  };

  const handleDeleteAccount = async () => {
    try {
      const response = await fetch(`${API_URL}/account`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ confirmation: 'DELETE_MY_ACCOUNT' }),
      });
      if (!response.ok) throw await httpError(response);
      // The server has deleted the login and revoked its sessions; clear this device too,
      // including payments captured on the phone and not yet uploaded.
      await tracking.clearDeviceData();
      setShowDeleteModal(false);
      await logout();
      navigate('/login', { replace: true, state: { accountDeleted: true } });
    } catch (err) {
      setShowDeleteModal(false);
      if (err.data?.code === 'PARTIAL_DELETION') {
        // Login already removed; do not leave the user in a half-signed-in app.
        await tracking.clearDeviceData();
        await logout();
        navigate('/login', { replace: true, state: { accountDeleted: true } });
        return;
      }
      setBanner({ type: 'error', message: friendlyError(err, "We couldn't delete your account. Nothing was removed. Please try again.") });
    }
  };

  return (
    <motion.div
      className="space-y-6 pb-6"
      initial="hidden" animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
    >
      {/* Header */}
      <motion.header variants={cardVariants} className="mb-2">
        <h1 className="text-2xl font-black text-white">{user?.full_name || user?.name || 'Profile'}</h1>
        <p className="text-sm text-zinc-500 mt-1">{user?.email}</p>
      </motion.header>

      {banner && (
        <div
          role={banner.type === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-3 rounded-2xl border p-3.5 text-sm font-semibold ${
            banner.type === 'error'
              ? 'border-red-500/30 bg-red-500/10 text-red-200'
              : 'border-lime-500/30 bg-lime-500/10 text-lime-200'
          }`}
        >
          <span className="flex-1">{banner.message}</span>
          <button
            type="button" onClick={() => setBanner(null)} aria-label="Dismiss"
            className="-my-3 flex h-11 w-11 shrink-0 items-center justify-center text-lg leading-none opacity-70 hover:opacity-100"
          >
            &times;
          </button>
        </div>
      )}

      {/* Pro Status */}
      <motion.button type="button" variants={cardVariants} onClick={() => navigate('/pro')}
        className={`v-press block w-full text-left rounded-2xl p-4 border ${isPro
          ? 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/20'
          : 'bg-zinc-900 border-zinc-800'
        }`}
      >
        <div className="flex items-center gap-3">
          <Crown className={`w-6 h-6 ${isPro ? 'text-amber-400' : 'text-zinc-600'}`} />
          <div>
            <p className="text-[15px] font-semibold text-white">{isPro ? 'Vittova Pro is active' : 'Free plan'}</p>
            <p className="text-xs text-zinc-500">{isPro ? 'All features unlocked' : 'See what Vittova Pro includes'}</p>
          </div>
          <ChevronRight className="ml-auto h-4 w-4 text-zinc-600" aria-hidden="true" />
        </div>
      </motion.button>

      {/* Settings */}
      <SettingsGroup title="Budget and goals">
        <SettingRow
          icon={Wallet} label="Monthly budget"
          value={`₹${(user?.monthly_budget || 5000).toLocaleString('en-IN')}`}
          onClick={() => setShowBudgetModal(true)}
        />
        <SettingRow
          icon={Target} label="Investment target"
          value={`₹${(user?.investment_target || 0).toLocaleString('en-IN')}/month`}
          onClick={() => setShowTargetModal(true)}
        />
      </SettingsGroup>

      {tracking.supported && (
        <SettingsGroup title="Money tracking" note={(tracking.waiting > 0 || tracking.reviewCount > 0) ? (
          <p role="status" className="mt-2 px-1 text-xs text-zinc-400">
            {tracking.waiting > 0 ? `${tracking.waiting} waiting to upload. ` : ''}
            {tracking.reviewCount > 0 ? `${tracking.reviewCount} waiting for your review on Home.` : ''}
          </p>
        ) : null}>
          {/* Vittova's own switch (on by default). It only captures once Android
              Notification Access is granted, and says so. */}
          <ToggleRow icon={Zap} label="Payment tracking" detail={`${tracking.copy.label}. ${tracking.copy.detail}`}
            on={tracking.trackingEnabled} busy={trackingBusy}
            onToggle={async () => {
              setTrackingBusy(true);
              const turningOn = !tracking.trackingEnabled;
              await tracking.setTrackingEnabled(turningOn);
              if (turningOn) tracking.setMode('auto');
              setTrackingBusy(false);
            }} />
          {/* Bank SMS: the main source (payment apps rarely announce a payment). */}
          {tracking.smsGranted ? (
            <ToggleRow icon={MessageSquareText} label="Bank SMS"
              detail="Debit alerts from banks and cards. Messages from people are never read."
              on={tracking.smsEnabled} onToggle={() => tracking.setSmsEnabled(!tracking.smsEnabled)} />
          ) : (
            <SettingRow icon={MessageSquareText} label="Allow bank SMS"
              value={tracking.smsPermission === 'denied' ? 'Allowed only in App info → Permissions → SMS' : 'Debit alerts from banks. Never messages from people.'}
              onClick={() => setShowSmsSheet(true)} />
          )}
          {/* Payment-app notifications: an optional extra source. */}
          <SettingRow icon={Bell} label="Payment-app notifications (optional)"
            value={tracking.granted ? 'On. Change in Android settings.' : 'Off. Also catch payments GPay, PhonePe and others announce.'}
            onClick={tracking.openAccessSettings} />
          {tracking.state === TRACKING.TEMPORARILY_UNAVAILABLE && (
            <SettingRow icon={Settings2} label="Check background settings" value="Opens App info for Vittova" onClick={tracking.openAppSettings} />
          )}
          {tracking.trackingEnabled && (
            <ToggleRow icon={Check} label="Add payments automatically"
              detail={tracking.mode === 'auto' ? 'Clear payments are added for you; unclear ones wait on Home.' : 'Every detected payment waits for you on Home.'}
              on={tracking.mode === 'auto'} onToggle={() => tracking.setMode(tracking.mode === 'auto' ? 'review' : 'auto')} />
          )}
        </SettingsGroup>
      )}

      <AnimatePresence>
        {showSmsSheet && (
          <SmsAccessSheet
            smsGranted={tracking.smsGranted}
            smsPermission={tracking.smsPermission}
            requestSms={tracking.requestSms}
            openAppSettings={tracking.openAppSettings}
            onClose={() => setShowSmsSheet(false)}
          />
        )}
      </AnimatePresence>

      <SettingsGroup title="Reminders" note={reminderNote ? <p role="status" className="mt-2 px-1 text-xs text-amber-200">{reminderNote}</p> : null}>
        {!remindersSupported() ? (
          <SettingRow icon={Bell} label="Debit reminders" value="Available in the Vittova Android app" />
        ) : isPro && features.subscriptionAuditEnabled !== false ? (
          <ToggleRow icon={Bell} label="Debit reminders" detail="A reminder the day before an expected recurring debit"
            on={reminders} busy={reminderBusy} onToggle={toggleReminders} />
        ) : (
          <SettingRow icon={Bell} label="Debit reminders" value="Part of Vittova Pro" onClick={() => navigate('/pro')} />
        )}
      </SettingsGroup>

      <SettingsGroup title="Tools">
        <SettingRow
          icon={Trophy} label="Save-to-Earn" value="Challenges, Victory Pot and badges"
          onClick={() => navigate('/save-to-earn')}
        />
        <SettingRow
          icon={Users} label="Group Pool" value="Split bills and settle up"
          onClick={() => navigate('/pool')}
        />
        <SettingRow
          icon={Repeat} label="Recurring charges" value="Repeat payments in your expenses"
          onClick={() => navigate('/graveyard')}
        />
        <SettingRow
          icon={FileText} label="Statement import" value="Import a bank PDF"
          onClick={() => navigate('/import')}
        />
      </SettingsGroup>

      {(features.subscriptionAuditEnabled || features.sponsoredChallengesEnabled) && (
        <SettingsGroup title="Vittova Pro">
          {features.subscriptionAuditEnabled && (
            <SettingRow
              icon={Radar} label="Subscription audit" value={isPro ? 'Recurring payments, price rises, debit reminders' : 'Part of Vittova Pro'}
              onClick={() => navigate('/subscription-audit')}
            />
          )}
          {features.sponsoredChallengesEnabled && (
            <SettingRow
              icon={Gift} label="Money challenges" value="Sponsored · fixed voucher rewards"
              onClick={() => navigate('/challenges')}
            />
          )}
        </SettingsGroup>
      )}

      <SettingsGroup title="Your data">
        <SettingRow
          icon={exportState === 'working' ? Loader2 : Download}
          label={exportState === 'done' ? 'Export ready' : 'Export my expenses'}
          value={
            exportState === 'working' ? 'Preparing your file…'
              : exportState === 'error' ? exportError
                : exportState === 'done' ? exportError || 'Your CSV file is ready'
                  : 'Save or share everything as a CSV file'
          }
          color={exportState === 'error' ? 'text-red-400' : undefined}
          onClick={exportState === 'working' ? undefined : handleExport}
        />
      </SettingsGroup>

      <SettingsGroup title="Privacy and legal">
        <SettingRow icon={Shield} label="Privacy policy" value="How we handle your data" onClick={() => navigate('/privacy')} />
        <SettingRow icon={FileText} label="Terms of service" value="The agreement for using Vittova" onClick={() => navigate('/terms')} />
      </SettingsGroup>

      <SettingsGroup title="Account">
        <SettingRow icon={LogOut} label="Log out" onClick={async () => { await logout(); navigate('/login', { replace: true }); }} />
        <SettingRow icon={Trash2} label="Delete account" value="Permanently deletes your account and data" danger onClick={() => setShowDeleteModal(true)} />
      </SettingsGroup>

      {/* Modals */}
      {showBudgetModal && (
        <EditBudgetModal
          current={user?.monthly_budget || 5000}
          onClose={() => setShowBudgetModal(false)}
          onSave={handleSaveBudget}
        />
      )}
      {showTargetModal && (
        <EditInvestmentTargetModal
          current={user?.investment_target || 0}
          onClose={() => setShowTargetModal(false)}
          onSave={handleSaveTarget}
        />
      )}
      {showDeleteModal && (
        <DeleteAccountModal
          onClose={() => setShowDeleteModal(false)}
          onDelete={handleDeleteAccount}
        />
      )}
    </motion.div>
  );
}
