/**
 * homeWidget — hands the Android Home screen widget one figure: today's safe
 * amount. The widget has no token and makes no requests. The amount is hidden
 * unless the person turns it on in Profile, and everything is cleared at sign-out.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

const Widget = registerPlugin('HomeWidget');
const KEY = 'vittova.widget.amount';
const available = () => Capacitor.getPlatform() === 'android';
let lastDaily = null;

export function widgetShowsAmount() {
  try { return window.localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setWidgetShowsAmount(on) {
  try { window.localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* storage unavailable */ }
  if (lastDaily != null) updateHomeWidget(lastDaily);
}

export function updateHomeWidget(daily) {
  lastDaily = daily;
  if (!available() || !Number.isFinite(daily)) return;
  const amount = `₹${Math.max(0, Math.round(daily)).toLocaleString('en-IN')}`;
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  Widget.update({ amount, day, showAmount: widgetShowsAmount() }).catch(() => {});
}

export async function clearHomeWidget() {
  lastDaily = null;
  if (available()) await Widget.clear().catch(() => {});
}
