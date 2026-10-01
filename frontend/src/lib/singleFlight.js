/**
 * One run at a time. A second call while the first is still going gets the
 * first call's result instead of starting again (a second tap on "Continue
 * with Google" opens no second browser tab). `onBusy` runs for the ignored
 * call. Once the run settles, success or failure, the next call starts anew.
 *
 * @param {() => Promise<any>} run
 * @param {() => void} [onBusy]
 */
export function singleFlight(run, onBusy) {
  let current = null;
  return () => {
    if (current) {
      onBusy?.();
      return current;
    }
    current = Promise.resolve().then(run).finally(() => { current = null; });
    return current;
  };
}
