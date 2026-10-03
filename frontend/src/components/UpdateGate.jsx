/**
 * UpdateGate — the "Update Vittova" screen for a build the server no longer
 * supports (lib/appUpdate.js). Android app only; the website is always current.
 *
 * On a too-old build it covers the app and asks Google Play for an immediate
 * update, once. If the person backs out, or Google Play cannot run the update
 * here, the screen stays with one button: nothing loops, and nothing is blank.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Download } from 'lucide-react';
import { apiUrl } from '../lib/apiConfig';
import { AppUpdate } from '../plugins/AppUpdate';
import { MIN_VERSION_KEY, effectiveMinimum, updateRequired } from '../lib/appUpdate';

const isAndroidApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const CONFIG_TIMEOUT_MS = 8000;

async function fetchConfig() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG_TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl('/app-config'), { signal: controller.signal });
    if (!res.ok) return { ok: false };
    return { ok: true, body: await res.json() };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

export default function UpdateGate() {
  const [required, setRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const asked = useRef(false);

  useEffect(() => {
    if (!isAndroidApp()) return undefined;
    let cancelled = false;
    (async () => {
      let current = 0;
      try { current = (await CapApp.getInfo()).build; } catch { return; }
      let remembered = null;
      try { remembered = window.localStorage.getItem(MIN_VERSION_KEY); } catch { /* storage unavailable */ }
      const reply = await fetchConfig();
      const min = effectiveMinimum(reply, remembered);
      if (reply.ok) {
        try { window.localStorage.setItem(MIN_VERSION_KEY, String(min)); } catch { /* storage unavailable */ }
      }
      if (!cancelled && updateRequired(current, min)) setRequired(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const update = useCallback(async (fromTap) => {
    setBusy(true);
    setNote('');
    try {
      const { result } = await AppUpdate.startImmediate();
      if (result === 'updated') return; // Google Play restarts the app on the new version.
      if (result === 'cancelled') setNote('Vittova needs this update to carry on.');
      else if (result === 'failed') setNote("The update didn't finish. Check your connection and try again.");
      else if (fromTap) await AppUpdate.openStore();
    } catch {
      // Google Play's in-app update cannot run here: its store page can.
      if (fromTap) {
        try { await AppUpdate.openStore(); } catch { setNote('Open the Play Store and update Vittova to carry on.'); }
      }
    } finally {
      setBusy(false);
    }
  }, []);

  // One automatic attempt; after that only the button starts an update.
  useEffect(() => {
    if (!required || asked.current) return;
    asked.current = true;
    update(false);
  }, [required, update]);

  if (!required) return null;

  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="update-title" className="fixed inset-0 z-[900] flex items-center justify-center bg-[#0B1220] px-6 text-center text-white">
      <div className="w-full max-w-sm">
        <img src="/vittova-mark.svg" alt="" width="56" height="56" className="mx-auto mb-5" />
        <h1 id="update-title" className="text-[22px] font-extrabold tracking-tight">Update Vittova</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-zinc-400">
          This version is no longer supported. Update to keep your money tracking accurate and secure. Your data stays as it is.
        </p>
        <button
          type="button"
          onClick={() => update(true)}
          disabled={busy}
          className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-lime-400 text-[15px] font-extrabold text-[#0B1220] disabled:opacity-60"
        >
          <Download className="h-4 w-4" aria-hidden="true" /> {busy ? 'Opening Google Play…' : 'Update now'}
        </button>
        {note && <p role="status" className="mt-4 text-sm text-zinc-400">{note}</p>}
      </div>
    </div>
  );
}
