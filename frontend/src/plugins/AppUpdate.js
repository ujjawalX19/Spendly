import { registerPlugin } from '@capacitor/core';

/**
 * AppUpdate — Google Play's in-app update
 * (android/app/src/main/java/com/vittova/app/AppUpdatePlugin.java).
 *
 *   check()           -> { available, inProgress, immediateAllowed, availableVersionCode }
 *   startImmediate()  -> { result: 'updated'|'cancelled'|'failed'|'not_available' }
 *   openStore()       opens Vittova's page in the Play Store app
 *
 * Calls reject with code UNAVAILABLE when Google Play cannot help (a copy not
 * installed from Google Play, or no Play Store).
 */
export const AppUpdate = registerPlugin('AppUpdate');
