package com.spendly.app;

import android.content.ComponentName;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * PaymentNotificationListener
 *
 * Watches notifications posted by payment and banking apps and forwards the
 * ones that describe a completed transaction to the JavaScript layer.
 *
 * This service does NOT read SMS. It only sees notifications already shown in
 * the notification shade, and only after the user explicitly grants
 * Notification Access in
 *   Settings -> Apps -> Special app access -> Notification access -> Spendly
 *
 * Responsibilities are split deliberately:
 *   - {@link PaymentNotificationParser} decides *what a notification means*.
 *     It has no Android dependencies and is covered by unit tests.
 *   - This class deals with Android: lifecycle, extracting text, and
 *     suppressing the duplicates the platform generates.
 *
 * PRIVACY: notification text is never logged. It contains payee names and
 * amounts, and logcat is readable by adb and by crash reporters. Only
 * non-identifying outcomes are logged, and only in debug builds.
 */
public class PaymentNotificationListener extends NotificationListenerService {

    private static final String TAG = "SpendlyNLS";

    /**
     * Recently forwarded transaction fingerprints.
     *
     * Android reposts a notification every time the posting app updates it —
     * "Paying..." then "Paid" is two callbacks for one payment — and a single
     * UPI transfer is commonly announced twice, once by the payment app and
     * once by the bank. Without this, one payment became two or three
     * expenses.
     *
     * A bounded LRU keyed on fingerprint -> first-seen time. Access is
     * synchronized because onNotificationPosted is not guaranteed to be
     * delivered on a single thread.
     */
    private static final int MAX_RECENT = 200;

    private final Map<String, Long> recentEvents =
        new LinkedHashMap<String, Long>(MAX_RECENT + 1, 0.75f, false) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, Long> eldest) {
                return size() > MAX_RECENT;
            }
        };

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            if (sbn == null || sbn.getNotification() == null) return;

            final String packageName = sbn.getPackageName();
            if (!PaymentNotificationParser.isSupportedPackage(packageName)) return;

            // Ongoing notifications are progress indicators ("Paying…"), not
            // results. Waiting for the final post avoids acting on a payment
            // that has not completed.
            if ((sbn.getNotification().flags & android.app.Notification.FLAG_ONGOING_EVENT) != 0) {
                return;
            }

            Bundle extras = sbn.getNotification().extras;
            if (extras == null) return;

            String title = str(extras.getCharSequence("android.title"));
            String text = str(extras.getCharSequence("android.text"));
            String bigText = str(extras.getCharSequence("android.bigText"));

            PaymentNotificationParser.Result result =
                PaymentNotificationParser.parse(packageName, title, text, bigText, sbn.getPostTime());

            if (!result.isRecordable()) {
                // FAILED and UNKNOWN are dropped on purpose. Inventing a
                // transaction is far worse than missing one.
                if (BuildConfigCompat.DEBUG) {
                    Log.d(TAG, "Ignored notification from " + packageName + ": " + result.reason);
                }
                return;
            }

            if (isDuplicate(result, sbn.getPostTime())) {
                if (BuildConfigCompat.DEBUG) Log.d(TAG, "Duplicate suppressed");
                return;
            }

            UpiNotificationPlugin.notifyPayment(
                result.appName,
                result.amount,
                result.merchant,
                sbn.getPostTime(),
                result.kind.name(),
                result.needsConfirmation,
                result.fingerprint
            );

            if (BuildConfigCompat.DEBUG) {
                // Kind only — never the amount, payee, or raw text.
                Log.d(TAG, "Forwarded a " + result.kind + " event");
            }

        } catch (Throwable t) {
            // A crash here disables the listener until the user re-grants
            // access, so nothing is allowed to escape.
            Log.e(TAG, "Failed to process a notification", t);
        }
    }

    /**
     * True when this transaction has already been forwarded recently.
     * Checks the current dedupe bucket and the previous one, so two reports of
     * the same payment landing either side of a bucket boundary still collide.
     */
    private boolean isDuplicate(PaymentNotificationParser.Result result, long postTime) {
        String[] keys = PaymentNotificationParser.fingerprintsFor(
            result.kind, result.amount, result.merchant, postTime);

        synchronized (recentEvents) {
            long cutoff = postTime - (2 * PaymentNotificationParser.DEDUPE_WINDOW_MS);
            recentEvents.values().removeIf(seenAt -> seenAt < cutoff);

            for (String key : keys) {
                if (recentEvents.containsKey(key)) return true;
            }
            recentEvents.put(keys[0], postTime);
        }
        return false;
    }

    private static String str(CharSequence cs) {
        return cs == null ? "" : cs.toString();
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // Only posted notifications are of interest.
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        Log.i(TAG, "Notification access granted — payment tracking active.");
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        Log.i(TAG, "Notification access lost — requesting rebind.");
        requestRebind(new ComponentName(this, PaymentNotificationListener.class));
    }

    /**
     * Indirection around BuildConfig so this file compiles in isolation during
     * unit testing, where the generated BuildConfig class is not on the
     * classpath.
     */
    static final class BuildConfigCompat {
        static final boolean DEBUG = isDebug();

        private static boolean isDebug() {
            try {
                Class<?> c = Class.forName("com.spendly.app.BuildConfig");
                return c.getField("DEBUG").getBoolean(null);
            } catch (Throwable t) {
                return false;
            }
        }

        private BuildConfigCompat() { }
    }
}
