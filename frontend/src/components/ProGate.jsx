import { motion } from 'framer-motion';
import { Lock, Sparkles, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePro } from '../contexts/ProContext';

/**
 * ProGate — Wraps Pro-only features.
 * Shows blurred content + upgrade CTA for free users.
 *
 * Usage:
 *   <ProGate feature="subscription_graveyard">
 *     <SubscriptionGraveyard />
 *   </ProGate>
 */
export default function ProGate({ feature, children, title = 'Pro Feature', description }) {
  const { canUse, isPro } = usePro();

  if (canUse(feature)) {
    return children;
  }

  return (
    <div className="relative rounded-2xl overflow-hidden">
      {/* Blurred preview */}
      <div className="blur-sm opacity-40 pointer-events-none select-none" aria-hidden="true">
        {children}
      </div>

      {/* Overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-2xl"
      >
        <div className="text-center px-6 max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/30">
            <Lock className="w-7 h-7 text-white" />
          </div>

          <h3 className="text-xl font-black text-white mb-2">{title}</h3>
          <p className="text-sm text-zinc-400 mb-5">
            {description || 'Unlock this feature with Spendly Pro for ₹99/month.'}
          </p>

          <Link to="/pro">
            <motion.button
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.03 }}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-400 to-orange-500 text-black font-black px-6 py-3 rounded-2xl text-sm shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 transition-shadow"
            >
              <Sparkles className="w-4 h-4" />
              Upgrade to Pro
              <ChevronRight className="w-4 h-4" />
            </motion.button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
