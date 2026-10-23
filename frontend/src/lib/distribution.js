/**
 * distribution — which store this build is for, and so how Pro is paid for.
 *
 *   Google Play build (default)   Google Play Billing only. Google's payments
 *                                 policy: the Play app must not sell Pro any
 *                                 other way or point to one.
 *   Indus Appstore build          Razorpay (VITE_DISTRIBUTION=indus at build time)
 *   Website                       Razorpay
 *
 * Pro bought one way unlocks everywhere after sign-in; the server decides.
 */

/** 'play' | 'indus', fixed when the bundle is built. */
export function distribution(env = import.meta.env) {
  return env?.VITE_DISTRIBUTION === 'indus' ? 'indus' : 'play';
}

/**
 * @param {{ native: boolean, platform: string }} where  the running app
 * @returns {'play' | 'razorpay' | 'none'}
 */
export function paymentChannel({ native, platform }, dist = distribution()) {
  if (!native) return 'razorpay';
  if (platform !== 'android') return 'none';
  return dist === 'indus' ? 'razorpay' : 'play';
}
