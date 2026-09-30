package com.vittova.app;

import android.app.Notification;
import android.content.ComponentName;
import android.content.Context;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

/**
 * PaymentNotificationListener — captures payments from supported UPI and bank
 * app notifications, whether or not Vittova's screens are open.
 *
 * Android binds this service itself once the user grants Notification Access
 * (Settings → Apps → Special app access → Notification access → Vittova) and
 * keeps it bound while Vittova is closed or swiped away, and after a restart.
 * Nothing here depends on an Activity, the WebView or the web app being alive:
 * each detection is written to {@link PendingPaymentStore} before this method
 * returns, and the app uploads it the next time it runs with the user signed
 * in (see frontend/src/lib/paymentTracking.js).
 *
 * Pipeline, in order:
 *   1. package on the allowlist?        otherwise return without reading anything
 *   2. tracking switched on in Vittova?  (on by default)
 *   3. finished (not "Paying…")?
 *   4. parse → only a completed EXPENSE continues (income, refunds, failures,
 *      offers and anything ambiguous are dropped)
 *   5. duplicate of a queued or recently uploaded payment?  (persisted rules,
 *      so they survive the process being killed)
 *   6. persist: PENDING_SYNC when clear, NEEDS_REVIEW when the parser was unsure
 *   7. if the app is open, tell it at once so it can upload
 *
 * PRIVACY: notification text is never logged or stored. Only the parsed
 * amount, payee, app, time and a hash of any transaction reference are kept,
 * on the device, until uploaded or reviewed.
 */
public class PaymentNotificationListener extends NotificationListenerService {

    private static final String TAG = "SpendlyNLS";

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            if (sbn == null || sbn.getNotification() == null) return;

            // 1. Allowlist first: text from any other app is never read or logged.
            final String packageName = sbn.getPackageName();
            if (!PaymentSources.isSupported(packageName)) return;
            PipelineLog.event("NOTIFICATION_RECEIVED");
            PipelineLog.event("PACKAGE_ALLOWED");

            Context context = getApplicationContext();

            // 2. The user can switch tracking off in Vittova without revoking access.
            if (!PendingPaymentStore.trackingEnabled(context)) {
                PipelineLog.event("TRACKING_OFF");
                return;
            }

            // 3. Ongoing notifications are progress indicators ("Paying…"), not results.
            if ((sbn.getNotification().flags & Notification.FLAG_ONGOING_EVENT) != 0) {
                PipelineLog.event("IGNORED_ONGOING");
                return;
            }

            Bundle extras = sbn.getNotification().extras;
            if (extras == null) return;

            // 4. Parse. Anything but a completed expense stops here: inventing a
            //    transaction is worse than missing one.
            PaymentNotificationParser.Result result = PaymentNotificationParser.parse(
                packageName,
                str(extras.getCharSequence(Notification.EXTRA_TITLE)),
                str(extras.getCharSequence(Notification.EXTRA_TEXT)),
                str(extras.getCharSequence(Notification.EXTRA_BIG_TEXT)),
                sbn.getPostTime());
            if (result.kind == PaymentNotificationParser.Kind.UNKNOWN) {
                PipelineLog.event("PARSE_FAILED");
                return;
            }
            if (result.kind != PaymentNotificationParser.Kind.EXPENSE) {
                PipelineLog.event("PARSE_NOT_EXPENSE");
                return;
            }
            PipelineLog.event("PARSE_SUCCESS");

            // 5 + 6. Duplicate check and persist, in one synchronous step.
            PaymentSources.Type type = PaymentSources.typeFor(packageName);
            PendingPaymentQueue.Payment payment = PendingPaymentQueue.fromParse(
                result, packageName, type == null ? "UPI_APP" : type.name(), sbn.getPostTime());
            PendingPaymentQueue.AddResult added = PendingPaymentStore.add(context, payment);
            if (added == PendingPaymentQueue.AddResult.DUPLICATE) {
                PipelineLog.event("DUPLICATE_IGNORED");
                return;
            }
            if (added != PendingPaymentQueue.AddResult.ADDED) {
                PipelineLog.event("LOCAL_PERSIST_FAILED");
                return;
            }
            PipelineLog.event("LOCAL_PERSIST_SUCCESS");
            PipelineLog.event(PendingPaymentQueue.NEEDS_REVIEW.equals(payment.status) ? "NEEDS_REVIEW" : "SYNC_QUEUED");

            // 7. If Vittova is open, it uploads straight away.
            UpiNotificationPlugin.notifyPayment(payment);
        } catch (Throwable t) {
            // A crash here disables the listener until access is re-granted.
            Log.e(TAG, "Failed to process a notification: " + t.getClass().getSimpleName());
        }
    }

    private static String str(CharSequence cs) {
        return cs == null ? "" : cs.toString();
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        PendingPaymentStore.setListenerConnected(getApplicationContext(), true);
        PipelineLog.event("LISTENER_CONNECTED");
        // Tracking switched off in Vittova: stop receiving notifications at all
        // until it is switched back on (UpiNotificationPlugin requests a rebind).
        if (!PendingPaymentStore.trackingEnabled(getApplicationContext())) {
            try { requestUnbind(); } catch (Exception e) { /* keep running; each event is still ignored */ }
        }
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        PendingPaymentStore.setListenerConnected(getApplicationContext(), false);
        PipelineLog.event("LISTENER_DISCONNECTED");
        if (PendingPaymentStore.trackingEnabled(getApplicationContext())) {
            requestRebind(new ComponentName(this, PaymentNotificationListener.class));
        }
    }
}
