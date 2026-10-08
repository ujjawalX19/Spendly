import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, MessageSquareText, ShieldAlert, ShieldCheck, X } from 'lucide-react';

/**
 * The explanation shown immediately before Android's SMS permission dialog
 * (Google Play's "prominent disclosure"): what is read, what is kept, and that
 * nothing happens until the user taps Allow. Android's own dialog follows the
 * tap; the sheet then reports what Android actually decided.
 *
 * If Android will no longer ask ("denied": the user chose "Don't allow" twice),
 * the only way is App info → Permissions → SMS, and the sheet says so.
 */
export const SMS_DISCLOSURE = [
  'Vittova reads SMS from banks, cards and payment services (sender IDs like VM-HDFCBK) to find debit alerts. Messages from people are never read.',
  'One-time passwords and offers are skipped. From a debit alert, only the amount, payee, bank and time are kept; the message itself is never stored or uploaded.',
  "Clear payments are added to your expenses automatically, even when Vittova is closed; unclear ones wait for you. Messages from before you allow this aren't imported.",
  'Turn it off any time in Profile → Payment tracking, or remove the SMS permission in Android settings.',
];

export default function SmsAccessSheet({ smsGranted, smsPermission, requestSms, openAppSettings, onClose }) {
  // explain → asking → granted | declined
  const [phase, setPhase] = useState(smsGranted ? 'granted' : 'explain');
  const blocked = smsPermission === 'denied';

  const allow = async () => {
    setPhase('asking');
    const info = await requestSms();
    setPhase(info?.smsGranted ? 'granted' : 'declined');
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
        aria-labelledby="sms-sheet-title"
        className="v-sheet relative z-10 max-h-[calc(100dvh-env(safe-area-inset-top)-1rem)] w-full max-w-md overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'tween', duration: 0.24, ease: 'easeOut' }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {phase === 'granted' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" /> : phase === 'declined' ? <ShieldAlert className="h-5 w-5 shrink-0 text-warn" aria-hidden="true" /> : <MessageSquareText className="h-5 w-5 shrink-0 text-ink-2" aria-hidden="true" />}
            <h2 id="sms-sheet-title" className="text-lg font-bold text-ink">
              {phase === 'granted' ? 'Bank SMS tracking is on'
                : phase === 'declined' ? 'SMS access is off'
                  : 'Track payments from bank SMS'}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-2">
            <X className="h-5 w-5" />
          </button>
        </div>

        {phase === 'granted' ? (
          <>
            <p className="text-sm leading-relaxed text-ink-soft">
              New debit alerts from your bank are added to your expenses automatically. Unclear ones wait for you on Home.
            </p>
            <button type="button" onClick={onClose} className="v-press v-btn-primary mt-5 w-full">Done</button>
          </>
        ) : (
          <>
            {phase === 'declined' && (
              <p role="status" className="mb-4 rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-ink-soft">
                {blocked
                  ? 'Android will not ask again. To allow it: App info → Permissions → SMS → Allow.'
                  : "SMS access wasn't allowed, so bank debit alerts can't be added. You can allow it any time."}
              </p>
            )}
            <ul className="space-y-3">
              {SMS_DISCLOSURE.map((line) => (
                <li key={line} className="flex gap-3 text-sm leading-relaxed text-ink-soft">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 space-y-1">
              {blocked ? (
                <button type="button" onClick={openAppSettings} className="v-press v-btn-primary w-full">Open App info</button>
              ) : (
                <button type="button" onClick={allow} disabled={phase === 'asking'} className="v-press v-btn-primary w-full">
                  {phase === 'asking' ? 'Waiting for Android…' : 'Allow bank SMS'}
                </button>
              )}
              <button type="button" onClick={onClose} className="min-h-11 w-full text-sm font-medium text-ink-2">Not now</button>
            </div>
          </>
        )}
      </motion.section>
    </motion.div>
  );
}
