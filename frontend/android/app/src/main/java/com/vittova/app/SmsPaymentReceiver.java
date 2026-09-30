package com.vittova.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;
import android.util.Log;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * SmsPaymentReceiver — reads each arriving bank debit SMS, including while
 * Vittova is closed or swiped away (Android starts the app's process to
 * deliver it).
 *
 * Declared with android:permission="android.permission.BROADCAST_SMS" in the
 * manifest, so only the system's telephony stack can send it: another app
 * cannot fake an SMS into Vittova. It only receives anything once the user has
 * granted SMS access.
 *
 * Long messages arrive in parts; parts from the same sender are joined before
 * parsing. Everything else is {@link SmsIntake}.
 */
public class SmsPaymentReceiver extends BroadcastReceiver {

    private static final String TAG = "SpendlyNLS";

    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            if (intent == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
            Context app = context.getApplicationContext();
            if (!PendingPaymentStore.trackingEnabled(app) || !PendingPaymentStore.smsEnabled(app)) {
                PipelineLog.event("TRACKING_OFF");
                return;
            }
            PipelineLog.event("SMS_RECEIVED");

            SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
            if (parts == null) return;
            Map<String, StringBuilder> bodies = new LinkedHashMap<>();
            Map<String, Long> sentAt = new LinkedHashMap<>();
            for (SmsMessage part : parts) {
                if (part == null) continue;
                String sender = part.getDisplayOriginatingAddress();
                if (sender == null) continue;
                // A person's message is not even assembled.
                if (!SmsSources.isBusinessSender(sender)) {
                    PipelineLog.event("SMS_SENDER_SKIPPED");
                    continue;
                }
                StringBuilder body = bodies.get(sender);
                if (body == null) {
                    body = new StringBuilder();
                    bodies.put(sender, body);
                    sentAt.put(sender, part.getTimestampMillis());
                }
                body.append(part.getDisplayMessageBody());
            }
            for (Map.Entry<String, StringBuilder> e : bodies.entrySet()) {
                PendingPaymentQueue.Payment payment = SmsIntake.process(app, e.getKey(), e.getValue().toString(), sentAt.get(e.getKey()));
                if (payment != null) UpiNotificationPlugin.notifyPayment(payment);
            }
        } catch (Throwable t) {
            Log.e(TAG, "Failed to process an SMS: " + t.getClass().getSimpleName());
        }
    }
}
