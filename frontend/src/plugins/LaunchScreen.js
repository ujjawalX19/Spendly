import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * LaunchScreen — hand-off from Android's launch screen to the app
 * (android/app/src/main/java/com/vittova/app/LaunchScreenPlugin.java).
 *
 *   geometry() -> { windowTopDp, screenHeightDp, webViewTopDp, density }
 *   ready()    the web splash has painted the launch frame: fade Android's screen
 *              out. Resolves when Android's screen has gone (not when asked).
 */
export const LaunchScreen = registerPlugin('LaunchScreen');

const native = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const within = (ms, promise) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);

/** Where the WebView sits on the screen; null on the web or if Android does not answer quickly. */
export async function launchGeometry() {
  if (!native()) return null;
  try {
    return await within(250, LaunchScreen.geometry());
  } catch {
    return null;
  }
}

let released = null;

/**
 * Ask Android to let its launch screen go, and wait until it has. The web
 * splash starts its animation after this, so the pulse is seen from its first
 * frame instead of playing underneath Android's screen. Never waits long: an
 * older native build answers at once, and a lost answer is given up on.
 */
export function releaseLaunchScreen() {
  if (!native()) return Promise.resolve();
  if (!released) {
    released = within(3000, LaunchScreen.ready()).catch(() => null);
  }
  return released;
}
