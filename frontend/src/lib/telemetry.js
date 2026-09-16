import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { supabase } from './supabaseClient';
import { apiUrl } from './apiConfig';
import { authFailureCode, createTelemetry } from './telemetryCore';

/* global __APP_VERSION__ */

/**
 * App telemetry for the Owner Console: first launch (installs), app opens,
 * sign-in outcomes and crashes. Everything else (expenses, imports, AI) is
 * recorded by the backend from the API request itself.
 *
 * Best effort by design: nothing here may throw into the app, block a screen
 * or retry aggressively. See telemetryCore.js for exactly what is sent.
 */

function storage() {
  try { return window.localStorage; } catch { return null; }
}

let versionPromise = null;
function appVersion() {
  if (!versionPromise) {
    versionPromise = Capacitor.isNativePlatform()
      ? CapApp.getInfo().then((info) => info.version).catch(() => undefined)
      : Promise.resolve(typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : undefined);
  }
  return versionPromise;
}

async function send(batch) {
  let session = null;
  try {
    ({ data: { session } } = await supabase.auth.getSession());
  } catch { /* anonymous */ }
  const response = await fetch(apiUrl('/telemetry/events'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(batch),
    keepalive: true,
  });
  // 4xx means the batch itself was rejected: drop it rather than retry forever.
  return response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429);
}

let instance = null;
function telemetry() {
  if (!instance) {
    instance = createTelemetry({ storage: storage(), send, platform: Capacitor.getPlatform(), appVersion });
  }
  return instance;
}

/** Call once at startup. */
export function initTelemetry() {
  try {
    const t = telemetry();
    t.recordOpen();
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('resume', () => telemetry().recordOpen()).catch(() => {});
      CapApp.addListener('pause', () => { telemetry().flush(); }).catch(() => {});
    } else {
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') telemetry().flush();
      });
    }
  } catch { /* telemetry must never break startup */ }
}

export function track(name, props) {
  try { telemetry().track(name, props); } catch { /* best effort */ }
}

export function trackLogin(user) {
  try { telemetry().recordLogin(user); } catch { /* best effort */ }
}

export function trackAuthFailure(name, method, error) {
  track(name, { ...(method ? { method } : {}), code: authFailureCode(error) });
}

/** Send what is queued now (e.g. before signing out, or after a crash). */
export function flushTelemetry() {
  try { return telemetry().flush(); } catch { return Promise.resolve(false); }
}
