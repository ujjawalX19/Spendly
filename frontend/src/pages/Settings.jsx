/**
 * Settings.jsx — Spendly v1
 * ─────────────────────────────────────────────────────────────
 * Settings page with budget editing, investment target,
 * account deletion, Pro management, and legal links.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Wallet, Target, Trash2, Shield, FileText, Crown,
  ChevronRight, Loader2, AlertTriangle, Check, LogOut
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePro } from '../contexts/ProContext';

const API_URL = import.meta.env.VITE_API_URL || 'https://spendly-t8s6.onrender.com/api';

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
          <li>All your expenses and transaction history</li>
          <li>Your Paisa Score and streak data</li>
          <li>Group memberships and settlements</li>
          <li>Your Spendly account and profile</li>
        </ul>
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
  const { user, session, logout, updateProfile } = useAuth();
  const { isPro } = usePro();
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleSaveBudget = async (newBudget) => {
    try {
      await fetch(`${API_URL}/account/budget`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ monthly_budget: newBudget }),
      });
      if (updateProfile) {
        await updateProfile({ monthly_budget: newBudget });
      }
    } catch (err) {
      console.error('Failed to update budget:', err);
    }
  };

  const handleSaveTarget = async (newTarget) => {
    try {
      await fetch(`${API_URL}/account/investment-target`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ investment_target: newTarget }),
      });
      if (updateProfile) {
        await updateProfile({ investment_target: newTarget });
      }
    } catch (err) {
      console.error('Failed to update investment target:', err);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await fetch(`${API_URL}/account`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ confirmation: 'DELETE_MY_ACCOUNT' }),
      });
      await logout();
    } catch (err) {
      console.error('Failed to delete account:', err);
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
            <p className="text-xs text-zinc-500">{isPro ? 'All features unlocked' : 'Upgrade for unlimited features'}</p>
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
        <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider px-1">Legal</p>
        <SettingRow icon={Shield} label="Privacy Policy" value="How we handle your data" onClick={() => window.open('/privacy', '_blank')} />
        <SettingRow icon={FileText} label="Terms of Service" value="Usage agreement" onClick={() => window.open('/terms', '_blank')} />
      </div>

      <div className="space-y-2">
        <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider px-1">Account</p>
        <SettingRow icon={LogOut} label="Log Out" onClick={logout} />
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
