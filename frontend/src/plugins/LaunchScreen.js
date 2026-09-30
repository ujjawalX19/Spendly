import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * LaunchScreen — hand-off from Android's launch screen to the app
 * (android/app/src/main/java/com/vittova/app/LaunchScreenPlugin.java).
 *
 *   geometry() -> { windowTopDp, screenHeightDp, webViewTopDp, density }
 *   ready()    the web splash has painted the launch frame: fade Android's screen out
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

let released = false;

/** Release Android's launch screen (once). Safe on the web and on older native builds. */
export async function releaseLaunchScreen() {
  if (released || !native()) return;
  released = true;
  try {
    await LaunchScreen.ready();
  } catch { /* an older native build: Android releases it at the first frame */ }
}
