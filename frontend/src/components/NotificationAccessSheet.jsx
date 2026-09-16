import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { App as CapApp } from '@capacitor/app';
import { BellRing, CheckCircle2, ShieldAlert, X } from 'lucide-react';

/**
 * Explains Notification Access before sending the user to Android Settings,
 * then reports what Android actually says when they come back.
 *
 * Android 13+ can show "Restricted setting" (switch greyed out) for apps
 * installed from an APK file instead of an app store. Only the user can lift
 * that, in App info → ⋮ → Allow restricted settings; the app does not try to
 * work around it. After every return from Settings the real listener state is
 * re-read, so the sheet never claims access that is not granted.
 */
export default function NotificationAccessSheet({
  permissionGranted,
  restrictedSettingsLikely,
  checkPermissionNow,
  openPermissionSettings,
  openAppSettings,
  onClose,
}) {
  // explain → waiting (in Settings) → enabled | still_off
  const [phase, setPhase] = useState(permissionGranted ? 'enabled' : 'explain');
  const waiting = useRef(false);

  useEffect(() => {
    let handle;
    let cancelled = false;
    CapApp.addListener('appStateChange', async ({ isActive }) => {
      if (!isActive || !waiting.current) return;
      waiting.current = false;
      const granted = await checkPermissionNow();
      if (!cancelled) setPhase(granted ? 'enabled' : 'still_off');
    }).then((h) => { if (cancelled) h.remove(); else handle = h; }).catch(() => {});
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, [checkPermissionNow]);

  const goTo = async (open) => {
    waiting.current = true;
    setPhase('waiting');
    await open();
  };

  return (
    <motion.div
      className="fixed inset-0 z-[400] flex items-end justify-center sm:items-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-labelledby="notif-sheet-title"
        className="relative z-10 max-h-[calc(100dvh-env(safe-area-inset-top)-1rem)] w-full max-w-md overflow-y-auto rounded-t-3xl border border-zinc-800 bg-zinc-900 px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-3xl"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${phase === 'enabled' ? 'bg-lime-400/15 text-lime-400' : phase === 'still_off' ? 'bg-amber-400/15 text-amber-400' : 'bg-lime-400/15 text-lime-400'}`}>
              {phase === 'enabled' ? <CheckCircle2 className="h-5 w-5" /> : phase === 'still_off' ? <ShieldAlert className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}
            </span>
            <h2 id="notif-sheet-title" className="text-lg font-black text-white">
              {phase === 'enabled' ? 'Notification access enabled'
                : phase === 'still_off' ? 'Notification access is still off'
                  : 'Turn on Notification Access'}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl bg-zinc-800 p-2 text-zinc-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        {phase === 'enabled' ? (
          <>
            <p className="text-sm leading-relaxed text-zinc-400">
              Vittova will ask you before adding a detected payment as an expense.
            </p>
            <button type="button" onClick={onClose} className="mt-5 min-h-12 w-full rounded-2xl bg-lime-400 text-sm font-black text-black">
              Done
            </button>
          </>
        ) : (
          <>
            {phase !== 'still_off' && (
              <p className="text-sm leading-relaxed text-zinc-400">
                Vittova uses it only to detect payment notifications from supported UPI and bank apps. It does not read SMS.
              </p>
            )}

            <div className={`mt-4 rounded-2xl border p-4 ${phase === 'still_off' || restrictedSettingsLikely ? 'border-amber-400/25 bg-amber-400/[.06]' : 'border-white/10 bg-white/[.03]'}`}>
              <p className="text-sm font-bold text-zinc-200">
                {phase === 'still_off'
                  ? 'If the switch was greyed out ("Restricted setting"):'
                  : 'Android may restrict this for apps installed outside Google Play. If the switch is greyed out:'}
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-zinc-400">
                <li>Open <span className="font-semibold text-zinc-200">App info</span> for Vittova</li>
                <li>Tap <span className="font-semibold text-zinc-200">⋮</span> → <span className="font-semibold text-zinc-200">Allow restricted settings</span></li>
                <li>Come back and turn on Vittova in Notification Access</li>
              </ol>
            </div>

            {phase === 'waiting' && (
              <p className="mt-4 text-center text-xs text-zinc-500" role="status">Checking again when you return…</p>
            )}

            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={() => goTo(openPermissionSettings)}
                className="min-h-12 w-full rounded-2xl bg-lime-400 text-sm font-black text-black"
              >
                {phase === 'still_off' ? 'Try again' : 'Open Notification Access'}
              </button>
              <button
                type="button"
                onClick={() => goTo(openAppSettings)}
                className="min-h-12 w-full rounded-2xl bg-zinc-800 text-sm font-bold text-zinc-200"
              >
                Open App info
              </button>
              <button type="button" onClick={onClose} className="min-h-11 w-full text-sm font-bold text-zinc-500">
                Not now
              </button>
            </div>
          </>
        )}
      </motion.section>
    </motion.div>
  );
}
