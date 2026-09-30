package com.vittova.app;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;

/**
 * The rules for the on-device list of detected payments. Pure Java (no Android
 * types) so it is unit-tested on the JVM; {@link PendingPaymentStore} persists
 * it in app-private storage.
 *
 * TWO LISTS
 *   queue  detections not yet in the user's account:
 *            PENDING_SYNC  a clear payment; the app uploads it the next time it
 *                          runs with the user signed in
 *            NEEDS_REVIEW  the parser was unsure (several amounts, no payee, a
 *                          large amount); the user confirms or dismisses it
 *   done   payments already uploaded, dismissed or refused, kept for a few days
 *          only so that a repost of the same notification — after the app or
 *          phone restarted — is recognised instead of being added again
 *
 * Only what an expense needs is kept: kind, amount, payee, app, time, the
 * posting app's package and type, and a hash of the UPI reference. The
 * notification text itself is never stored.
 */
final class PendingPaymentQueue {

    /**
     * How long a detection waits to be uploaded or reviewed. Matches the
     * server's limit for automatically detected payments (routes/expenses.js).
     */
    static final long TTL_MS = 30L * 24 * 60 * 60 * 1000;

    /** How long an uploaded/dismissed payment is remembered for duplicate checks. */
    static final long DONE_TTL_MS = 3L * 24 * 60 * 60 * 1000;

    /** Upper bounds so a flood of notifications cannot grow storage without limit. */
    static final int MAX_ENTRIES = 100;
    static final int MAX_DONE = 300;

    /** Same app reposting / updating one notification ("Paying…" then "Paid"). */
    static final long REPOST_WINDOW_MS = 2L * 60 * 1000;

    /** A UPI app and the bank both announcing one payment; bank alerts can lag. */
    static final long ECHO_WINDOW_MS = 10L * 60 * 1000;

    static final String PENDING_SYNC = "PENDING_SYNC";
    static final String NEEDS_REVIEW = "NEEDS_REVIEW";

    /** One detected payment. */
    static final class Payment {
        /** Stable id: 32 hex characters. Also the server's idempotency key. */
        final String id;
        final String kind;
        final double amount;
        final String merchant;
        /** Display name of the posting app, e.g. "GPay". */
        final String app;
        /** Package of the posting app (on the allowlist). */
        final String source;
        /** "UPI_APP" or "BANK_APP". */
        final String sourceType;
        /** SHA-256 of the transaction reference, or "" when the text had none. */
        final String refHash;
        /** When the notification was posted (ms since epoch). */
        final long timestamp;
        /** The parser flagged this as uncertain. */
        final boolean needsConfirmation;

        String status;
        int attempts;
        long lastAttemptAt;
        /** Short machine code of the last upload failure, never a message. */
        String lastError = "";
        /** For done entries: when it left the queue, and how. */
        long resolvedAt;
        String outcome = "";
        /** A bank alert was already matched to this payment as its echo. */
        boolean echoMatched;

        Payment(String id, String kind, double amount, String merchant, String app, String source,
                String sourceType, String refHash, long timestamp, boolean needsConfirmation, String status) {
            this.id = id;
            this.kind = kind;
            this.amount = amount;
            this.merchant = merchant == null ? "Unknown" : merchant;
            this.app = app == null ? "" : app;
            this.source = source == null ? "" : source;
            this.sourceType = sourceType == null ? "UPI_APP" : sourceType;
            this.refHash = refHash == null ? "" : refHash;
            this.timestamp = timestamp;
            this.needsConfirmation = needsConfirmation;
            this.status = status;
        }
    }

    private PendingPaymentQueue() { }

    /** Build a queue entry from a parsed EXPENSE notification. */
    static Payment fromParse(PaymentNotificationParser.Result r, String source, String sourceType, long postTimeMs) {
        String refHash = r.reference == null || r.reference.isEmpty() ? "" : sha256Hex(r.reference).substring(0, 32);
        String id = sha256Hex(r.kind.name() + '|' + String.format(Locale.US, "%.2f", r.amount) + '|'
                + PaymentNotificationParser.normalizeMerchant(r.merchant) + '|' + source + '|' + postTimeMs + '|' + refHash)
                .substring(0, 32);
        return new Payment(id, r.kind.name(), r.amount, r.merchant, r.appName, source, sourceType, refHash,
                postTimeMs, r.needsConfirmation, r.needsConfirmation ? NEEDS_REVIEW : PENDING_SYNC);
    }

    // ── Duplicate detection ─────────────────────────────────────────────────

    /**
     * Is `c` the same payment as one already queued or recently done?
     *
     *   - same id                                    → duplicate
     *   - different kind or amount, or far apart     → different payments
     *   - both carry a transaction reference         → duplicate only if equal
     *                                                  (at any distance in time)
     *   - same app, within 2 minutes                 → a repost if the payee matches
     *   - a UPI app and a bank app, within 10 min    → the bank echoing the UPI
     *                                                  payment (each payment is
     *                                                  matched to one echo only)
     *   - two UPI apps (or two banks)                → duplicate only if the payee matches
     *
     * When unsure the rule prefers missing a duplicate bank echo to recording a
     * payment twice: an unrecorded payment can be added by hand, an invented
     * one corrupts every number in the app.
     */
    static Payment findDuplicate(Payment c, List<Payment> known) {
        for (Payment k : known) {
            if (k == null) continue;
            if (k.id.equals(c.id)) return k;
            if (!k.kind.equals(c.kind)) continue;
            if (Math.abs(k.amount - c.amount) > 0.005) continue;
            long apart = Math.abs(k.timestamp - c.timestamp);

            boolean bothRefs = !k.refHash.isEmpty() && !c.refHash.isEmpty();
            if (bothRefs) {
                // A reference identifies one transaction, however late the repost.
                if (k.refHash.equals(c.refHash)) return k;
                continue;
            }
            boolean samePayee = merchantKey(k).equals(merchantKey(c));
            if (k.source.equals(c.source)) {
                if (apart <= REPOST_WINDOW_MS && samePayee) return k;
                continue;
            }
            if (apart > ECHO_WINDOW_MS) continue;
            if (!k.sourceType.equals(c.sourceType)) {
                if (!k.echoMatched) return k;
                continue;
            }
            if (samePayee) return k;
        }
        return null;
    }

    private static String merchantKey(Payment p) {
        return PaymentNotificationParser.normalizeMerchant(p.merchant);
    }

    // ── Queue maintenance ───────────────────────────────────────────────────

    /** Drop expired detections and forgotten done entries. */
    static void prune(List<Payment> queue, List<Payment> done, long nowMs) {
        Iterator<Payment> it = queue.iterator();
        while (it.hasNext()) {
            Payment p = it.next();
            if (p == null || nowMs - p.timestamp > TTL_MS) it.remove();
        }
        Iterator<Payment> d = done.iterator();
        while (d.hasNext()) {
            Payment p = d.next();
            if (p == null || nowMs - Math.max(p.timestamp, p.resolvedAt) > DONE_TTL_MS) d.remove();
        }
        while (done.size() > MAX_DONE) done.remove(0);
    }

    /** Result of {@link #add}. */
    enum AddResult { ADDED, DUPLICATE, INVALID }

    /**
     * Queue a detection unless it duplicates a queued or recently done payment.
     * When full, the oldest entry makes room.
     */
    static AddResult add(List<Payment> queue, List<Payment> done, Payment p, long nowMs) {
        if (p == null || p.id == null || p.id.isEmpty() || !(p.amount > 0)) return AddResult.INVALID;
        prune(queue, done, nowMs);
        List<Payment> known = new ArrayList<>(queue);
        known.addAll(done);
        Payment dup = findDuplicate(p, known);
        if (dup != null) {
            if (!dup.sourceType.equals(p.sourceType) && !dup.source.equals(p.source)) dup.echoMatched = true;
            return AddResult.DUPLICATE;
        }
        queue.add(p);
        while (queue.size() > MAX_ENTRIES) queue.remove(0);
        return AddResult.ADDED;
    }

    /**
     * Move a detection out of the queue into the done list.
     *
     * @param outcome "synced", "dismissed" or "rejected"
     * @return true if an entry with this id was queued
     */
    static boolean resolve(List<Payment> queue, List<Payment> done, String id, String outcome, long nowMs) {
        if (id == null) return false;
        Iterator<Payment> it = queue.iterator();
        while (it.hasNext()) {
            Payment p = it.next();
            if (id.equals(p.id)) {
                it.remove();
                p.resolvedAt = nowMs;
                p.outcome = outcome == null ? "" : outcome;
                done.add(p);
                while (done.size() > MAX_DONE) done.remove(0);
                return true;
            }
        }
        return false;
    }

    /** Record a failed upload attempt (short code only). */
    static boolean markAttempt(List<Payment> queue, String id, String errorCode, long nowMs) {
        for (Payment p : queue) {
            if (p.id.equals(id)) {
                p.attempts++;
                p.lastAttemptAt = nowMs;
                String code = errorCode == null ? "" : errorCode.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_]", "");
                p.lastError = code.length() > 40 ? code.substring(0, 40) : code;
                return true;
            }
        }
        return false;
    }

    /** Move a detection to NEEDS_REVIEW (e.g. the server refused it as automatic). */
    static boolean markForReview(List<Payment> queue, String id) {
        for (Payment p : queue) {
            if (p.id.equals(id)) {
                p.status = NEEDS_REVIEW;
                return true;
            }
        }
        return false;
    }

    // ── Account binding ─────────────────────────────────────────────────────

    /** What to do with stored detections when `current` signs in. */
    enum OwnerAction {
        /** Same account as before: keep and upload. */
        KEEP,
        /** No account recorded yet on this install: they belong to this one. */
        CLAIM,
        /** Detections were captured for a different account: discard them. */
        CLEAR
    }

    static OwnerAction ownerAction(String stored, String current) {
        if (stored == null || stored.isEmpty()) return OwnerAction.CLAIM;
        return stored.equals(current) ? OwnerAction.KEEP : OwnerAction.CLEAR;
    }

    static List<Payment> copy(List<Payment> entries) {
        return new ArrayList<>(entries);
    }

    static String sha256Hex(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] h = md.digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(h.length * 2);
            for (byte b : h) sb.append(String.format(Locale.US, "%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
