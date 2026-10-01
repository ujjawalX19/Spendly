import { registerPlugin } from '@capacitor/core';

/**
 * GoogleAuth — native Sign in with Google via Android Credential Manager
 * (android/app/src/main/java/com/vittova/app/GoogleAuthPlugin.java).
 *
 *   signIn({ serverClientId, nonce }) -> { idToken }   (nonce = SHA-256 hex of the raw nonce)
 *   signOut()                                           clears Credential Manager state
 *   logEvent({ code })                                  one fixed code to logcat (see lib/authLog.js)
 *
 * Rejection codes (GoogleAuthErrors.java): USER_CANCELLED, OAUTH_CONFIGURATION_ERROR,
 * NO_CREDENTIAL, NETWORK_ERROR, INTERRUPTED, UNSUPPORTED, GOOGLE_AUTH_FAILED.
 */
export const GoogleAuth = registerPlugin('GoogleAuth');
