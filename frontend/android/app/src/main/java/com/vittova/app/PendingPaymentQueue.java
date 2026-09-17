package com.vittova.app;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

/**
 * The rules for the on-device queue of detected payments awaiting the user's
 * decision. Pure Java (no Android types) so it is unit-tested on the JVM;
 * {@link PendingPaymentStore} persists it.
 *
 * Only the minimum needed to show a confirmation is kept: kind, amount, payee,
 * app name, time, a fingerprint and the confirmation flag. The notification
 * text itself is never stored.
 */
final class PendingPaymentQueue {

    /** How long an unconfirmed detection is kept before it is discarded. */
    static final long TTL_MS = 7L * 24 * 60 * 60 * 1000;

    /** Upper bound so a flood of notifications cannot grow storage without limit. */
    static final int MAX_ENTRIES = 50;

    static final class Entry {
        final String fingerprint;
        final String kind;
        final double amount;
        final String merchant;
        final String app;
        final long timestamp;
        final boolean needsConfirmation;

        Entry(String fingerprint, String kind, double amount, String merchant,
              String app, long timestamp, boolean needsConfirmation) {
            this.fingerprint = fingerprint;
            this.kind = kind;
            this.amount = amount;
            this.merchant = merchant;
            this.app = app;
            this.timestamp = timestamp;
            this.needsConfirmation = needsConfirmation;
        }
    }

    private PendingPaymentQueue() { }

    /** Drop expired entries. */
    static void prune(List<Entry> entries, long nowMs) {
        Iterator<Entry> it = entries.iterator();
        while (it.hasNext()) {
            Entry e = it.next();
            if (e == null || nowMs - e.timestamp > TTL_MS) it.remove();
        }
    }

    /**
     * Add a detection unless the same fingerprint is already queued.
     * When full, the oldest entry makes room.
     *
     * @return true if the entry was added
     */
    static boolean add(List<Entry> entries, Entry entry, long nowMs) {
        if (entry == null || entry.fingerprint == null || entry.fingerprint.isEmpty()) return false;
        prune(entries, nowMs);
        for (Entry e : entries) {
            if (e.fingerprint.equals(entry.fingerprint)) return false;
        }
        entries.add(entry);
        while (entries.size() > MAX_ENTRIES) entries.remove(0);
        return true;
    }

    /** @return true if an entry with this fingerprint was removed */
    static boolean remove(List<Entry> entries, String fingerprint) {
        if (fingerprint == null) return false;
        Iterator<Entry> it = entries.iterator();
        while (it.hasNext()) {
            if (fingerprint.equals(it.next().fingerprint)) {
                it.remove();
                return true;
            }
        }
        return false;
    }

    static List<Entry> copy(List<Entry> entries) {
        return new ArrayList<>(entries);
    }
}
