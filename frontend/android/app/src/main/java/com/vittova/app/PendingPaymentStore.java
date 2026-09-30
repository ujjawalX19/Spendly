package com.vittova.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Durable on-device storage for payment tracking, in app-private
 * SharedPreferences. Survives the app being closed or swiped away, the process
 * being killed and the phone restarting. Excluded from cloud backup and device
 * transfer by res/xml/backup_rules.xml and data_extraction_rules.xml.
 *
 * Every write uses commit(), not apply(): the notification listener can be
 * killed right after it returns, and a detection must be on disk by then.
 *
 * Holds:
 *   queue_v2   detections waiting to be uploaded or reviewed ({@link PendingPaymentQueue})
 *   done_v2    recently uploaded/dismissed payments, for duplicate checks only
 *   tracking   "off" when the user turned payment tracking off in Vittova
 *              (absent = on: tracking is on by default, but only works once
 *              Android Notification Access is granted)
 *   owner      the Vittova account the stored detections belong to
 *   listener_* whether Android currently has the listener connected
 */
final class PendingPaymentStore {

    private static final String TAG = "SpendlyQueue";
    private static final String PREFS = "spendly_pending_payments";
    private static final String QUEUE = "queue_v2";
    private static final String DONE = "done_v2";
    private static final String LEGACY_QUEUE = "queue_v1";
    private static final String TRACKING = "tracking";
    private static final String OWNER = "owner";
    private static final String LISTENER_CONNECTED = "listener_connected";
    private static final String LISTENER_CHANGED_AT = "listener_changed_at";
    private static final String SMS = "sms";                 // "off" when the user turned bank SMS off
    private static final String SMS_SINCE = "sms_since";     // when SMS access was first granted
    private static final String SMS_LAST_SCAN = "sms_last_scan";
    private static final Object LOCK = new Object();

    private PendingPaymentStore() { }

    // ── Detections ──────────────────────────────────────────────────────────

    static PendingPaymentQueue.AddResult add(Context context, PendingPaymentQueue.Payment payment) {
        synchronized (LOCK) {
            List<PendingPaymentQueue.Payment> queue = readQueue(context);
            List<PendingPaymentQueue.Payment> done = read(context, DONE);
            PendingPaymentQueue.AddResult result = PendingPaymentQueue.add(queue, done, payment, System.currentTimeMillis());
            // A duplicate can still change state (an echo was matched), so always persist.
            if (!write(context, queue, done)) return PendingPaymentQueue.AddResult.INVALID;
            return result;
        }
    }

    static List<PendingPaymentQueue.Payment> list(Context context) {
        synchronized (LOCK) {
            List<PendingPaymentQueue.Payment> queue = readQueue(context);
            List<PendingPaymentQueue.Payment> done = read(context, DONE);
            int before = queue.size() + done.size();
            PendingPaymentQueue.prune(queue, done, System.currentTimeMillis());
            if (queue.size() + done.size() != before) write(context, queue, done);
            return PendingPaymentQueue.copy(queue);
        }
    }

    /** @param outcome "synced", "dismissed" or "rejected" */
    static boolean resolve(Context context, String id, String outcome) {
        synchronized (LOCK) {
            List<PendingPaymentQueue.Payment> queue = readQueue(context);
            List<PendingPaymentQueue.Payment> done = read(context, DONE);
            boolean changed = PendingPaymentQueue.resolve(queue, done, id, outcome, System.currentTimeMillis());
            if (changed) write(context, queue, done);
            return changed;
        }
    }

    static boolean markAttempt(Context context, String id, String errorCode) {
        synchronized (LOCK) {
            List<PendingPaymentQueue.Payment> queue = readQueue(context);
            boolean changed = PendingPaymentQueue.markAttempt(queue, id, errorCode, System.currentTimeMillis());
            if (changed) write(context, queue, read(context, DONE));
            return changed;
        }
    }

    static boolean markForReview(Context context, String id) {
        synchronized (LOCK) {
            List<PendingPaymentQueue.Payment> queue = readQueue(context);
            boolean changed = PendingPaymentQueue.markForReview(queue, id);
            if (changed) write(context, queue, read(context, DONE));
            return changed;
        }
    }

    /**
     * Tie stored detections to the account that is signing in. Detections
     * captured for a different account are discarded, never uploaded.
     *
     * @return "keep", "claim" or "clear"
     */
    static String bindOwner(Context context, String userId) {
        synchronized (LOCK) {
            SharedPreferences prefs = prefs(context);
            PendingPaymentQueue.OwnerAction action = PendingPaymentQueue.ownerAction(prefs.getString(OWNER, null), userId);
            SharedPreferences.Editor e = prefs.edit();
            if (action == PendingPaymentQueue.OwnerAction.CLEAR) e.remove(QUEUE).remove(DONE).remove(LEGACY_QUEUE);
            e.putString(OWNER, userId).commit();
            return action.name().toLowerCase(Locale.ROOT);
        }
    }

    /** Account deleted: forget every detection and the owner. Settings are kept. */
    static void clearAll(Context context) {
        synchronized (LOCK) {
            prefs(context).edit().remove(QUEUE).remove(DONE).remove(LEGACY_QUEUE).remove(OWNER).commit();
        }
    }

    // ── Settings and listener health ────────────────────────────────────────

    /** Payment tracking is on unless the user turned it off in Vittova. */
    static boolean trackingEnabled(Context context) {
        return !"off".equals(prefs(context).getString(TRACKING, "on"));
    }

    static void setTrackingEnabled(Context context, boolean enabled) {
        prefs(context).edit().putString(TRACKING, enabled ? "on" : "off").commit();
    }

    static void setListenerConnected(Context context, boolean connected) {
        prefs(context).edit()
            .putBoolean(LISTENER_CONNECTED, connected)
            .putLong(LISTENER_CHANGED_AT, System.currentTimeMillis())
            .commit();
    }

    static boolean listenerConnected(Context context) {
        return prefs(context).getBoolean(LISTENER_CONNECTED, false);
    }

    static long listenerChangedAt(Context context) {
        return prefs(context).getLong(LISTENER_CHANGED_AT, 0L);
    }

    // ── Bank SMS ────────────────────────────────────────────────────────────

    /** Reading bank SMS is on unless the user turned it off in Vittova. */
    static boolean smsEnabled(Context context) {
        return !"off".equals(prefs(context).getString(SMS, "on"));
    }

    static void setSmsEnabled(Context context, boolean enabled) {
        prefs(context).edit().putString(SMS, enabled ? "on" : "off").commit();
    }

    /**
     * Android granted SMS access. Tracking starts from this moment: Vittova
     * never imports messages from before the user allowed it.
     */
    static void markSmsGranted(Context context, long nowMs) {
        synchronized (LOCK) {
            SharedPreferences prefs = prefs(context);
            if (prefs.getLong(SMS_SINCE, 0L) == 0L) {
                prefs.edit().putLong(SMS_SINCE, nowMs).putLong(SMS_LAST_SCAN, nowMs).commit();
            }
        }
    }

    /** Start of the inbox catch-up: after the last message read, never before access was granted. */
    static long smsScanFrom(Context context) {
        SharedPreferences prefs = prefs(context);
        long since = prefs.getLong(SMS_SINCE, 0L);
        if (since == 0L) return 0L;
        return Math.max(since, prefs.getLong(SMS_LAST_SCAN, since));
    }

    static void setSmsLastScan(Context context, long receivedAtMs) {
        synchronized (LOCK) {
            SharedPreferences prefs = prefs(context);
            if (receivedAtMs > prefs.getLong(SMS_LAST_SCAN, 0L)) {
                prefs.edit().putLong(SMS_LAST_SCAN, receivedAtMs).commit();
            }
        }
    }

    // ── Serialisation ───────────────────────────────────────────────────────

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static List<PendingPaymentQueue.Payment> read(Context context, String key) {
        try {
            return PaymentJson.read(prefs(context).getString(key, "[]"));
        } catch (Exception e) {
            // Corrupt data is discarded rather than crashing the listener.
            Log.w(TAG, "Stored payment list was unreadable and has been reset");
            return new ArrayList<>();
        }
    }

    /** The queue, first moving anything saved by an older version into it. */
    private static List<PendingPaymentQueue.Payment> readQueue(Context context) {
        List<PendingPaymentQueue.Payment> queue = read(context, QUEUE);
        SharedPreferences prefs = prefs(context);
        if (!prefs.contains(LEGACY_QUEUE)) return queue;
        try {
            queue.addAll(PaymentJson.readLegacy(prefs.getString(LEGACY_QUEUE, "[]")));
        } catch (Exception e) {
            Log.w(TAG, "Old payment queue was unreadable and has been discarded");
        }
        try {
            // Save the migrated entries and drop the old key in one commit.
            prefs.edit().putString(QUEUE, PaymentJson.write(queue)).remove(LEGACY_QUEUE).commit();
        } catch (Exception e) {
            Log.w(TAG, "Could not migrate the old payment queue");
        }
        return queue;
    }

    private static boolean write(Context context, List<PendingPaymentQueue.Payment> queue,
                                 List<PendingPaymentQueue.Payment> done) {
        try {
            return prefs(context).edit()
                .putString(QUEUE, PaymentJson.write(queue))
                .putString(DONE, PaymentJson.write(done))
                .commit();
        } catch (Exception e) {
            Log.w(TAG, "Could not save payment tracking data");
            return false;
        }
    }
}
