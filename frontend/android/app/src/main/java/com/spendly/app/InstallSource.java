package com.spendly.app;

/**
 * Whether Android is likely to show "Restricted setting" for Notification
 * Access.
 *
 * Android 13 (API 33) and later block sensitive settings, Notification Access
 * among them, for apps installed from a downloaded APK file rather than from an
 * app store, until the user allows it in App info → ⋮ → Allow restricted
 * settings. The app cannot and does not change that; it only uses this to
 * decide whether to show those steps up front.
 *
 * Pure logic, so it is unit tested on the JVM.
 */
final class InstallSource {

    static final int ANDROID_13 = 33;

    /** Stores whose installs Android does not restrict. */
    private static final String[] TRUSTED_STORES = {
        "com.android.vending",            // Google Play
        "com.google.android.feedback",    // older Play installs
        "com.sec.android.app.samsungapps" // Galaxy Store
    };

    private InstallSource() { }

    static boolean isFromTrustedStore(String installerPackage) {
        if (installerPackage == null) return false;
        for (String store : TRUSTED_STORES) {
            if (store.equals(installerPackage)) return true;
        }
        return false;
    }

    static boolean restrictedSettingsLikely(int sdkInt, String installerPackage) {
        return sdkInt >= ANDROID_13 && !isFromTrustedStore(installerPackage);
    }
}
