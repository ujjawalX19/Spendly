/**
 * missionSync — sends mission actions through the offline queue
 * (lib/offlineQueue) and keeps it moving: on app start, when the connection
 * comes back, when the app returns to the foreground, and every minute while
 * it is open. Screens subscribe to see what is still waiting.
 */

import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { apiJson } from './apiConfig';
import { createQueue, requestFor } from './offlineQueue';

const listeners = new Set();
let active = null; // { userId, queue }
let flushing = null;

function queueFor(userId) {
  if (!active || active.userId !== userId) active = { userId, queue: createQueue(userId) };
  return active.queue;
}

function notify() {
  for (const fn of listeners) {
    try { fn(); } catch { /* a screen that went away */ }
  }
}

/** Items for the signed-in account (pending, and recently finished). */
export function queuedItems(session) {
  const id = session?.user?.id;
  return id ? queueFor(id).items() : [];
}

/** Re-render when the queue changes. Returns an unsubscribe function. */
export function subscribeQueue(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function send(item, session) {
  const { path, method, body } = requestFor(item);
  try {
    await apiJson(path, { session, method, body });
    return { ok: true };
  } catch (err) {
    return { ok: false, status: err?.status, code: err?.data?.code, message: err?.message, offline: !err?.status };
  }
}

/** Send everything waiting, once at a time. */
export function flushQueue(session) {
  const id = session?.user?.id;
  if (!id || !session?.access_token) return Promise.resolve(null);
  if (flushing) return flushing;
  const queue = queueFor(id);
  flushing = queue.flush((item) => send(item, session))
    .finally(() => { flushing = null; notify(); });
  return flushing;
}

/**
 * Do a mission action now if possible, else keep it for later.
 * @returns {Promise<{status:'done'|'pending'|'expired'|'failed', message?:string, item}>}
 */
export async function submitAction(session, kind, body, extra) {
  const id = session?.user?.id;
  if (!id) return { status: 'failed', message: 'Sign in again to save this.' };
  const queue = queueFor(id);
  const item = queue.enqueue(kind, body, extra);
  notify();
  await flushQueue(session);
  const now = queue.items().find((i) => i.id === item.id) || item;
  return { status: now.status === 'pending' ? 'pending' : now.status, message: now.lastError || undefined, item: now };
}

/** Keep the queue moving while signed in. Returns a cleanup function. */
export function startQueueSync(session) {
  if (!session?.user?.id) return () => {};
  flushQueue(session);
  const onOnline = () => flushQueue(session);
  window.addEventListener('online', onOnline);
  const timer = window.setInterval(() => {
    if (queueFor(session.user.id).pending().length) flushQueue(session);
  }, 60_000);
  let resume = null;
  if (Capacitor.isNativePlatform()) {
    resume = CapApp.addListener('appStateChange', ({ isActive }) => { if (isActive) flushQueue(session); });
  }
  return () => {
    window.removeEventListener('online', onOnline);
    window.clearInterval(timer);
    Promise.resolve(resume).then((h) => h?.remove?.()).catch(() => {});
  };
}

/** On sign-out: this account's waiting actions are removed from the phone. */
export function clearQueueForSignOut(userId) {
  if (userId) createQueue(userId).clear();
  active = null;
  notify();
}
