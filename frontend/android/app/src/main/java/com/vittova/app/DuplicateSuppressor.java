package com.vittova.app;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Remembers recently seen transactions so one payment is recorded once.
 *
 * Android reposts a notification whenever the posting app updates it
 * ("Paying..." then "Paid"), and a single UPI transfer is often announced by
 * both the payment app and the bank. Both produce the same kind, amount and
 * payee within seconds.
 *
 * Free of Android dependencies so it can be unit-tested on the JVM. Thread
 * safe: onNotificationPosted is not guaranteed to run on one thread.
 */
final class DuplicateSuppressor {

    private final int maxEntries;
    private final Map<String, Long> recent;

    DuplicateSuppressor(int maxEntries) {
        this.maxEntries = maxEntries;
        this.recent = new LinkedHashMap<String, Long>(maxEntries + 1, 0.75f, false) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, Long> eldest) {
                return size() > DuplicateSuppressor.this.maxEntries;
            }
        };
    }

    /**
     * @return true if this transaction was already seen within the dedupe
     *         window; otherwise records it and returns false.
     */
    synchronized boolean isDuplicate(PaymentNotificationParser.Result result, long postTimeMs) {
        String[] keys = PaymentNotificationParser.fingerprintsFor(
            result.kind, result.amount, result.merchant, postTimeMs);

        long cutoff = postTimeMs - (2 * PaymentNotificationParser.DEDUPE_WINDOW_MS);
        recent.values().removeIf(seenAt -> seenAt < cutoff);

        for (String key : keys) {
            if (recent.containsKey(key)) return true;
        }
        recent.put(keys[0], postTimeMs);
        return false;
    }
}
