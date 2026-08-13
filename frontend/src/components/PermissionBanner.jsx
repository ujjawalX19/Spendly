import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Settings, X, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { useNotificationPermission } from '../hooks/useNotificationPermission';

/**
 * PermissionBanner
 * 
 * Renders a prominent alert banner on the Dashboard when the user
 * has NOT granted Notification Listener access to Spendly.
 * 
 * Features:
 *  - Auto-hides once access is granted (re-checks on app resume)
 *  - Dismissible (user can close it, but it reappears next session)
 *  - CTA button opens Android Notification Listener Settings directly
 */
export default function PermissionBanner() {
    const { isAndroid, hasAccess, loading, openSettings } = useNotificationPermission();
    const [dismissed, setDismissed] = useState(false);

    // Don't render on web, while loading, if access is granted, or if dismissed
    if (!isAndroid || loading || hasAccess || dismissed) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                className="relative overflow-hidden rounded-3xl border border-amber-500/30 
                           bg-gradient-to-br from-amber-950/50 via-zinc-900/80 to-zinc-950/90
                           backdrop-blur-xl p-5 mb-4 shadow-[0_4px_32px_rgba(245,158,11,0.1)]"
            >
                {/* Subtle glow effect */}
                <div className="absolute -top-12 -right-12 w-40 h-40 bg-amber-500/8 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-orange-500/6 rounded-full blur-2xl pointer-events-none" />

                {/* Dismiss button */}
                <motion.button
                    onClick={() => setDismissed(true)}
                    whileTap={{ scale: 0.85 }}
                    className="absolute top-3 right-3 p-1.5 rounded-xl bg-zinc-800/60 text-zinc-500 
                               hover:text-zinc-300 hover:bg-zinc-700/60 transition-colors z-10"
                    aria-label="Dismiss permission banner"
                >
                    <X className="w-3.5 h-3.5" />
                </motion.button>

                <div className="relative z-10 flex gap-4">
                    {/* Icon */}
                    <div className="flex-shrink-0 mt-0.5">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/20 
                                        flex items-center justify-center shadow-[0_0_16px_rgba(245,158,11,0.15)]">
                            <ShieldAlert className="w-6 h-6 text-amber-400" />
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-amber-300 mb-1 flex items-center gap-2">
                            <Smartphone className="w-3.5 h-3.5" />
                            Auto-Tracking Paused
                        </h3>
                        <p className="text-xs text-zinc-400 leading-relaxed mb-3">
                            Spendly needs <span className="text-zinc-200 font-semibold">Notification Access</span> to 
                            automatically detect your UPI payments from GPay, PhonePe, and Paytm. 
                            Your data stays on-device — we never read SMS.
                        </p>

                        {/* CTA Button */}
                        <motion.button
                            onClick={openSettings}
                            whileTap={{ scale: 0.96 }}
                            whileHover={{ scale: 1.02 }}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black
                                       bg-amber-500 text-black hover:bg-amber-400 
                                       shadow-[0_2px_16px_rgba(245,158,11,0.3)] 
                                       hover:shadow-[0_4px_24px_rgba(245,158,11,0.45)]
                                       transition-all duration-200"
                        >
                            <Settings className="w-3.5 h-3.5" />
                            Enable in Settings
                        </motion.button>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
