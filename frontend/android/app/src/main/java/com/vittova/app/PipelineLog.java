package com.vittova.app;

import android.util.Log;

/**
 * Stage codes for the payment-tracking pipeline, for device testing:
 *
 *   NOTIFICATION_RECEIVED  PACKAGE_ALLOWED  TRACKING_OFF  IGNORED_ONGOING
 *   PARSE_SUCCESS  PARSE_FAILED  PARSE_NOT_EXPENSE
 *   LOCAL_PERSIST_SUCCESS  LOCAL_PERSIST_FAILED  DUPLICATE_IGNORED
 *   SYNC_QUEUED  NEEDS_REVIEW  LISTENER_CONNECTED  LISTENER_DISCONNECTED
 *
 * DEBUG BUILDS ONLY ({@link DebugFeatures#PIPELINE_LOG} is a compile-time
 * false in release, so the calls compile away). A code is the whole message:
 * never notification text, amounts, payees, account numbers or references.
 * Codes are only written for apps on the allowlist, so nothing reveals that
 * some other app posted.
 */
final class PipelineLog {

    private static final String TAG = "VittovaPipeline";

    private PipelineLog() { }

    static void event(String code) {
        if (DebugFeatures.PIPELINE_LOG) Log.i(TAG, code);
    }
}
