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
        /**
         * The UPI / bank reference (RRN, UTR, Ref No, Txn ID) when the text
         * carries one, else "". Used only to tell payments apart during
         * duplicate detection; the listener stores a hash of it, never the value.
         */
        public final String reference;

        Result(Kind kind, double amount, String merchant, String appName,
               String fingerprint, boolean needsConfirmation, String reason) {
            this(kind, amount, merchant, appName, fingerprint, needsConfirmation, reason, "");
        }

        Result(Kind kind, double amount, String merchant, String appName,
               String fingerprint, boolean needsConfirmation, String reason, String reference) {
            this.kind = kind;
            this.amount = amount;
            this.merchant = merchant;
            this.appName = appName;
            this.fingerprint = fingerprint;
            this.needsConfirmation = needsConfirmation;
            this.reason = reason;
            this.reference = reference == null ? "" : reference;
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
    // The allowlist lives in {@link PaymentSources}. Notifications from any
    // other package are ignored before their text is read.

    /** Human-readable name for a package, or null when the app is not supported. */
    public static String appNameFor(String packageName) {
        return PaymentSources.nameFor(packageName);
    }

    public static boolean isSupportedPackage(String packageName) {
        return PaymentSources.isSupported(packageName);
    }

    // ── Amounts ─────────────────────────────────────────────────────────────
    // Matches ₹50, Rs.1,200, Rs 1,00,000.50, INR 500. Indian digit grouping
    // (1,00,000) and plain grouping (100,000) both work.

    private static final Pattern AMOUNT_PATTERN = Pattern.compile(
        "(?:₹|rs\\.?|inr)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)",
        Pattern.CASE_INSENSITIVE
    );

    /**
     * Bank SMS only: an amount written without a currency, directly after the
     * debit verb — SBI's "A/C X1234 debited by 250.0 on date 29Sep26".
     */
    private static final Pattern BARE_AMOUNT_PATTERN = Pattern.compile(
        "\\b(?:debited|spent|paid|sent|transferred|withdrawn)\\s+(?:by|for|with|of)\\s+(?:₹|rs\\.?|inr)?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)\\b",
        Pattern.CASE_INSENSITIVE
    );

    /**
     * Words that, immediately before an amount, mean it is NOT the transaction
     * value — a balance, a limit, a reward. Checked against the ~28 characters
     * preceding the match. ("Avlbl Amt" and "Avail.bal" are how Bank of Baroda
     * and Canara Bank label the balance in their SMS.)
     */
    private static final List<String> AMOUNT_DISQUALIFIERS = Arrays.asList(
        "balance", "bal", "avl", "avlbl", "avail", "available", "limit", "due", "outstanding",
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
        "credited to your", "transferred to your", "credited", "money added",
        "added to your wallet", "received", "deposited"
    );

    private static final List<String> EXPENSE_WORDS = Arrays.asList(
        "you have paid", "you paid", "payment of", "paid to", "sent to",
        "has been debited", "is debited", "debited from", "debited",
        "successfully paid", "money sent", "you sent", "withdrawn", "spent",
        "purchase of", "transferred from", "money transfer", "used for a transaction",
        "paid", "sent"
    );

    /**
     * One-time passwords. A bank OTP SMS names an amount and a merchant
     * ("123456 is the OTP for your transaction of Rs.1,299 at AMAZON") but is
     * not a payment — and is never read further. Warnings such as "never
     * share your OTP" are deliberately not matched.
     */
    private static final List<String> OTP_WORDS = Arrays.asList(
        "is your otp", "is the otp", "otp is", "otp for", "otp to",
        "one time password", "one-time password", "verification code",
        "security code", "authentication code"
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
        "statement is ready", "bill is due", "due on", "is due", "amount due", "autopay set",
        "will be debited", "will be deducted", "scheduled",
        // Setting up a UPI mandate is not a payment (its later debits are).
        "mandate created", "mandate is created", "mandate has been created",
        "mandate is successfully created", "mandate registered"
    );

    // ── Counterparty ────────────────────────────────────────────────────────

    /** Where a payee's name ends: "to SWIGGY on 29/09", "trf to SWIGGY Refno …". */
    private static final String NAME_END =
        "(?=\\s*(?:\\.|,|;|!|\\(|$|\\bvia\\b|\\busing\\b|\\bon\\b|\\bfor\\b|\\bfrom\\b|\\bupi\\b|\\bref\\b"
            + "|\\brefno\\b|\\brrn\\b|\\butr\\b|\\btxn\\b|\\bavl\\b|\\bbal\\b|\\bnot\\b|\\bif\\b|\\bcall\\b))";

    private static final Pattern PAYEE_PATTERN = Pattern.compile(
        "(?:paid\\s+to|sent\\s+to|payment\\s+to|transferred\\s+to|to)\\s+"
            + "([A-Za-z0-9][A-Za-z0-9 &.@'_\\-]{0,48}?)" + NAME_END,
        Pattern.CASE_INSENSITIVE
    );

    /** Bank SMS (Axis, Canara and others): "UPI/P2M/412345678901/SWIGGY". */
    private static final Pattern SMS_UPI_PATH_PAYEE = Pattern.compile(
        "\\bupi/(?:p2[am]|[a-z]{2,4})/[0-9]{6,20}/([A-Za-z0-9][A-Za-z0-9 &.@'_\\-]{0,40}?)(?=\\s*(?:/|\\.|,|;|\\n|$))",
        Pattern.CASE_INSENSITIVE
    );

    /** Bank SMS (ICICI): "…debited for Rs 250.00 on 29-Sep-26; SWIGGY credited." */
    private static final Pattern SMS_CREDITED_PAYEE = Pattern.compile(
        ";\\s*([A-Za-z0-9][A-Za-z0-9 &.@'_\\-]{0,40}?)\\s+credited\\b",
        Pattern.CASE_INSENSITIVE
    );

    /** Card spends: "…spent on HDFC Bank Card xx1234 at AMAZON on 2026-09-29". */
    private static final Pattern SMS_AT_PAYEE = Pattern.compile(
        "\\bat\\s+([A-Za-z0-9][A-Za-z0-9 &.@'_*\\-]{0,40}?)" + NAME_END,
        Pattern.CASE_INSENSITIVE
    );

    /**
     * Where a bank SMS stops describing the payment and starts its standard
     * tail ("Not you? Call 1800…", "SMS BLOCK …", balances). Payees are only
     * looked for before it, so "Fwd this SMS to 9264092640 to block UPI" is
     * never read as a payee.
     */
    private static final Pattern SMS_TAIL = Pattern.compile(
        "(?:\\bnot\\s+you\\b|\\bnot\\s+u\\b|\\bif\\s+not\\b|\\bcall\\s+\\d|\\bsms\\s+block\\b|\\bfwd\\s+this\\b"
            + "|\\breport\\s+at\\b|\\btotal\\s+bal|\\bavl\\.?\\s*bal|\\bavail|\\bavlbl)",
        Pattern.CASE_INSENSITIVE
    );

    /** Cash, not spending on something: always confirmed by the user. */
    private static final Pattern ATM_PATTERN = Pattern.compile(
        "\\b(?:atm|cash\\s+withdrawal|withdrawn\\s+at)\\b", Pattern.CASE_INSENSITIVE);

    private static final Pattern PAYER_PATTERN = Pattern.compile(
        "(?:received\\s+from|credited\\s+by|from)\\s+"
            + "([A-Za-z0-9][A-Za-z0-9 &.@'_\\-]{0,48}?)"
            + "(?=\\s*(?:\\.|,|!|$|\\bvia\\b|\\busing\\b|\\bon\\b|\\bfor\\b|\\bto\\b|\\bupi\\b|\\bref\\b|\\btxn\\b))",
        Pattern.CASE_INSENSITIVE
    );

    /**
     * A transaction reference: "UPI Ref No. 123456789012", "Ref: 3092…",
     * "RRN 1234…", "UTR …", "Txn ID T2309…", "Transaction ID …". The value must
     * contain at least six digits, so words and masked account numbers
     * ("A/c XX1234") never qualify.
     */
    private static final Pattern REFERENCE_PATTERN = Pattern.compile(
        "(?:\\b(?:upi\\s*)?(?:ref(?:erence)?|rrn|utr|txn|transaction)\\s*(?:no\\.?|number|id|#)?\\s*[:.#-]?\\s*)"
            + "([A-Za-z0-9]{6,30})",
        Pattern.CASE_INSENSITIVE
    );

    /** Bank SMS: "UPI:412345678901", "to:UPI/412345678901", "UPI/P2M/412345678901/…". */
    private static final Pattern UPI_REF_PATTERN = Pattern.compile(
        "\\bupi\\s*[:/]\\s*(?:(?:p2[am]|[a-z]{2,4})/)?([0-9]{9,20})\\b",
        Pattern.CASE_INSENSITIVE
    );

    /** The reference in the text, or "" when there is none. */
    static String extractReference(String raw) {
        if (raw == null) return "";
        Matcher m = REFERENCE_PATTERN.matcher(raw);
        while (m.find()) {
            String v = m.group(1);
            int digits = 0;
            for (int i = 0; i < v.length(); i++) if (Character.isDigit(v.charAt(i))) digits++;
            if (digits >= 6) return v.toUpperCase(Locale.ROOT);
        }
        Matcher upi = UPI_REF_PATTERN.matcher(raw);
        if (upi.find()) return upi.group(1);
        return "";
    }

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
        return classify(raw, appName, packageName, postTimeMs, false);
    }

    /**
     * Parse one bank SMS. The caller ({@link SmsIntake}) has already checked
     * the sender is a business sender ID, such as "VM-HDFCBK", and not a
     * person: messages from phone numbers never reach this method.
     *
     * @param sender   the SMS sender ID
     * @param body     the full message (multi-part messages joined)
     * @param timeMs   when the bank sent it
     */
    public static Result parseSms(String sender, String body, long timeMs) {
        String bank = SmsSources.bankName(sender);
        if (body == null || body.trim().isEmpty()) {
            return unknown(bank, "empty sms");
        }
        return classify(body, bank, SmsSources.sourceKey(sender), timeMs, true);
    }

    /** The shared decision for app notifications and bank SMS. */
    private static Result classify(String raw, String appName, String sourceKey, long postTimeMs, boolean sms) {
        String lower = normalize(raw);

        // 0. One-time passwords name an amount and a merchant but are not payments.
        String otp = firstMatch(lower, OTP_WORDS);
        if (otp != null) {
            return unknown(appName, "one-time password");
        }

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

        // 4. Amount, preferring the one nearest the verb we matched. Bank SMS
        //    may omit the currency ("debited by 250.0").
        Amount amount = extractAmount(raw, lower, winner.index);
        if (amount == null && sms) amount = extractBareAmount(raw);
        if (amount == null) {
            return unknown(appName, "no trustworthy amount found");
        }

        // 5. Counterparty.
        String merchant = sms ? extractSmsPayee(raw) : extractCounterparty(raw, kind);

        // 6. Confidence. Anything uncertain is surfaced to the user rather
        //    than silently written to their ledger.
        boolean confirm = false;
        String reason = "matched '" + winner.word + "'";

        if (amount.ambiguous) {
            confirm = true;
            reason += "; more than one amount in the text";
        }
        // A payment app's notification without a payee is unusual; a bank
        // debit alert often names none ("thru UPI:4123…") and is still certain.
        if (!sms && "Unknown".equals(merchant) && kind == Kind.EXPENSE) {
            confirm = true;
            reason += "; no payee identified";
        }
        if (amount.value >= 25000) {
            // Large amounts are rare and expensive to get wrong.
            confirm = true;
            reason += "; unusually large amount";
        }
        if (kind == Kind.EXPENSE && ATM_PATTERN.matcher(raw).find()) {
            // Cash is moved, not spent yet: the user decides.
            confirm = true;
            merchant = "Cash withdrawal";
            reason += "; cash withdrawal";
        }

        String fingerprint = fingerprint(sourceKey, kind, amount.value, merchant, postTimeMs);
        return new Result(kind, amount.value, merchant, appName, fingerprint, confirm, reason,
                extractReference(raw));
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

    static String normalizeMerchant(String merchant) {
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
        // Same length and positions as `raw` (unlike `lower`, whose collapsed
        // whitespace shifts positions in multi-line bank SMS).
        String rawLower = raw.toLowerCase(Locale.ROOT);
        double bestValue = -1;
        int bestDistance = Integer.MAX_VALUE;
        int candidates = 0;

        while (m.find()) {
            int start = m.start();

            // Look back a short way for wording that reframes this number.
            int from = Math.max(0, start - 28);
            String preceding = rawLower.substring(from, start).replaceAll("\\s+", " ");
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
            String found = cleanPayee(m.group(1));
            if (!found.isEmpty()) return found;
        }
        // Fall back to the other direction — notification wording is not consistent.
        Matcher other = (p == PAYEE_PATTERN ? PAYER_PATTERN : PAYEE_PATTERN).matcher(raw);
        if (other.find()) {
            String found = cleanPayee(other.group(1));
            if (!found.isEmpty()) return found;
        }
        return "Unknown";
    }

    /**
     * The payee of a bank debit SMS, in order of how reliably each format
     * names it: "UPI/P2M/ref/NAME", "; NAME credited", a card's "at NAME",
     * then "to NAME". Only the part before the SMS's standard tail is read.
     */
    private static String extractSmsPayee(String raw) {
        String head = smsHead(raw);
        for (Pattern p : new Pattern[] { SMS_UPI_PATH_PAYEE, SMS_CREDITED_PAYEE, SMS_AT_PAYEE, PAYEE_PATTERN }) {
            Matcher m = p.matcher(head);
            while (m.find()) {
                String found = cleanPayee(m.group(1));
                if (!found.isEmpty()) return found;
            }
        }
        return "Unknown";
    }

    /** The SMS up to its standard tail ("Not you? Call …", balances, block instructions). */
    static String smsHead(String raw) {
        Matcher tail = SMS_TAIL.matcher(raw);
        return tail.find() ? raw.substring(0, tail.start()) : raw;
    }

    /** SBI-style amounts without a currency, right after the debit verb. */
    private static Amount extractBareAmount(String raw) {
        Matcher m = BARE_AMOUNT_PATTERN.matcher(raw);
        if (!m.find()) return null;
        try {
            double value = Double.parseDouble(m.group(1).replace(",", ""));
            if (value <= 0 || value > 10_000_000d) return null;
            return new Amount(round2(value), false);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * A name fit to store as the expense's description. A UPI id is shortened
     * to its handle ("swiggy@icici" → "swiggy"), and one made of a phone number
     * becomes "UPI transfer": Vittova never stores someone's phone number.
     * Masked account numbers and "your account" are not payees.
     */
    static String cleanPayee(String s) {
        String name = cleanName(s);
        if (name.isEmpty()) return "";
        int at = name.indexOf('@');
        if (at > 0) {
            String handle = name.substring(0, at);
            int digits = 0;
            for (int i = 0; i < handle.length(); i++) if (Character.isDigit(handle.charAt(i))) digits++;
            if (digits >= 6) return "UPI transfer";
            name = cleanName(handle);
            if (name.isEmpty()) return "";
            name = displayHandle(name);
        }
        int digits = 0;
        for (int i = 0; i < name.length(); i++) if (Character.isDigit(name.charAt(i))) digits++;
        if (digits >= 7) return "";
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.equals("you") || lower.startsWith("your ") || lower.startsWith("a/c") || lower.startsWith("ac ")
                || lower.startsWith("account") || name.matches("^[Xx*]+[0-9]{0,6}$")) {
            return "";
        }
        return name;
    }

    /**
     * A UPI ID's handle is usually all lowercase ("uber", "swiggy.instamart"):
     * shown as a name ("Uber", "Swiggy Instamart"). A handle with its own
     * capitals is left as it is.
     */
    static String displayHandle(String handle) {
        if (!handle.equals(handle.toLowerCase(Locale.ROOT))) return handle;
        StringBuilder out = new StringBuilder();
        for (String word : handle.split("[._-]+")) {
            if (word.isEmpty()) continue;
            if (out.length() > 0) out.append(' ');
            out.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }
        return out.length() == 0 ? handle : out.toString();
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
