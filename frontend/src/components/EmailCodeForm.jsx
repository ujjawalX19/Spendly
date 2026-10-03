/**
 * EmailCodeForm — type the code from a Vittova email (sign-up confirmation or
 * password reset) to finish the step inside the app. The link in the same
 * email still works; this is the way that needs no browser.
 */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { CODE_MAX, cleanCode, isCode, resendWaitLeft } from '../lib/emailCode';

export default function EmailCodeForm({ onVerify, onResend, submitLabel = 'Confirm' }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  // The first email has just been sent: the wait applies from the start.
  const [sentAt, setSentAt] = useState(() => Date.now());
  const [wait, setWait] = useState(() => resendWaitLeft(Date.now()));

  useEffect(() => {
    const tick = () => setWait(resendWaitLeft(sentAt));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [sentAt]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setNote('');
    if (!isCode(code)) { setError('Enter the code from the email (numbers only).'); return; }
    setBusy('verify');
    const res = await onVerify(code);
    setBusy('');
    if (!res.success) setError(res.message);
  };

  const resend = async () => {
    setError('');
    setNote('');
    setBusy('resend');
    const res = await onResend();
    setBusy('');
    if (res.success) { setSentAt(Date.now()); setNote('We sent a new email. Use the newest code.'); } else setError(res.message);
  };

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-3 text-left" noValidate>
      <label htmlFor="email-code" className="text-sm font-semibold text-zinc-300">Code from the email</label>
      <input
        id="email-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={CODE_MAX + 4}
        value={code}
        onChange={(e) => setCode(cleanCode(e.target.value))}
        placeholder="123456"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'email-code-error' : undefined}
        className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-center text-lg font-bold tracking-[0.3em] text-white placeholder:font-normal placeholder:tracking-[0.3em] placeholder:text-zinc-700 focus:border-lime-400 focus:outline-none focus:ring-4 focus:ring-lime-400/10"
      />
      {error && <p id="email-code-error" role="alert" className="text-sm text-rose-300">{error}</p>}
      {note && <p role="status" className="text-sm text-lime-300">{note}</p>}
      <button
        type="submit"
        disabled={Boolean(busy)}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-lime-400 text-sm font-extrabold text-black disabled:opacity-50"
      >
        {busy === 'verify' ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking…</> : submitLabel}
      </button>
      <button
        type="button"
        onClick={resend}
        disabled={Boolean(busy) || wait > 0}
        className="min-h-[44px] text-sm text-zinc-400 underline disabled:no-underline disabled:opacity-60"
      >
        {busy === 'resend' ? 'Sending…' : wait > 0 ? `Send a new email in ${wait}s` : 'Send a new email'}
      </button>
    </form>
  );
}
