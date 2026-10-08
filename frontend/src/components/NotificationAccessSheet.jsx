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
      <div className="v-scrim absolute inset-0" onClick={onClose} />
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-labelledby="notif-sheet-title"
        className="v-sheet relative z-10 max-h-[calc(100dvh-env(safe-area-inset-top)-1rem)] w-full max-w-md overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'tween', duration: 0.24, ease: 'easeOut' }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {phase === 'enabled' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" /> : phase === 'still_off' ? <ShieldAlert className="h-5 w-5 shrink-0 text-warn" aria-hidden="true" /> : <BellRing className="h-5 w-5 shrink-0 text-ink-2" aria-hidden="true" />}
            <h2 id="notif-sheet-title" className="text-lg font-bold text-ink">
              {phase === 'enabled' ? 'Notification access enabled'
                : phase === 'still_off' ? 'Notification access is still off'
                  : 'Turn on Notification Access'}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2">
            <X className="h-5 w-5" />
          </button>
        </div>

        {phase === 'enabled' ? (
          <>
            <p className="text-sm leading-relaxed text-ink-2">
              Clear payments are then added to your expenses automatically; Vittova asks you about unclear ones.
            </p>
            <button type="button" onClick={onClose} className="v-press v-btn-primary mt-5 w-full">
              Done
            </button>
          </>
        ) : (
          <>
            {phase !== 'still_off' && (
              <p className="text-sm leading-relaxed text-ink-2">
                Vittova uses it only to detect payment notifications from supported UPI and bank apps.
              </p>
            )}

            <div className="mt-4 rounded-xl bg-surface-2 p-4">
              <p className={`text-sm font-semibold ${phase === 'still_off' || restrictedSettingsLikely ? 'text-warn' : 'text-ink'}`}>
                {phase === 'still_off'
                  ? 'If the switch was greyed out ("Restricted setting"):'
                  : 'Android may restrict this for apps installed outside Google Play. If the switch is greyed out:'}
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-ink-2">
                <li>Open <span className="font-semibold text-ink">App info</span> for Vittova</li>
                <li>Tap <span className="font-semibold text-ink">⋮</span> → <span className="font-semibold text-ink">Allow restricted settings</span></li>
                <li>Come back and turn on Vittova in Notification Access</li>
              </ol>
            </div>

            {phase === 'waiting' && (
              <p className="mt-4 text-center text-xs text-ink-3" role="status">Checking again when you return…</p>
            )}

            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={() => goTo(openPermissionSettings)}
                className="v-press v-btn-primary w-full"
              >
                {phase === 'still_off' ? 'Try again' : 'Open Notification Access'}
              </button>
              <button
                type="button"
                onClick={() => goTo(openAppSettings)}
                className="v-press v-btn-secondary min-h-12 w-full"
              >
                Open App info
              </button>
              <button type="button" onClick={onClose} className="min-h-11 w-full text-sm font-medium text-ink-2">
                Not now
              </button>
            </div>
          </>
        )}
      </motion.section>
    </motion.div>
  );
}
