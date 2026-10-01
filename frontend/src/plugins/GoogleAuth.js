import { registerPlugin } from '@capacitor/core';

/**
 * GoogleAuth — in-app Sign in with Google on Android
 * (android/app/src/main/java/com/vittova/app/GoogleAuthPlugin.java).
 *
 *   signIn({ serverClientId, nonce }) -> { idToken }   (nonce = SHA-256 hex of the raw nonce)
 *   signOut()                                           the next sign-in asks which account again
 *
 * Rejection codes (GoogleAuthErrors.java): USER_CANCELLED, OAUTH_CONFIGURATION_ERROR,
 * NETWORK_ERROR, UNSUPPORTED, GOOGLE_AUTH_FAILED.
 */
export const GoogleAuth = registerPlugin('GoogleAuth');
