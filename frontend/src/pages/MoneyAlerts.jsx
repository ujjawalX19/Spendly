/**
 * Money alerts — choose which notifications this phone may show. All are off
 * until chosen; Android's permission is asked only when one is turned on.
 */
import { useState } from 'react';
import { Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ALERT_KINDS, alertPrefs, setAlertKind } from '../lib/alerts';
import { remindersSupported } from '../lib/debitReminders';

export default function MoneyAlerts() {
  const { session } = useAuth();
  const [prefs, setPrefs] = useState(alertPrefs);
  const [note, setNote] = useState('');

  const toggle = async (id) => {
    setNote('');
    const on = prefs[id] !== true;
    const result = await setAlertKind(id, on, session);
    if (result === 'denied') setNote('Android notifications are off for Vittova. Allow them in App info, then try again.');
    else setPrefs(alertPrefs());
  };

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 pb-24 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Money alerts</h1>
        <p className="mt-1 text-sm text-ink-2">Choose only what helps. Alerts never show amounts, because they can appear on your lock screen.</p>
      </div>
      {!remindersSupported() ? (
        <p className="v-block p-4 text-sm text-ink-soft">Alerts work in the Vittova Android app.</p>
      ) : (
        <ul className="v-block v-rows px-4">
          {ALERT_KINDS.map((k) => {
            const on = prefs[k.id] === true;
            return (
              <li key={k.id}>
                <button type="button" role="switch" aria-checked={on} onClick={() => toggle(k.id)} className="flex min-h-[60px] w-full items-center gap-3 py-2 text-left">
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-ink">{k.label}</span><span className="block text-xs text-ink-3">{k.hint}</span></span>
                  <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${on ? 'border-accent bg-accent text-on-fill' : 'border-line-strong'}`}>{on && <Check className="h-4 w-4" strokeWidth={3} />}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {note && <p role="alert" className="px-1 text-sm text-danger">{note}</p>}
      <p className="px-1 text-xs text-ink-3">Checked when you open Vittova, so a budget alert follows your next visit, not each payment.</p>
    </div>
  );
}
