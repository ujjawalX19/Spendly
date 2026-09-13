/**
 * Settings.jsx — Spendly v1
 * ─────────────────────────────────────────────────────────────
 * Settings page with budget editing, investment target,
 * account deletion, Pro management, and legal links.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Wallet, Target, Trash2, Shield, FileText, Crown,
  ChevronRight, Loader2, AlertTriangle, Check, LogOut, Download,
  Users, Repeat
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePro } from '../contexts/ProContext';
import { useExpenses } from '../hooks/useExpenses';
import { friendlyError } from '../lib/errors';
import { API_URL as API_BASE_URL } from '../lib/apiConfig';

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

function SettingRow({ icon: Icon, label, value, color = 'text-lime-400', onClick, danger = false }) {
  return (
    <motion.button
      variants={cardVariants}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-4 rounded-2xl transition-colors ${
        danger
          ? 'bg-red-500/5 border border-red-500/15 hover:bg-red-500/10'
          : 'bg-zinc-900 border border-zinc-800 hover:border-zinc-700'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
          danger ? 'bg-red-500/15' : 'bg-zinc-800'
        }`}>
          <Icon className={`w-5 h-5 ${danger ? 'text-red-400' : color}`} />
        </div>
        <div className="text-left">
          <p className={`text-sm font-bold ${danger ? 'text-red-400' : 'text-white'}`}>{label}</p>
          {value && <p className="text-xs text-zinc-500 mt-0.5">{value}</p>}
        </div>
      </div>
      <ChevronRight className={`w-4 h-4 ${danger ? 'text-red-500' : 'text-zinc-600'}`} />
    </motion.button>
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
        className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-6 pb-8 z-10"
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
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Save Budget</>}
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
        className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-6 pb-8 z-10"
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
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Save Target</>}
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
        className="relative w-full max-w-md bg-zinc-900 border border-red-500/20 rounded-t-3xl sm:rounded-3xl p-6 pb-8 z-10"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
      >
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-red-400" />
          <h2 className="text-lg font-bold text-red-400">Delete Account</h2>
        </div>
        <p className="text-sm text-zinc-400 mb-2">This will permanently delete:</p>
        <ul className="text-xs text-zinc-500 space-y-1 mb-4 list-disc pl-4">
          <li>Your login, and you will be signed out on every device</li>
          <li>All expenses, recurring bills and statement-import history</li>
          <li>Your Spend Score history, streaks and AI coach conversations</li>
          <li>Group pools you created, and your membership of other pools</li>
        </ul>
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

export default function Settings() {
  const navigate = useNavigate();
  const { user, session, logout, applyServerProfile } = useAuth();
  const { isPro } = usePro();
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [banner, setBanner] = useState(null); // { type, message }
  const [exportState, setExportState] = useState('idle'); // idle | working | done | error
  const [exportError, setExportError] = useState('');
  const { exportCsv } = useExpenses();

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
      // The server has deleted the login and revoked its sessions; clear this device too.
      setShowDeleteModal(false);
      await logout();
      navigate('/login', { replace: true, state: { accountDeleted: true } });
    } catch (err) {
      setShowDeleteModal(false);
      if (err.data?.code === 'PARTIAL_DELETION') {
        // Login already removed; do not leave the user in a half-signed-in app.
        await logout();
        navigate('/login', { replace: true, state: { accountDeleted: true } });
        return;
      }
      setBanner({ type: 'error', message: friendlyError(err, "We couldn't delete your account. Nothing was removed. Please try again.") });
    }
  };

  return (
    <motion.div
      className="space-y-4 pb-6"
      initial="hidden" animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
    >
      {/* Header */}
      <motion.header variants={cardVariants} className="mb-2">
        <h1 className="text-2xl font-black text-white">Settings</h1>
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
            className="-my-1 shrink-0 px-2 text-lg leading-none opacity-70 hover:opacity-100"
          >
            &times;
          </button>
        </div>
      )}

      {/* Pro Status */}
      <motion.div variants={cardVariants}
        className={`rounded-2xl p-4 border ${isPro
          ? 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/20'
          : 'bg-zinc-900 border-zinc-800'
        }`}
      >
        <div className="flex items-center gap-3">
          <Crown className={`w-6 h-6 ${isPro ? 'text-amber-400' : 'text-zinc-600'}`} />
          <div>
            <p className="text-sm font-bold text-white">{isPro ? 'Spendly Pro Active' : 'Free Plan'}</p>
            <p className="text-xs text-zinc-500">{isPro ? 'All features unlocked' : 'Spendly Pro is not available to buy yet'}</p>
          </div>
        </div>
      </motion.div>

      {/* Settings */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider px-1">Budget & Goals</p>
        <SettingRow
          icon={Wallet} label="Monthly Budget"
          value={`₹${(user?.monthly_budget || 5000).toLocaleString('en-IN')}`}
          onClick={() => setShowBudgetModal(true)}
        />
        <SettingRow
          icon={Target} label="Investment Target"
          value={`₹${(user?.investment_target || 0).toLocaleString('en-IN')}/month`}
          color="text-sky-400"
          onClick={() => setShowTargetModal(true)}
        />
      </div>

      <div className="space-y-2">
        <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider px-1">More</p>
        <SettingRow
          icon={Users} label="Group Pool" value="Split bills and settle up"
          color="text-sky-400" onClick={() => navigate('/pool')}
        />
        <SettingRow
          icon={Repeat} label="Recurring charges" value="Monthly payments found in your expenses"
          color="text-fuchsia-400" onClick={() => navigate('/graveyard')}
        />
        <SettingRow
          icon={FileText} label="Statement Import" value="Import a bank PDF"
          color="text-amber-400" onClick={() => navigate('/import')}
        />
      </div>

      <div className="space-y-2">
        <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider px-1">Your Data</p>
        <SettingRow
          icon={exportState === 'working' ? Loader2 : Download}
          label={exportState === 'done' ? 'Export ready' : 'Export my expenses'}
          value={
            exportState === 'working' ? 'Preparing your file…'
              : exportState === 'error' ? exportError
                : exportState === 'done' ? exportError || 'Your CSV file is ready'
                  : 'Save or share everything as a CSV file'
          }
          color={exportState === 'error' ? 'text-red-400' : 'text-lime-400'}
          onClick={exportState === 'working' ? undefined : handleExport}
        />
      </div>

      <div className="space-y-2">
        <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider px-1">Legal</p>
        <SettingRow icon={Shield} label="Privacy Policy" value="How we handle your data" onClick={() => navigate('/privacy')} />
        <SettingRow icon={FileText} label="Terms of Service" value="Usage agreement" onClick={() => navigate('/terms')} />
      </div>

      <div className="space-y-2">
        <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider px-1">Account</p>
        <SettingRow icon={LogOut} label="Log Out" onClick={async () => { await logout(); navigate('/login', { replace: true }); }} />
        <SettingRow icon={Trash2} label="Delete Account" value="Permanently delete all data" danger onClick={() => setShowDeleteModal(true)} />
      </div>

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
