package com.vittova.app;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * JSON form of {@link PendingPaymentQueue.Payment} lists, as stored by
 * {@link PendingPaymentStore}. Free of Android types so a write → read round
 * trip (what happens when the process is killed and recreated) is unit-tested.
 */
final class PaymentJson {

    private PaymentJson() { }

    static String write(List<PendingPaymentQueue.Payment> payments) throws Exception {
        JSONArray array = new JSONArray();
        for (PendingPaymentQueue.Payment p : payments) array.put(toJson(p));
        return array.toString();
    }

    /** @throws Exception when the text is not a valid list (callers reset it). */
    static List<PendingPaymentQueue.Payment> read(String json) throws Exception {
        List<PendingPaymentQueue.Payment> out = new ArrayList<>();
        JSONArray array = new JSONArray(json == null ? "[]" : json);
        for (int i = 0; i < array.length(); i++) out.add(fromJson(array.getJSONObject(i)));
        return out;
    }

    /**
     * Detections saved by versions before 1.1 ({ fingerprint, kind, amount,
     * merchant, app, timestamp, needsConfirmation }) were captured under "ask
     * before adding". They are never uploaded automatically: each one goes to
     * review. Income and refunds are dropped: they are not expenses.
     */
    static List<PendingPaymentQueue.Payment> readLegacy(String json) throws Exception {
        List<PendingPaymentQueue.Payment> out = new ArrayList<>();
        JSONArray array = new JSONArray(json == null ? "[]" : json);
        for (int i = 0; i < array.length(); i++) {
            JSONObject o = array.getJSONObject(i);
            if (!"EXPENSE".equals(o.optString("kind", "EXPENSE"))) continue;
            out.add(new PendingPaymentQueue.Payment(
                PendingPaymentQueue.sha256Hex("legacy|" + o.getString("fingerprint")).substring(0, 32), "EXPENSE",
                o.getDouble("amount"), o.optString("merchant", "Unknown"), o.optString("app", ""),
                o.optString("app", ""), "UPI_APP", "", o.getLong("timestamp"), true,
                PendingPaymentQueue.NEEDS_REVIEW));
        }
        return out;
    }

    private static PendingPaymentQueue.Payment fromJson(JSONObject o) throws Exception {
        PendingPaymentQueue.Payment p = new PendingPaymentQueue.Payment(
            o.getString("id"), o.optString("kind", "EXPENSE"), o.getDouble("amount"),
            o.optString("merchant", "Unknown"), o.optString("app", ""), o.optString("source", ""),
            o.optString("sourceType", "UPI_APP"), o.optString("refHash", ""), o.getLong("timestamp"),
            o.optBoolean("needsConfirmation", false),
            o.optString("status", PendingPaymentQueue.PENDING_SYNC));
        p.attempts = o.optInt("attempts", 0);
        p.lastAttemptAt = o.optLong("lastAttemptAt", 0L);
        p.lastError = o.optString("lastError", "");
        p.resolvedAt = o.optLong("resolvedAt", 0L);
        p.outcome = o.optString("outcome", "");
        p.echoMatched = o.optBoolean("echoMatched", false);
        return p;
    }

    private static JSONObject toJson(PendingPaymentQueue.Payment p) throws Exception {
        JSONObject o = new JSONObject();
        o.put("id", p.id);
        o.put("kind", p.kind);
        o.put("amount", p.amount);
        o.put("merchant", p.merchant);
        o.put("app", p.app);
        o.put("source", p.source);
        o.put("sourceType", p.sourceType);
        o.put("refHash", p.refHash);
        o.put("timestamp", p.timestamp);
        o.put("needsConfirmation", p.needsConfirmation);
        o.put("status", p.status);
        o.put("attempts", p.attempts);
        o.put("lastAttemptAt", p.lastAttemptAt);
        o.put("lastError", p.lastError);
        o.put("resolvedAt", p.resolvedAt);
        o.put("outcome", p.outcome);
        o.put("echoMatched", p.echoMatched);
        return o;
    }
}
