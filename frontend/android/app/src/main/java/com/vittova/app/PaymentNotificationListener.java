package com.vittova.app;

import android.content.ComponentName;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

/**
 * PaymentNotificationListener
 *
 * Watches notifications from an allowlist of payment and banking apps and
 * queues the ones that describe a completed transaction for the user to
 * confirm in the app.
 *
 * This service does NOT read SMS. It only runs after the user explicitly grants
 * Notification Access (Settings → Apps → Special app access → Notification
 * access → Vittova), and it ignores every package not on
 * {@link PaymentNotificationParser}'s allowlist before reading any text.
 *
 * Responsibilities:
 *   - {@link PaymentNotificationParser} decides what a notification means.
 *   - {@link DuplicateSuppressor} drops reposts and bank/UPI echoes.
 *   - {@link PendingPaymentStore} keeps detections until the user acts, so a
 *     payment made while Vittova is closed is not lost.
 *   - This class handles the Android lifecycle and extracting text.
 *
 * PRIVACY: notification text is never logged or stored. Only the parsed
 * amount, payee, app name, time and kind are queued, on the device.
 */
public class PaymentNotificationListener extends NotificationListenerService {

    private static final String TAG = "SpendlyNLS";

    private final DuplicateSuppressor duplicates = new DuplicateSuppressor(200);

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            if (sbn == null || sbn.getNotification() == null) return;

            // Allowlist check first: text from any other app is never read.
            final String packageName = sbn.getPackageName();
            if (!PaymentNotificationParser.isSupportedPackage(packageName)) return;

            // Ongoing notifications are progress indicators ("Paying…"), not results.
            if ((sbn.getNotification().flags & android.app.Notification.FLAG_ONGOING_EVENT) != 0) return;

            Bundle extras = sbn.getNotification().extras;
            if (extras == null) return;

            PaymentNotificationParser.Result result = PaymentNotificationParser.parse(
                packageName,
                str(extras.getCharSequence("android.title")),
                str(extras.getCharSequence("android.text")),
                str(extras.getCharSequence("android.bigText")),
                sbn.getPostTime());

            // FAILED and UNKNOWN are dropped: inventing a transaction is worse than missing one.
            if (!result.isRecordable()) return;
            if (duplicates.isDuplicate(result, sbn.getPostTime())) return;

            PendingPaymentQueue.Entry entry = new PendingPaymentQueue.Entry(
                result.fingerprint,
                result.kind.name(),
                result.amount,
                result.merchant,
                result.appName,
                sbn.getPostTime(),
                result.needsConfirmation);

            // Persist first, so the detection survives the app being closed.
            if (!PendingPaymentStore.add(getApplicationContext(), entry)) return;

            // If the app is open, show it immediately as well.
            UpiNotificationPlugin.notifyPayment(entry);

            if (BuildConfigCompat.DEBUG) Log.d(TAG, "Queued a " + result.kind + " event");
        } catch (Throwable t) {
            // A crash here disables the listener until access is re-granted.
            Log.e(TAG, "Failed to process a notification: " + t.getClass().getSimpleName());
        }
    }

    private static String str(CharSequence cs) {
        return cs == null ? "" : cs.toString();
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        requestRebind(new ComponentName(this, PaymentNotificationListener.class));
    }

    /**
     * Indirection around BuildConfig so this file compiles in isolation during
     * unit testing, where the generated BuildConfig class is not on the classpath.
     */
    static final class BuildConfigCompat {
        static final boolean DEBUG = isDebug();

        private static boolean isDebug() {
            try {
                Class<?> c = Class.forName("com.vittova.app.BuildConfig");
                return c.getField("DEBUG").getBoolean(null);
            } catch (Throwable t) {
                return false;
            }
        }

        private BuildConfigCompat() { }
    }
}
