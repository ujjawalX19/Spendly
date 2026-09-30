package com.vittova.app;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * SmsSources — which SMS Vittova may read, decided from the sender alone,
 * before the message body is touched.
 *
 * In India, banks, card issuers and payment services send from registered
 * business sender IDs (TRAI DLT headers): two letters, a hyphen and a six
 * character code, sometimes with a category suffix — "VM-HDFCBK",
 * "JD-ICICIT-S", "AX-SBIUPI-T". Some phones show only the code ("HDFCBK").
 *
 * Accepted: those headers, except promotional ones (the "-P" suffix).
 * Never read: anything from a phone number (a person), numeric short codes,
 * email-to-SMS addresses and anything else that is not a business header.
 *
 * Pure Java (no Android types) so it is unit-tested on the JVM.
 */
final class SmsSources {

    private static final Pattern HEADER = Pattern.compile("^(?:[A-Z]{2}-)?([A-Z0-9]{6})(?:-([A-Z]))?$");

    // Header code → name shown on the expense ("HDFC Bank"). Matched on part
    // of the code, because a bank uses several (SBIUPI, SBIINB, CBSSBI…).
    private static final String[][] BANKS = {
        { "HDFC", "HDFC Bank" }, { "SBICRD", "SBI Card" }, { "SBI", "SBI" }, { "ICICI", "ICICI Bank" },
        { "AXIS", "Axis Bank" }, { "KOTAK", "Kotak" }, { "PNB", "PNB" }, { "CANB", "Canara Bank" },
        { "BOB", "Bank of Baroda" }, { "UNION", "Union Bank" }, { "UBOI", "Union Bank" },
        { "INDUS", "IndusInd Bank" }, { "IDFC", "IDFC FIRST Bank" }, { "YESB", "YES Bank" },
        { "FEDB", "Federal Bank" }, { "IDBI", "IDBI Bank" }, { "BOI", "Bank of India" },
        { "CENTB", "Central Bank" }, { "IOB", "Indian Overseas Bank" }, { "INDB", "Indian Bank" },
        { "UCO", "UCO Bank" }, { "RBL", "RBL Bank" }, { "AUBANK", "AU Bank" }, { "PAYTM", "Paytm" },
        { "AIRBNK", "Airtel Payments Bank" }, { "JIOPBS", "Jio Payments Bank" }, { "AMEX", "American Express" },
        { "HSBC", "HSBC" }, { "SCBANK", "Standard Chartered" }, { "CITI", "Citi" }, { "DBS", "DBS Bank" },
    };

    private SmsSources() { }

    /** The six-character header code, or null when this sender must not be read. */
    static String headerCode(String address) {
        if (address == null) return null;
        String a = address.trim().toUpperCase(Locale.ROOT).replace(" ", "");
        Matcher m = HEADER.matcher(a);
        if (!m.matches()) return null;
        String suffix = m.group(2);
        if ("P".equals(suffix)) return null; // promotional
        String code = m.group(1);
        int letters = 0;
        for (int i = 0; i < code.length(); i++) if (Character.isLetter(code.charAt(i))) letters++;
        // "123456" is a short code, not a business header.
        return letters >= 3 ? code : null;
    }

    /** True for a business sender (a bank, card or payment service); false for a person. */
    static boolean isBusinessSender(String address) {
        return headerCode(address) != null;
    }

    /** Stable source key for duplicate detection: one per sender code. */
    static String sourceKey(String address) {
        String code = headerCode(address);
        return "sms:" + (code == null ? "unknown" : code);
    }

    /** Name shown on the expense: the bank when known, otherwise "Bank SMS". */
    static String bankName(String address) {
        String code = headerCode(address);
        if (code == null) return "Bank SMS";
        for (String[] row : BANKS) {
            if (code.contains(row[0])) return row[1];
        }
        return "Bank SMS";
    }
}
