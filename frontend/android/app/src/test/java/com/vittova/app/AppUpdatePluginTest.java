package com.vittova.app;

import static org.junit.Assert.assertEquals;

import android.app.Activity;

import com.google.android.play.core.install.model.ActivityResult;
import com.google.android.play.core.install.model.UpdateAvailability;

import org.junit.Test;

/** How Google Play's update answers are read. */
public class AppUpdatePluginTest {

    @Test
    public void onlyARealUpdateCountsAsAvailable() {
        assertEquals("available", AppUpdatePlugin.state(UpdateAvailability.UPDATE_AVAILABLE));
        assertEquals("in_progress", AppUpdatePlugin.state(UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS));
        assertEquals("none", AppUpdatePlugin.state(UpdateAvailability.UPDATE_NOT_AVAILABLE));
        assertEquals("none", AppUpdatePlugin.state(UpdateAvailability.UNKNOWN));
    }

    @Test
    public void aCancelledOrFailedUpdateIsNeverReportedAsDone() {
        assertEquals("updated", AppUpdatePlugin.result(Activity.RESULT_OK));
        assertEquals("cancelled", AppUpdatePlugin.result(Activity.RESULT_CANCELED));
        assertEquals("failed", AppUpdatePlugin.result(ActivityResult.RESULT_IN_APP_UPDATE_FAILED));
        assertEquals("failed", AppUpdatePlugin.result(12345));
    }
}
