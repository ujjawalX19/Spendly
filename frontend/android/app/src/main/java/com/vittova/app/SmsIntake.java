package com.vittova.app;

import android.content.ContentResolver;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.Telephony;
import android.util.Log;

import androidx.core.content.ContextCompat;

import android.Manifest;

/**
 * SmsIntake — turns bank debit SMS into queued payments. Used by
 * {@link SmsPaymentReceiver} for each message as it arrives (also while
 * Vittova is closed) and by {@link #scanInbox} to catch up on any the receiver
 * missed (the app was force-stopped, or the phone was still locked after a
 * restart).
 *
 * For every message, in order:
 *   1. the sender must be a business sender ID ({@link SmsSources}); a
 *      message from a person is dropped here, its text never read
 *   2. parse: only a completed debit (EXPENSE) continues — credits, OTPs,
 *      offers, mandates and failures stop here
 *   3. the same durable queue and duplicate rules as payment-app notifications
 *
 * PRIVACY: the SMS text is never stored, logged or uploaded. Only the parsed
 * amount, payee, bank name, time and a hash of the transaction reference are
 * queued on the phone.
 */
final class SmsIntake {

    private static final String TAG = "SpendlyNLS";
    /** Upper bound for one catch-up, so a flood of messages cannot stall the app. */
    private static final int MAX_SCAN = 300;

    private SmsIntake() { }

    /** @return the queued payment, or null when the message is not a new debit. */
    static PendingPaymentQueue.Payment process(Context context, String sender, String body, long sentAtMs) {
        if (!SmsSources.isBusinessSender(sender)) {
            PipelineLog.event("SMS_SENDER_SKIPPED");
            return null;
        }
        PipelineLog.event("SMS_SENDER_ALLOWED");
        PaymentNotificationParser.Result r = PaymentNotificationParser.parseSms(sender, body, sentAtMs);
        if (r.kind == PaymentNotificationParser.Kind.UNKNOWN) {
            PipelineLog.event("PARSE_FAILED");
            return null;
        }
        if (r.kind != PaymentNotificationParser.Kind.EXPENSE) {
            PipelineLog.event("PARSE_NOT_EXPENSE");
            return null;
        }
        PipelineLog.event("PARSE_SUCCESS");
        PendingPaymentQueue.Payment payment =
            PendingPaymentQueue.fromParse(r, SmsSources.sourceKey(sender), "BANK_SMS", sentAtMs);
        PendingPaymentQueue.AddResult added = PendingPaymentStore.add(context, payment);
        if (added == PendingPaymentQueue.AddResult.DUPLICATE) {
            PipelineLog.event("DUPLICATE_IGNORED");
            return null;
        }
        if (added != PendingPaymentQueue.AddResult.ADDED) {
            PipelineLog.event("LOCAL_PERSIST_FAILED");
            return null;
        }
        PipelineLog.event("LOCAL_PERSIST_SUCCESS");
        PipelineLog.event(PendingPaymentQueue.NEEDS_REVIEW.equals(payment.status) ? "NEEDS_REVIEW" : "SYNC_QUEUED");
        return payment;
    }

    /**
     * Built-in example messages for "See how it works": what a user (or a Play
     * reviewer without an Indian bank account) sees the real rules do, without
     * reading any SMS or needing the permission. {sender, body} pairs.
     */
    static final String[][] SAMPLES = {
        { "VM-HDFCBK", "Sent Rs.250.00\nFrom HDFC Bank A/C *1234\nTo SWIGGY\nOn 29/09/26\nRef 412345678901\nNot You? Call 18002586161/SMS BLOCK UPI to 7308080808" },
        { "AX-SBIUPI", "Dear UPI user A/C X1234 debited by 120.0 on date 29Sep26 trf to TEA STALL Refno 512345678901. If not u? call 1800111109. -SBI" },
        { "VM-ICICIB", "123456 is the OTP for your transaction of INR 999.00 at AMAZON. Valid for 5 mins. Do not share it with anyone. -ICICI Bank" },
        { "+919876543210", "Hey, I paid Rs.500 for dinner, send me your share" },
    };

    /**
     * What {@link #process} would decide for a message, without queuing
     * anything: "debit" (amount, payee, bank filled in), "skipped" (read, not a
     * completed debit) or "not_read" (a person: the text is never read).
     */
    static String[] preview(String sender, String body, long sentAtMs) {
        if (!SmsSources.isBusinessSender(sender)) return new String[] { "not_read", "", "", "" };
        PaymentNotificationParser.Result r = PaymentNotificationParser.parseSms(sender, body, sentAtMs);
        if (r.kind != PaymentNotificationParser.Kind.EXPENSE) return new String[] { "skipped", "", "", "" };
        return new String[] { "debit", String.valueOf(r.amount), r.merchant, SmsSources.bankName(sender) };
    }

    static boolean smsGranted(Context context) {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED
            && ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED;
    }

    /**
     * Read inbox messages received since the last catch-up (never from before
     * SMS access was granted). The body is fetched only for business senders.
     *
     * @return how many new payments were queued
     */
    static int scanInbox(Context context) {
        if (!smsGranted(context) || !PendingPaymentStore.trackingEnabled(context) || !PendingPaymentStore.smsEnabled(context)) {
            return 0;
        }
        long from = PendingPaymentStore.smsScanFrom(context);
        if (from <= 0L) return 0;

        ContentResolver resolver = context.getContentResolver();
        Uri inbox = Telephony.Sms.Inbox.CONTENT_URI;
        String[] listProjection = { Telephony.Sms._ID, Telephony.Sms.ADDRESS, Telephony.Sms.DATE, Telephony.Sms.DATE_SENT };
        int added = 0;
        int seen = 0;
        long newest = from;
        try (Cursor c = resolver.query(inbox, listProjection, Telephony.Sms.DATE + " > ?",
                new String[] { String.valueOf(from) }, Telephony.Sms.DATE + " ASC")) {
            if (c == null) return 0;
            while (c.moveToNext() && seen < MAX_SCAN) {
                seen++;
                long id = c.getLong(0);
                String sender = c.getString(1);
                long receivedAt = c.getLong(2);
                long sentAt = c.getLong(3);
                newest = Math.max(newest, receivedAt);
                if (!SmsSources.isBusinessSender(sender)) continue; // a person: body never fetched
                String body = readBody(resolver, inbox, id);
                if (body == null) continue;
                // The receiver dates a message by when the bank sent it; use the
                // same here so a message seen both ways has one id.
                if (process(context, sender, body, sentAt > 0 ? sentAt : receivedAt) != null) added++;
            }
        } catch (SecurityException e) {
            Log.w(TAG, "SMS access was withdrawn");
            return added;
        } catch (Exception e) {
            Log.w(TAG, "SMS catch-up failed: " + e.getClass().getSimpleName());
            return added;
        }
        PendingPaymentStore.setSmsLastScan(context, newest);
        return added;
    }

    private static String readBody(ContentResolver resolver, Uri inbox, long id) {
        try (Cursor c = resolver.query(inbox, new String[] { Telephony.Sms.BODY }, Telephony.Sms._ID + " = ?",
                new String[] { String.valueOf(id) }, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception e) {
            // unreadable: skip it
        }
        return null;
    }
}
