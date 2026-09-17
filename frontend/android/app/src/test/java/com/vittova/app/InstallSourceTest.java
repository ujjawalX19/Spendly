package com.vittova.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** When the app shows the "Allow restricted settings" steps up front. */
public class InstallSourceTest {

    @Test
    public void playStoreInstallsAreNotRestricted() {
        assertFalse(InstallSource.restrictedSettingsLikely(36, "com.android.vending"));
    }

    @Test
    public void downloadedApkOnAndroid13OrLaterIsLikelyRestricted() {
        assertTrue(InstallSource.restrictedSettingsLikely(33, "com.google.android.packageinstaller"));
        assertTrue(InstallSource.restrictedSettingsLikely(36, "com.android.chrome"));
        assertTrue(InstallSource.restrictedSettingsLikely(36, null));
    }

    @Test
    public void olderAndroidHasNoRestrictedSettings() {
        assertFalse(InstallSource.restrictedSettingsLikely(32, null));
        assertFalse(InstallSource.restrictedSettingsLikely(24, "com.android.chrome"));
    }

    @Test
    public void lookalikeInstallerNamesAreNotTrusted() {
        assertFalse(InstallSource.isFromTrustedStore("com.android.vending.fake"));
        assertFalse(InstallSource.isFromTrustedStore(""));
    }
}
