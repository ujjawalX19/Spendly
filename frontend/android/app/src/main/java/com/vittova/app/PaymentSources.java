package com.vittova.app;

/**
 * PaymentSources — the one allowlist of apps whose notifications Vittova reads.
 *
 * Notifications from any package not listed here are ignored before their text
 * is read — in particular messaging (WhatsApp, Telegram, SMS), email, social
 * and shopping apps, where people routinely write "I paid ₹500" in chat.
 *
 * MUST match frontend/src/lib/supportedPaymentApps.js, which is what the
 * onboarding screen and privacy policy show users; a frontend test fails if the
 * two lists differ. Package ids must be verified against the Play Store listing
 * before adding a new entry.
 *
 * The type matters for duplicate detection: one UPI payment is often announced
 * by the UPI app AND by the bank, and those two notifications describe the same
 * money (see {@link PendingPaymentQueue#isDuplicate}).
 *
 * Pure Java (no Android types) so it is unit-tested on the JVM.
 */
final class PaymentSources {

    enum Type { UPI_APP, BANK_APP }

    // { package id, display name, "UPI" | "BANK" }
    private static final String[][] KNOWN_PACKAGES = {
        // UPI apps
        { "com.google.android.apps.nbu.paisa.user", "GPay",            "UPI"  },
        { "com.phonepe.app",                        "PhonePe",         "UPI"  },
        { "net.one97.paytm",                        "Paytm",           "UPI"  },
        { "in.org.npci.upiapp",                     "BHIM",            "UPI"  },
        { "com.sbi.SBIFreedomPlus",                 "BHIM SBI Pay",    "UPI"  },
        { "com.dreamplug.androidapp",               "CRED",            "UPI"  },
        { "money.super.payments",                   "super.money",     "UPI"  },
        { "com.mobikwik_new",                       "MobiKwik",        "UPI"  },
        { "com.freecharge.android",                 "Freecharge",      "UPI"  },
        { "com.fampay.in",                          "FamPay",          "UPI"  },
        // Bank apps
        { "com.snapwork.hdfc",                      "HDFC Bank",       "BANK" },
        { "com.csam.icici.bank.imobile",            "ICICI Bank",      "BANK" },
        { "com.sbi.lotusintouch",                   "SBI YONO",        "BANK" },
        { "com.msf.kbank.mobile",                   "Kotak",           "BANK" },
        { "com.axis.mobile",                        "Axis Bank",       "BANK" },
        { "com.bankofbaroda.mconnect",              "Bank of Baroda",  "BANK" },
        { "com.infrasoft.uboi",                     "Union Bank",      "BANK" },
        { "com.fss.pnbpsp",                         "PNB",             "BANK" },
        { "com.canarabank.mobility",                "Canara Bank",     "BANK" },
        { "com.indusind.indusmobile",               "IndusInd Bank",   "BANK" },
        { "com.idfcfirstbank.optimus",              "IDFC FIRST Bank", "BANK" },
    };

    private PaymentSources() { }

    private static String[] row(String packageName) {
        if (packageName == null) return null;
        for (String[] r : KNOWN_PACKAGES) {
            if (r[0].equals(packageName)) return r;
        }
        // Debug builds only (src/debug): the adb shell stands in for a payment
        // app in device tests. The release build's copy of this list is empty.
        for (String[] r : DebugFeatures.EXTRA_SOURCES) {
            if (r[0].equals(packageName)) return r;
        }
        return null;
    }

    /** Human-readable name for a package, or null when the app is not supported. */
    static String nameFor(String packageName) {
        String[] r = row(packageName);
        return r == null ? null : r[1];
    }

    /** UPI app or bank app; null when the app is not supported. */
    static Type typeFor(String packageName) {
        String[] r = row(packageName);
        if (r == null) return null;
        return "BANK".equals(r[2]) ? Type.BANK_APP : Type.UPI_APP;
    }

    static boolean isSupported(String packageName) {
        return row(packageName) != null;
    }
}
