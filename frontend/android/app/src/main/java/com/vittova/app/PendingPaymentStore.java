package com.vittova.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Persists {@link PendingPaymentQueue} in app-private SharedPreferences, so a
 * payment detected while Vittova is closed is still there when the user opens
 * the app.
 *
 * Private to the app sandbox and excluded from cloud backup and device
 * transfer by res/xml/backup_rules.xml and data_extraction_rules.xml.
 */
final class PendingPaymentStore {

    private static final String TAG = "SpendlyQueue";
    private static final String PREFS = "spendly_pending_payments";
    private static final String KEY = "queue_v1";
    private static final Object LOCK = new Object();

    private PendingPaymentStore() { }

    static boolean add(Context context, PendingPaymentQueue.Entry entry) {
        synchronized (LOCK) {
            List<PendingPaymentQueue.Entry> entries = read(context);
            boolean added = PendingPaymentQueue.add(entries, entry, System.currentTimeMillis());
            write(context, entries);
            return added;
        }
    }

    static List<PendingPaymentQueue.Entry> list(Context context) {
        synchronized (LOCK) {
            List<PendingPaymentQueue.Entry> entries = read(context);
            int before = entries.size();
            PendingPaymentQueue.prune(entries, System.currentTimeMillis());
            if (entries.size() != before) write(context, entries);
            return PendingPaymentQueue.copy(entries);
        }
    }

    static boolean remove(Context context, String fingerprint) {
        synchronized (LOCK) {
            List<PendingPaymentQueue.Entry> entries = read(context);
            boolean removed = PendingPaymentQueue.remove(entries, fingerprint);
            if (removed) write(context, entries);
            return removed;
        }
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static List<PendingPaymentQueue.Entry> read(Context context) {
        List<PendingPaymentQueue.Entry> entries = new ArrayList<>();
        String raw = prefs(context).getString(KEY, "[]");
        try {
            JSONArray array = new JSONArray(raw);
            for (int i = 0; i < array.length(); i++) {
                JSONObject o = array.getJSONObject(i);
                entries.add(new PendingPaymentQueue.Entry(
                    o.getString("fingerprint"),
                    o.optString("kind", "EXPENSE"),
                    o.getDouble("amount"),
                    o.optString("merchant", "Unknown"),
                    o.optString("app", ""),
                    o.getLong("timestamp"),
                    o.optBoolean("needsConfirmation", false)
                ));
            }
        } catch (Exception e) {
            // Corrupt data is discarded rather than crashing the listener.
            Log.w(TAG, "Pending payment queue was unreadable and has been reset");
            entries.clear();
        }
        return entries;
    }

    private static void write(Context context, List<PendingPaymentQueue.Entry> entries) {
        JSONArray array = new JSONArray();
        try {
            for (PendingPaymentQueue.Entry e : entries) {
                JSONObject o = new JSONObject();
                o.put("fingerprint", e.fingerprint);
                o.put("kind", e.kind);
                o.put("amount", e.amount);
                o.put("merchant", e.merchant);
                o.put("app", e.app);
                o.put("timestamp", e.timestamp);
                o.put("needsConfirmation", e.needsConfirmation);
                array.put(o);
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not serialise pending payment queue");
            return;
        }
        prefs(context).edit().putString(KEY, array.toString()).apply();
    }
}
