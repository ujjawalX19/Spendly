import { registerPlugin } from '@capacitor/core';

/**
 * GoogleAuth — native Sign in with Google via Android Credential Manager
 * (android/app/src/main/java/com/vittova/app/GoogleAuthPlugin.java).
 *
 *   signIn({ serverClientId, nonce }) -> { idToken }   (nonce = SHA-256 hex of the raw nonce)
 *   signOut()                                           clears Credential Manager state
 *
 * Rejection codes: CANCELLED, NO_CREDENTIAL, INTERRUPTED, FAILED.
 */
export const GoogleAuth = registerPlugin('GoogleAuth');
