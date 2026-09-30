import { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquareText, X } from 'lucide-react';
import { readNotificationPrompt, recordNotificationPromptDismissed } from '../lib/notificationPrompt';

// After "Not now", show only a small reminder, and not before this long.
const REMINDER_AFTER_MS = 14 * 24 * 60 * 60 * 1000;


/**
 * Invitation to turn on automatic tracking from bank SMS. It NEVER asks
 * Android by itself: "Allow bank SMS" opens the explanation sheet
 * (SmsAccessSheet), and only a tap there shows Android's permission dialog.
 *
 * "Not now" is remembered. The full card does not come back; after 14 days a
 * single-line reminder may appear, and dismissing that is remembered too.
 */
export default function PermissionBanner({ isSupported, smsGranted, permissionChecked, onEnable }) {
  const [prompt, setPrompt] = useState(readNotificationPrompt);

  if (!isSupported || !permissionChecked || smsGranted) return null;

  const dismiss = () => {
    setPrompt(recordNotificationPromptDismissed({ reminderDismissed: Boolean(prompt) }));
  };

  if (prompt) {
    const due = Date.now() - prompt.dismissedAt > REMINDER_AFTER_MS;
    if (!due || prompt.reminderDismissed) return null;
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#141414] px-4 py-3 text-xs text-zinc-400">
        <MessageSquareText className="h-4 w-4 shrink-0 text-lime-400" />
        <span className="flex-1">Automatic tracking from bank SMS is off.</span>
        <button type="button" onClick={onEnable} className="font-bold text-lime-400">Turn on</button>
        <button type="button" onClick={dismiss} aria-label="Dismiss reminder" className="p-1 text-zinc-600"><X className="h-3.5 w-3.5" /></button>
      </div>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-lime-400/20 bg-[#141414] p-4"
      aria-labelledby="sms-access-title"
    >
      <div className="flex gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lime-400/15">
          <MessageSquareText className="h-5 w-5 text-lime-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="sms-access-title" className="text-sm font-bold text-white">Track payments automatically</h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            Vittova can add payments for you from your bank&apos;s debit SMS, even when the app is closed. It never reads
            messages from people, and keeps only the amount, payee, bank and time.
          </p>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={onEnable} className="rounded-xl bg-lime-400 px-4 py-2 text-xs font-black text-black">
              Allow bank SMS
            </button>
            <button type="button" onClick={dismiss} className="rounded-xl bg-zinc-800 px-4 py-2 text-xs font-bold text-zinc-300">
              Not now
            </button>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
