/**
 * ProUpgrade.jsx — Spendly v1
 * ─────────────────────────────────────────────────────────────
 * Paywall and feature comparison for Spendly Pro.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Sparkles, Zap, FileText, Skull, Lock, Loader2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePro } from '../contexts/ProContext';

export default function ProUpgrade() {
  const navigate = useNavigate();
  const { isPro, refreshProStatus } = usePro();
  const [loading, setLoading] = useState(false);

  const handlePurchase = async () => {
    // In a real implementation, this would trigger RevenueCat / Google Play Billing
    setLoading(true);
    try {
      // Simulate purchase flow
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const API_URL = import.meta.env.VITE_API_URL || 'https://spendly-t8s6.onrender.com/api';
      const token = JSON.parse(localStorage.getItem('sb-yqswcddybnoyvtvqjshm-auth-token'))?.access_token;
      
      if (token) {
        await fetch(`${API_URL}/pro/activate`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}` 
          },
          body: JSON.stringify({ productId: 'spendly_pro_monthly' })
        });
        await refreshProStatus();
        alert('🎉 Spendly Pro Activated!');
        navigate('/dash');
      }
    } catch (err) {
      console.error(err);
      alert('Purchase failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const features = [
    { icon: FileText, title: 'Bank Statement Import', desc: 'Upload PDFs to auto-log hundreds of expenses instantly.' },
    { icon: Skull, title: 'Subscription Graveyard', desc: 'Find and kill zombie subscriptions bleeding your wallet.' },
    { icon: Zap, title: 'Unlimited AI Scans', desc: 'Scan unlimited receipts (Free: 3/month).' },
    { icon: Sparkles, title: 'Unlimited AI Chat', desc: 'Get unlimited financial advice from Spendly AI (Free: 10/day).' },
  ];

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-6 pb-28">
      <button 
        onClick={() => navigate(-1)} 
        className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center mb-6"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>

      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4 shadow-[0_0_30px_rgba(251,191,36,0.3)]">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-black mb-2">Upgrade to Spendly Pro</h1>
        <p className="text-zinc-400">Unlock the ultimate financial intelligence toolkit.</p>
      </div>

      <div className="space-y-4 mb-8">
        {features.map((feat, idx) => (
          <motion.div 
            key={idx}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="flex items-start gap-4 p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
              <feat.icon className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="font-bold">{feat.title}</p>
              <p className="text-sm text-zinc-500 mt-1">{feat.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black via-black to-transparent z-50">
        <div className="max-w-lg mx-auto">
          {isPro ? (
            <div className="w-full py-4 rounded-2xl bg-zinc-900 border border-zinc-800 text-center font-bold text-zinc-400">
              You are already a Pro member 🎉
            </div>
          ) : (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handlePurchase}
              disabled={loading}
              className="w-full bg-gradient-to-r from-amber-400 to-orange-500 text-black font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Start Pro — ₹99/month'}
            </motion.button>
          )}
          <p className="text-center text-[10px] text-zinc-600 mt-3">
            Auto-renewing subscription. Cancel anytime in Google Play Settings.
          </p>
        </div>
      </div>
    </div>
  );
}
