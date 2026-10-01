/**
 * appReady — is there a real screen under the startup splash yet?
 *
 * While the session is being restored, or a screen's code is still loading,
 * the app shows a full-screen loader. The splash must not fade onto that (a
 * dark screen with a spinner, then the app a moment later): it waits here
 * until no loader is on screen, so it fades straight onto the first screen.
 */

let loaders = 0;

/** A full-screen loader is on screen. Returns the function to call when it leaves. */
export function loaderShown() {
  loaders += 1;
  let left = false;
  return () => {
    if (left) return;
    left = true;
    loaders = Math.max(0, loaders - 1);
  };
}

export function loadersOnScreen() {
  return loaders;
}

const CHECK_MS = 50;

/**
 * Resolves once no loader has been on screen for two checks in a row (one
 * loader often hands over to the next), or after maxMs: a slow network must
 * never keep the splash up.
 *
 * @param {number} maxMs
 * @param {{ setTimeout: Function }} [timers]  for tests
 */
export function whenScreenReady(maxMs = 2500, timers = globalThis) {
  return new Promise((resolve) => {
    let waited = 0;
    let clear = 0;
    const check = () => {
      clear = loaders === 0 ? clear + 1 : 0;
      if (clear >= 2 || waited >= maxMs) { resolve(); return; }
      waited += CHECK_MS;
      timers.setTimeout(check, CHECK_MS);
    };
    check();
  });
}
