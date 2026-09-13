import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

/**
 * On Android, Google sign-in runs in a Chrome Custom Tab. If the user closes
 * that tab without finishing, nothing else tells the app — without this the
 * "Continue with Google" button would spin forever.
 */
export function useOAuthBrowserReset(onClosed) {
  const callback = useRef(onClosed);
  useEffect(() => { callback.current = onClosed; }, [onClosed]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let handle;
    let cancelled = false;
    Browser.addListener('browserFinished', () => callback.current?.())
      .then((h) => { if (cancelled) h.remove(); else handle = h; })
      .catch(() => { /* plugin unavailable */ });
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, []);
}
