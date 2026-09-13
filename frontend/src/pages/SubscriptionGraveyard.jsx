/**
 * SubscriptionGraveyard.jsx — Spendly v1
 * ─────────────────────────────────────────────────────────────
 * Scans recurring transactions, flags zombie subscriptions.
 * Shareable card: "SpendIt found ₹X in zombie subscriptions"
 * Gated behind Pro for full results.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Skull, Search, Ghost, Share2, AlertCircle, Loader2, Trash2, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import ProGate from '../components/ProGate';
import { API_URL as API_BASE_URL } from '../lib/apiConfig';
import { friendlyError } from '../lib/errors';

const API_URL = API_BASE_URL;

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 280, damping: 22 } },
};

function ZombieCard({ sub, index }) {
  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      transition={{ delay: index * 0.08 }}
      className={`rounded-2xl p-5 border ${
        sub.isZombie
          ? 'bg-red-500/5 border-red-500/20'
          : 'bg-zinc-900 border-zinc-800'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            sub.isZombie ? 'bg-red-500/15' : 'bg-zinc-800'
          }`}>
            {sub.isZombie
              ? <Ghost className="w-6 h-6 text-red-400" />
              : <CheckCircle className="w-6 h-6 text-lime-400" />}
          </div>
          <div>
            <p className="text-[15px] font-bold text-white">{sub.merchant}</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {sub.category} · Every ~{sub.avgInterval} days
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-black text-white font-mono tabular-nums">
            ₹{Number(sub.monthlyAmount || 0).toLocaleString('en-IN')}
          </p>
          <p className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">/month</p>
        </div>
      </div>

      {sub.isZombie && (
        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20">
          <Skull className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-xs text-red-300">
            <span className="font-bold">Zombie Alert:</span> Paid for {sub.monthsDetected} months, last used {sub.daysSinceLastPayment} days ago
          </p>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
        <span>Total spent: ₹{Number(sub.totalSpent || 0).toLocaleString('en-IN')}</span>
        <span>Last: {sub.lastPayment ? new Date(sub.lastPayment).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Unknown'}</span>
      </div>
    </motion.div>
  );
}

function ShareCard({ totalWaste, zombieCount }) {
  const handleShare = async () => {
    const text = `🔍 Spendly just found ₹${totalWaste.toLocaleString('en-IN')} in ${zombieCount} zombie subscription${zombieCount !== 1 ? 's' : ''} I forgot about!\n\nHow much are you wasting? Find out → https://spendly.app`;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Spendly — Subscription Graveyard', text });
      } catch (err) {
        if (err.name !== 'AbortError') console.error('Share failed:', err);
      }
    } else {
      await navigator.clipboard.writeText(text);
      alert('Copied to clipboard!');
    }
  };

  return (
    <motion.div
      variants={cardVariants}
      className="rounded-2xl bg-gradient-to-br from-red-500/10 to-orange-500/10 border border-red-500/20 p-6 text-center"
    >
      <div className="w-16 h-16 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto mb-4">
        <Skull className="w-8 h-8 text-red-400" />
      </div>
      <p className="text-sm text-zinc-400 mb-1">Total zombie waste per month</p>
      <p className="text-4xl font-black text-red-400 font-mono tabular-nums">
        ₹{totalWaste.toLocaleString('en-IN')}
      </p>
      <p className="text-sm text-zinc-500 mt-2 mb-5">
        That's ₹{(totalWaste * 12).toLocaleString('en-IN')}/year going to subscriptions you don't use
      </p>
      <motion.button
        whileTap={{ scale: 0.95 }}
        whileHover={{ scale: 1.02 }}
        onClick={handleShare}
        className="inline-flex items-center gap-2 bg-red-500 hover:bg-red-400 text-white font-bold px-6 py-3 rounded-2xl text-sm transition-colors"
      >
        <Share2 className="w-4 h-4" />
        Share your graveyard
      </motion.button>
    </motion.div>
  );
}

export default function SubscriptionGraveyard() {
  const { session } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }

    const fetchSubscriptions = async () => {
      try {
        const res = await fetch(`${API_URL}/subscriptions/detect`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
        const json = await res.json();
        if (json.success) setData(json);
        else setError(json.message);
      } catch (err) {
        setError(friendlyError(err, "We couldn't scan for subscriptions right now. Please try again."));
      } finally {
        setLoading(false);
      }
    };

    fetchSubscriptions();
  }, [session]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-red-400 animate-spin mx-auto mb-3" />
          <p className="text-zinc-500 text-sm font-bold">Scanning for zombie subscriptions...</p>
        </div>
      </div>
    );
  }

  return (
    <ProGate
      feature="subscription_graveyard"
      title="Subscription Graveyard"
      description="Find forgotten subscriptions bleeding your wallet. Upgrade to Pro to see the full report."
    >
      <motion.div
        className="space-y-5 pb-6"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
      >
        {/* Header */}
        <motion.header variants={cardVariants}>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center">
              <Search className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">Subscription Graveyard</h1>
              <p className="text-sm text-zinc-500">Forgotten subscriptions bleeding your wallet</p>
            </div>
          </div>
        </motion.header>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {data && (data.subscriptions || []).length === 0 ? (
          <motion.div variants={cardVariants} className="rounded-2xl bg-zinc-900 border border-zinc-800 p-10 text-center">
            <div className="text-4xl mb-3">🎉</div>
            <p className="text-lg font-bold text-white">You're clean!</p>
            <p className="text-sm text-zinc-500 mt-1">No zombie subscriptions detected. Keep it up!</p>
          </motion.div>
        ) : data && (
          <>
            {/* Waste summary card */}
            {data.zombieCount > 0 && (
              <ShareCard totalWaste={data.totalWaste} zombieCount={data.zombieCount} />
            )}

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3">
              <motion.div variants={cardVariants} className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 text-center">
                <p className="text-2xl font-black text-white">{(data.subscriptions || []).length}</p>
                <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider mt-1">Detected</p>
              </motion.div>
              <motion.div variants={cardVariants} className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 text-center">
                <p className="text-2xl font-black text-red-400">{data.zombieCount}</p>
                <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider mt-1">Zombies</p>
              </motion.div>
              <motion.div variants={cardVariants} className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 text-center">
                <p className="text-2xl font-black text-lime-400">{data.activeCount}</p>
                <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider mt-1">Active</p>
              </motion.div>
            </div>

            {/* Subscription list */}
            <div className="space-y-3">
              <p className="text-xs uppercase font-bold text-zinc-500 tracking-wider px-1">
                Total: ₹{Number(data.totalMonthlySubscriptions || 0).toLocaleString('en-IN')}/month
              </p>
              {(data.subscriptions || []).map((sub, idx) => (
                <ZombieCard key={sub.normalizedName} sub={sub} index={idx} />
              ))}
            </div>
          </>
        )}
      </motion.div>
    </ProGate>
  );
}
