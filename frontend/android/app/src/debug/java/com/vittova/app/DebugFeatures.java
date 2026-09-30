package com.vittova.app;

/**
 * DEBUG BUILDS ONLY. The release build compiles
 * src/release/java/com/vittova/app/DebugFeatures.java instead, where both are
 * off, so neither can exist in a Play build (checked by the release APK audit).
 */
final class DebugFeatures {

    /**
     * Lets a device test post a payment notification from the adb shell, which
     * Android attributes to the package "com.android.shell":
     *
     *   adb shell cmd notification post -t "Payment successful" vittova-test "Paid ₹150 to Chai Point"
     */
    static final String[][] EXTRA_SOURCES = {
        { "com.android.shell", "Device test", "UPI" },
    };

    /** Write pipeline stage codes to logcat ({@link PipelineLog}). */
    static final boolean PIPELINE_LOG = true;

    private DebugFeatures() { }
}
