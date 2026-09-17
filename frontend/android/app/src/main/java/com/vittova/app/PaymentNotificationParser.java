package com.vittova.app;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * PaymentNotificationParser — turns a payment app's notification text into a
 * structured transaction, or refuses to.
 *
 * Deliberately free of Android imports so it can be unit-tested on the JVM.
 * Everything here is a pure function of its inputs.
 *
 * WHY THIS IS CAREFUL
 * -------------------
 * A notification listener sees every notification a payment app posts, and
 * most of them are not transactions. Getting this wrong costs the user
 * real trust: the previous implementation matched any rupee amount in any
 * notification from five apps and logged it as an expense, which meant
 *
 *   - "₹500 received from Rahul"        became a ₹500 expense
 *   - "Get ₹200 cashback this weekend"  became a ₹200 expense
 *   - "Payment of ₹250 failed"          became a ₹250 expense
 *   - "Available balance ₹12,340"       became a ₹12,340 expense
 *   - the same payment reposted by the  became two or three expenses
 *     app as it updated its notification
 *
 * The rule adopted here: when the text does not clearly say money left the
 * user's account, do not create an expense. An unrecorded transaction is a
 * small annoyance; an invented one corrupts every number in the app.
 */
public final class PaymentNotificationParser {

    private PaymentNotificationParser() { }

    /** What a notification turned out to be. */
    public enum Kind {
        /** Money left the user's account. Safe to record as an expense. */
        EXPENSE,
        /** Money arrived. Recorded as income, never as spending. */
        INCOME,
        /** A reversal or cashback returning money. */
        REFUND,
        /** The transaction did not go through. Never recorded. */
        FAILED,
        /** Not a transaction, or too ambiguous to classify. Never recorded. */
        UNKNOWN
    }

    /** The outcome of parsing one notification. */
    public static final class Result {
        public final Kind kind;
        /** Rupees. 0 when no trustworthy amount was found. */
        public final double amount;
        /** Best-effort counterparty, or "Unknown". */
        public final String merchant;
        /** Human-readable source app, e.g. "GPay". */
        public final String appName;
        /** Stable key for duplicate suppression. Empty when kind is UNKNOWN. */
        public final String fingerprint;
        /**
         * True when the classification is plausible but not certain. The UI
         * must ask the user before recording anything flagged this way.
         */
        public final boolean needsConfirmation;
        /** Why this was classified as it was — for the confirmation prompt and tests. */
        public final String reason;

        Result(Kind kind, double amount, String merchant, String appName,
               String fingerprint, boolean needsConfirmation, String reason) {
            this.kind = kind;
            this.amount = amount;
            this.merchant = merchant;
            this.appName = appName;
            this.fingerprint = fingerprint;
            this.needsConfirmation = needsConfirmation;
            this.reason = reason;
        }

        /** True when this should become a row in the user's ledger. */
        public boolean isRecordable() {
            return kind == Kind.EXPENSE || kind == Kind.INCOME || kind == Kind.REFUND;
        }

        @Override
        public String toString() {
            return "Result{" + kind + " amount=" + amount + " merchant='" + merchant
                    + "' confirm=" + needsConfirmation + " reason='" + reason + "'}";
        }
    }

    // ── Supported sources ───────────────────────────────────────────────────
    // A strict allowlist of payment and banking apps. Notifications from any
    // other package are ignored before their text is read — in particular
    // messaging (WhatsApp, Telegram, SMS), email, social and shopping apps,
    // where people routinely write "I paid ₹500" in conversation.
    //
    // MUST match frontend/src/lib/supportedPaymentApps.js, which is what the
    // onboarding screen and privacy policy show users. A frontend test fails
    // if the two lists differ. Package ids must be verified against the Play
    // Store listing before adding a new entry.

    private static final String[][] KNOWN_PACKAGES = {
        // UPI apps
        { "com.google.android.apps.nbu.paisa.user", "GPay" },
        { "com.phonepe.app",                        "PhonePe" },
        { "net.one97.paytm",                        "Paytm" },
        { "in.org.npci.upiapp",                     "BHIM" },
        { "com.sbi.SBIFreedomPlus",                 "BHIM SBI Pay" },
        { "com.dreamplug.androidapp",               "CRED" },
        { "money.super.payments",                   "super.money" },
        { "com.mobikwik_new",                       "MobiKwik" },
        { "com.freecharge.android",                 "Freecharge" },
        { "com.fampay.in",                          "FamPay" },
        // Bank apps
        { "com.snapwork.hdfc",                      "HDFC Bank" },
        { "com.csam.icici.bank.imobile",            "ICICI Bank" },
        { "com.sbi.lotusintouch",                   "SBI YONO" },
        { "com.msf.kbank.mobile",                   "Kotak" },
        { "com.axis.mobile",                        "Axis Bank" },
        { "com.bankofbaroda.mconnect",              "Bank of Baroda" },
        { "com.infrasoft.uboi",                     "Union Bank" },
        { "com.fss.pnbpsp",                         "PNB" },
        { "com.canarabank.mobility",                "Canara Bank" },
        { "com.indusind.indusmobile",               "IndusInd Bank" },
        { "com.idfcfirstbank.optimus",              "IDFC FIRST Bank" },
    };

    /** Human-readable name for a package, or null when the app is not supported. */
    public static String appNameFor(String packageName) {
        if (packageName == null) return null;
        for (String[] row : KNOWN_PACKAGES) {
            if (row[0].equals(packageName)) return row[1];
        }
        return null;
    }

    public static boolean isSupportedPackage(String packageName) {
        return appNameFor(packageName) != null;
    }

    // ── Amounts ─────────────────────────────────────────────────────────────
    // Matches ₹50, Rs.1,200, Rs 1,00,000.50, INR 500. Indian digit grouping
    // (1,00,000) and plain grouping (100,000) both work.

    private static final Pattern AMOUNT_PATTERN = Pattern.compile(
        "(?:₹|rs\\.?|inr)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)",
        Pattern.CASE_INSENSITIVE
    );

    /**
     * Words that, immediately before an amount, mean it is NOT the transaction
     * value — a balance, a limit, a reward. Checked against the ~28 characters
     * preceding the match.
     */
    private static final List<String> AMOUNT_DISQUALIFIERS = Arrays.asList(
        "balance", "bal", "avl", "available", "limit", "due", "outstanding",
        "cashback of up to", "up to", "upto", "save", "off on", "worth"
    );

    // ── Intent keywords ─────────────────────────────────────────────────────
    // Ordered longest-first within each group so that a specific phrase wins
    // over a substring of it.

    private static final List<String> FAILED_WORDS = Arrays.asList(
        "could not be completed", "was not completed", "did not go through",
        "has failed", "payment failed", "transaction failed", "transfer failed",
        "unsuccessful", "declined", "failed", "cancelled", "canceled",
        "insufficient balance", "insufficient funds", "timed out", "expired"
    );

    private static final List<String> REFUND_WORDS = Arrays.asList(
        "refunded", "refund of", "refund", "cashback of", "cashback received",
        "reversed", "reversal", "money returned", "returned to your"
    );

    private static final List<String> INCOME_WORDS = Arrays.asList(
        "received from", "you received", "has been credited", "is credited",
        "credited to your", "credited", "money added", "added to your wallet",
        "received", "deposited"
    );

    private static final List<String> EXPENSE_WORDS = Arrays.asList(
        "you have paid", "you paid", "payment of", "paid to", "sent to",
        "has been debited", "is debited", "debited from", "debited",
        "successfully paid", "money sent", "you sent", "withdrawn", "spent",
        "purchase of", "paid", "sent"
    );

    /**
     * Phrases that mean the notification is not a completed transaction at all:
     * requests, reminders, offers, and marketing. These are checked before
     * anything else because they routinely contain both an amount and a verb.
     *
     * Balance wording is deliberately NOT in this list. Indian bank debit
     * alerts almost always append the running balance —
     * "Rs.250 debited from A/c XX1234 to SWIGGY. Avl Bal Rs.12,340.55" — so
     * rejecting on "avl bal" would throw away most real transactions. A
     * balance-only notification has no payment verb and already falls through
     * to UNKNOWN, while the trailing balance figure is excluded from the
     * amount by {@link #AMOUNT_DISQUALIFIERS}.
     */
    private static final List<String> NON_TRANSACTION_WORDS = Arrays.asList(
        "is requesting", "has requested", "requested money", "payment request",
        "requesting", "collect request", "reminder", "remind",
        "scratch card", "cashback of up to", "assured", "win", "won",
        "offer", "offers", "voucher", "coupon", "reward points", "get flat", "flat",
        "sign up", "refer", "referral", "invite", "lucky", "congratulations",
        "statement is ready", "bill is due", "due on", "autopay set",
        "will be debited", "will be deducted", "scheduled"
    );

    // ── Counterparty ────────────────────────────────────────────────────────

    private static final Pattern PAYEE_PATTERN = Pattern.compile(
        "(?:paid\\s+to|sent\\s+to|payment\\s+to|transferred\\s+to|to)\\s+"
            + "([A-Za-z0-9][A-Za-z0-9 &.@'_\\-]{0,48}?)"
            + "(?=\\s*(?:\\.|,|!|$|\\bvia\\b|\\busing\\b|\\bon\\b|\\bfor\\b|\\bfrom\\b|\\bupi\\b|\\bref\\b|\\btxn\\b))",
        Pattern.CASE_INSENSITIVE
    );

    private static final Pattern PAYER_PATTERN = Pattern.compile(
        "(?:received\\s+from|credited\\s+by|from)\\s+"
            + "([A-Za-z0-9][A-Za-z0-9 &.@'_\\-]{0,48}?)"
            + "(?=\\s*(?:\\.|,|!|$|\\bvia\\b|\\busing\\b|\\bon\\b|\\bfor\\b|\\bto\\b|\\bupi\\b|\\bref\\b|\\btxn\\b))",
        Pattern.CASE_INSENSITIVE
    );

    /**
     * Parse one notification.
     *
     * @param packageName posting app's package id
     * @param title       android.title, may be null
     * @param text        android.text, may be null
     * @param bigText     android.bigText, may be null
     * @param postTimeMs  StatusBarNotification#getPostTime
     */
    public static Result parse(String packageName, String title, String text,
                               String bigText, long postTimeMs) {
        String appName = appNameFor(packageName);
        if (appName == null) {
            return unknown("", "unsupported app");
        }

        String raw = join(title, text, bigText);
        if (raw.isEmpty()) {
            return unknown(appName, "empty notification");
        }

        String lower = normalize(raw);

        // 1. Reject requests, reminders, offers and balance updates outright.
        String marketing = firstMatch(lower, NON_TRANSACTION_WORDS);
        if (marketing != null) {
            return unknown(appName, "not a transaction: '" + marketing.trim() + "'");
        }

        // 2. A failed transaction must never reach the ledger, whatever else
        //    the text says, so this is checked before direction.
        String failure = firstMatch(lower, FAILED_WORDS);
        if (failure != null) {
            return new Result(Kind.FAILED, 0, "Unknown", appName, "", false,
                    "transaction did not succeed: '" + failure + "'");
        }

        // 3. Direction. Whichever intent word appears earliest wins, so
        //    "₹200 debited and credited to Rahul" reads as a debit.
        Hit refund  = earliest(lower, REFUND_WORDS);
        Hit income  = earliest(lower, INCOME_WORDS);
        Hit expense = earliest(lower, EXPENSE_WORDS);

        Hit winner = earliestOf(refund, income, expense);
        if (winner == null) {
            return unknown(appName, "no payment verb found");
        }

        Kind kind;
        if (winner == refund)      kind = Kind.REFUND;
        else if (winner == income) kind = Kind.INCOME;
        else                       kind = Kind.EXPENSE;

        // 4. Amount, preferring the one nearest the verb we matched.
        Amount amount = extractAmount(raw, lower, winner.index);
        if (amount == null) {
            return unknown(appName, "no trustworthy amount found");
        }

        // 5. Counterparty.
        String merchant = extractCounterparty(raw, kind);

        // 6. Confidence. Anything uncertain is surfaced to the user rather
        //    than silently written to their ledger.
        boolean confirm = false;
        String reason = "matched '" + winner.word + "'";

        if (amount.ambiguous) {
            confirm = true;
            reason += "; more than one amount in the text";
        }
        if ("Unknown".equals(merchant) && kind == Kind.EXPENSE) {
            confirm = true;
            reason += "; no payee identified";
        }
        if (amount.value >= 25000) {
            // Large amounts are rare and expensive to get wrong.
            confirm = true;
            reason += "; unusually large amount";
        }

        String fingerprint = fingerprint(packageName, kind, amount.value, merchant, postTimeMs);
        return new Result(kind, amount.value, merchant, appName, fingerprint, confirm, reason);
    }

    // ── Fingerprinting ──────────────────────────────────────────────────────

    /** Duplicate-suppression window. Reposts and bank/UPI echoes land inside it. */
    public static final long DEDUPE_WINDOW_MS = 120_000L;

    /**
     * A stable key for "the same payment".
     *
     * Android reposts a notification whenever the app updates it, and a single
     * UPI payment is often announced twice — once by the payment app and once
     * by the bank. Both produce the same amount and counterparty within
     * seconds, so the timestamp is quantised into {@link #DEDUPE_WINDOW_MS}
     * buckets rather than used exactly.
     *
     * The bucket is emitted together with its predecessor by
     * {@link #fingerprintsFor}, so a pair of events straddling a bucket
     * boundary still collides.
     */
    public static String fingerprint(String packageName, Kind kind, double amount,
                                     String merchant, long postTimeMs) {
        return fingerprintAt(kind, amount, merchant, postTimeMs / DEDUPE_WINDOW_MS);
    }

    private static String fingerprintAt(Kind kind, double amount, String merchant, long bucket) {
        // Package is deliberately excluded: the same payment reported by GPay
        // and by the user's bank app must collide.
        return kind.name() + '|'
                + String.format(Locale.US, "%.2f", amount) + '|'
                + normalizeMerchant(merchant) + '|'
                + bucket;
    }

    /**
     * The fingerprints a caller should test against its recent-events cache:
     * this event's bucket and the one before it.
     */
    public static String[] fingerprintsFor(Kind kind, double amount, String merchant, long postTimeMs) {
        long bucket = postTimeMs / DEDUPE_WINDOW_MS;
        return new String[] {
            fingerprintAt(kind, amount, merchant, bucket),
            fingerprintAt(kind, amount, merchant, bucket - 1),
        };
    }

    private static String normalizeMerchant(String merchant) {
        if (merchant == null) return "unknown";
        return merchant.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    // ── Internals ───────────────────────────────────────────────────────────

    private static final class Hit {
        final String word; final int index;
        Hit(String word, int index) { this.word = word; this.index = index; }
    }

    private static final class Amount {
        final double value; final boolean ambiguous;
        Amount(double value, boolean ambiguous) { this.value = value; this.ambiguous = ambiguous; }
    }

    private static Result unknown(String appName, String reason) {
        return new Result(Kind.UNKNOWN, 0, "Unknown", appName, "", false, reason);
    }

    private static String join(String... parts) {
        StringBuilder sb = new StringBuilder();
        for (String p : parts) {
            if (p == null || p.isEmpty()) continue;
            if (sb.length() > 0) sb.append(' ');
            sb.append(p);
        }
        return sb.toString().trim();
    }

    /** Lowercase and collapse whitespace so phrase matching is predictable. */
    private static String normalize(String s) {
        return s.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }

    /**
     * Index of `needle` in `haystack` as a whole word or phrase, or -1.
     *
     * Plain substring matching misread ordinary words: "reference" contains
     * "refer" (so real bank alerts were dropped as marketing), "consent" and
     * "present" contain "sent", "prepaid" contains "paid", "darwin" contains
     * "win". A match must not be glued to a letter or digit on either side.
     */
    static int indexOfPhrase(String haystack, String needle) {
        if (haystack == null || needle == null || needle.isEmpty()) return -1;
        int from = 0;
        while (from <= haystack.length() - needle.length()) {
            int i = haystack.indexOf(needle, from);
            if (i < 0) return -1;
            int end = i + needle.length();
            boolean startOk = i == 0 || !Character.isLetterOrDigit(haystack.charAt(i - 1));
            boolean endOk = end >= haystack.length() || !Character.isLetterOrDigit(haystack.charAt(end));
            if (startOk && endOk) return i;
            from = i + 1;
        }
        return -1;
    }

    private static String firstMatch(String haystack, List<String> needles) {
        for (String n : needles) {
            if (indexOfPhrase(haystack, n) >= 0) return n;
        }
        return null;
    }

    private static Hit earliest(String haystack, List<String> needles) {
        Hit best = null;
        for (String n : needles) {
            int i = indexOfPhrase(haystack, n);
            if (i >= 0 && (best == null || i < best.index)) {
                best = new Hit(n, i);
            }
        }
        return best;
    }

    private static Hit earliestOf(Hit... hits) {
        Hit best = null;
        for (Hit h : hits) {
            if (h != null && (best == null || h.index < best.index)) best = h;
        }
        return best;
    }

    /**
     * Pull out the transaction amount.
     *
     * Amounts preceded by balance/limit/offer wording are discarded. Of what
     * remains the one closest to the payment verb wins, and the result is
     * flagged ambiguous when more than one candidate survived.
     */
    private static Amount extractAmount(String raw, String lower, int verbIndex) {
        Matcher m = AMOUNT_PATTERN.matcher(raw);
        double bestValue = -1;
        int bestDistance = Integer.MAX_VALUE;
        int candidates = 0;

        while (m.find()) {
            int start = m.start();

            // Look back a short way for wording that reframes this number.
            int from = Math.max(0, start - 28);
            String preceding = lower.substring(Math.min(from, lower.length()),
                                               Math.min(start, lower.length()));
            if (firstMatch(preceding, AMOUNT_DISQUALIFIERS) != null) continue;

            double value;
            try {
                value = Double.parseDouble(m.group(1).replace(",", ""));
            } catch (NumberFormatException e) {
                continue;
            }
            if (value <= 0 || value > 10_000_000d) continue;

            candidates++;
            int distance = Math.abs(start - verbIndex);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestValue = value;
            }
        }

        if (candidates == 0) return null;
        return new Amount(round2(bestValue), candidates > 1);
    }

    private static String extractCounterparty(String raw, Kind kind) {
        Pattern p = (kind == Kind.INCOME || kind == Kind.REFUND) ? PAYER_PATTERN : PAYEE_PATTERN;
        Matcher m = p.matcher(raw);
        if (m.find()) {
            String found = cleanName(m.group(1));
            if (!found.isEmpty()) return found;
        }
        // Fall back to the other direction — notification wording is not consistent.
        Matcher other = (p == PAYEE_PATTERN ? PAYER_PATTERN : PAYEE_PATTERN).matcher(raw);
        if (other.find()) {
            String found = cleanName(other.group(1));
            if (!found.isEmpty()) return found;
        }
        return "Unknown";
    }

    private static String cleanName(String s) {
        if (s == null) return "";
        String cleaned = s.trim()
                .replaceAll("\\s+", " ")
                .replaceAll("[.,;:]+$", "")
                .trim();
        // A bare number or a one-character fragment is noise, not a name.
        if (cleaned.length() < 2 || cleaned.matches("^[0-9.]+$")) return "";
        if (cleaned.length() > 48) cleaned = cleaned.substring(0, 48).trim();
        return cleaned;
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
