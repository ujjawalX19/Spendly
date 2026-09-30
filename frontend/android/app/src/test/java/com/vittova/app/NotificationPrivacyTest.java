package com.vittova.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import com.vittova.app.PaymentNotificationParser.Kind;
import com.vittova.app.PaymentNotificationParser.Result;

import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

/**
 * P0 privacy and correctness guarantees for notification-based detection:
 * only allowlisted payment/bank apps are processed, ordinary words are not
 * mistaken for payment keywords, duplicates are recorded once, and the
 * on-device queue keeps only what it needs for a bounded time.
 */
public class NotificationPrivacyTest {

    private static final long T = 1_700_000_000_000L;
    private static final String GPAY = "com.google.android.apps.nbu.paisa.user";

    private static Result parse(String pkg, String title, String text) {
        return PaymentNotificationParser.parse(pkg, title, text, null, T);
    }

    // ── Allowlist ───────────────────────────────────────────────────────────

    @Test
    public void whatsAppMessageAboutPayingIsIgnored() {
        Result r = parse("com.whatsapp", "Rahul", "I paid ₹500 to the landlord, you owe me ₹250");
        assertEquals(Kind.UNKNOWN, r.kind);
        assertFalse(r.isRecordable());
        assertFalse(PaymentNotificationParser.isSupportedPackage("com.whatsapp"));
        assertFalse(PaymentNotificationParser.isSupportedPackage("com.whatsapp.w4b"));
    }

    @Test
    public void messagingEmailSocialAndShoppingAppsAreIgnored() {
        String[] ignored = {
            "org.telegram.messenger", "com.google.android.apps.messaging", "com.android.mms",
            "com.google.android.gm", "com.instagram.android", "com.facebook.orca",
            "com.amazon.mShop.android.shopping", "in.amazon.mShop.android.shopping", "com.jio.myjio",
        };
        for (String pkg : ignored) {
            Result r = parse(pkg, "Payment successful", "You paid ₹250 to Zomato");
            assertEquals(pkg, Kind.UNKNOWN, r.kind);
            assertFalse(pkg, PaymentNotificationParser.isSupportedPackage(pkg));
        }
    }

    @Test
    public void unknownAppIsIgnored() {
        Result r = parse("com.example.randomapp", "Paid", "You paid ₹99 to Store");
        assertEquals(Kind.UNKNOWN, r.kind);
        assertEquals("", r.fingerprint);
    }

    @Test
    public void supportedUpiNotificationIsParsed() {
        Result r = parse(GPAY, "Payment successful", "You paid ₹250 to Zomato");
        assertEquals(Kind.EXPENSE, r.kind);
        assertEquals(250.0, r.amount, 0.001);
        assertEquals("Zomato", r.merchant);
        assertTrue(r.isRecordable());
        assertFalse(r.fingerprint.isEmpty());
    }

    @Test
    public void everySupportedBankIsRecognised() {
        assertTrue(PaymentNotificationParser.isSupportedPackage("com.snapwork.hdfc"));
        assertTrue(PaymentNotificationParser.isSupportedPackage("com.sbi.lotusintouch"));
        assertTrue(PaymentNotificationParser.isSupportedPackage("com.phonepe.app"));
    }

    // ── Whole-word matching ─────────────────────────────────────────────────

    @Test
    public void referenceNumberIsNotMistakenForAReferralOffer() {
        Result r = parse("com.snapwork.hdfc", "Account debited",
            "Rs.250.00 debited from A/c XX1234 to SWIGGY. UPI reference no 412345678901");
        assertEquals(Kind.EXPENSE, r.kind);
        assertEquals(250.0, r.amount, 0.001);
    }

    @Test
    public void wordsContainingKeywordsDoNotTrigger() {
        assertEquals(-1, PaymentNotificationParser.indexOfPhrase("with your consent", "sent"));
        assertEquals(-1, PaymentNotificationParser.indexOfPhrase("prepaid plan", "paid"));
        assertEquals(-1, PaymentNotificationParser.indexOfPhrase("darwin travels", "win"));
        assertEquals(-1, PaymentNotificationParser.indexOfPhrase("upi reference", "refer"));
        assertEquals(0, PaymentNotificationParser.indexOfPhrase("paid to zomato", "paid"));
        assertEquals(9, PaymentNotificationParser.indexOfPhrase("you have paid.", "paid"));
    }

    @Test
    public void realReferralOfferIsStillIgnored() {
        Result r = parse(GPAY, "Earn rewards", "Refer a friend and get ₹201 when they pay");
        assertEquals(Kind.UNKNOWN, r.kind);
    }

    // ── Duplicates ──────────────────────────────────────────────────────────

    private static PendingPaymentQueue.Payment detect(String pkg, String text, long t) {
        Result r = PaymentNotificationParser.parse(pkg, "Payment", text, null, t);
        assertEquals(text, Kind.EXPENSE, r.kind);
        PaymentSources.Type type = PaymentSources.typeFor(pkg);
        return PendingPaymentQueue.fromParse(r, pkg, type.name(), t);
    }

    private static PendingPaymentQueue.AddResult add(List<PendingPaymentQueue.Payment> q,
                                                     List<PendingPaymentQueue.Payment> done,
                                                     PendingPaymentQueue.Payment p) {
        return PendingPaymentQueue.add(q, done, p, p.timestamp);
    }

    @Test
    public void duplicateNotificationIsNotDuplicated() {
        List<PendingPaymentQueue.Payment> q = new ArrayList<>();
        List<PendingPaymentQueue.Payment> done = new ArrayList<>();
        assertEquals(PendingPaymentQueue.AddResult.ADDED, add(q, done, detect(GPAY, "You paid ₹250 to Zomato", T)));
        assertEquals(PendingPaymentQueue.AddResult.DUPLICATE, add(q, done, detect(GPAY, "You paid ₹250 to Zomato", T + 5_000)));
        assertEquals(1, q.size());
    }

    @Test
    public void samePaymentFromUpiAppAndBankAppIsRecordedOnce() {
        List<PendingPaymentQueue.Payment> q = new ArrayList<>();
        List<PendingPaymentQueue.Payment> done = new ArrayList<>();
        assertEquals(PendingPaymentQueue.AddResult.ADDED, add(q, done, detect(GPAY, "You paid ₹250 to Zomato", T)));
        assertEquals(PendingPaymentQueue.AddResult.DUPLICATE,
            add(q, done, detect("com.snapwork.hdfc", "Rs 250 debited from A/c XX1234 to ZOMATO LTD", T + 30_000)));
        assertEquals(1, q.size());
    }

    @Test
    public void aRealSecondPurchaseLaterIsNotSuppressed() {
        List<PendingPaymentQueue.Payment> q = new ArrayList<>();
        List<PendingPaymentQueue.Payment> done = new ArrayList<>();
        assertEquals(PendingPaymentQueue.AddResult.ADDED, add(q, done, detect(GPAY, "You paid ₹40 to Metro", T)));
        assertEquals(PendingPaymentQueue.AddResult.ADDED, add(q, done, detect(GPAY, "You paid ₹40 to Metro", T + 60 * 60 * 1000)));
        assertEquals(2, q.size());
    }

    // ── On-device queue ─────────────────────────────────────────────────────

    @Test
    public void queueDoesNotStoreTheSameDetectionTwice() {
        List<PendingPaymentQueue.Payment> q = new ArrayList<>();
        List<PendingPaymentQueue.Payment> done = new ArrayList<>();
        PendingPaymentQueue.Payment p = detect(GPAY, "You paid ₹100 to Zomato", T);
        assertEquals(PendingPaymentQueue.AddResult.ADDED, add(q, done, p));
        assertEquals(PendingPaymentQueue.AddResult.DUPLICATE, add(q, done, p));
        assertEquals(1, q.size());
    }

    @Test
    public void queueExpiresUnsentDetectionsAfterThirtyDays() {
        List<PendingPaymentQueue.Payment> q = new ArrayList<>();
        List<PendingPaymentQueue.Payment> done = new ArrayList<>();
        add(q, done, detect(GPAY, "You paid ₹100 to Zomato", T));
        PendingPaymentQueue.prune(q, done, T + PendingPaymentQueue.TTL_MS - 1);
        assertEquals(1, q.size());
        PendingPaymentQueue.prune(q, done, T + PendingPaymentQueue.TTL_MS + 1);
        assertTrue(q.isEmpty());
    }

    @Test
    public void queueIsBounded() {
        List<PendingPaymentQueue.Payment> q = new ArrayList<>();
        List<PendingPaymentQueue.Payment> done = new ArrayList<>();
        PendingPaymentQueue.Payment first = null;
        for (int i = 0; i < PendingPaymentQueue.MAX_ENTRIES + 10; i++) {
            // A different payee each time, so none is a duplicate of another.
            PendingPaymentQueue.Payment p = detect(GPAY, "You paid ₹100 to Shop" + i, T + i);
            if (first == null) first = p;
            PendingPaymentQueue.add(q, done, p, T + i);
        }
        assertEquals(PendingPaymentQueue.MAX_ENTRIES, q.size());
        assertNotEquals(first.id, q.get(0).id);
    }

    @Test
    public void resolvedDetectionLeavesTheQueueButIsRemembered() {
        List<PendingPaymentQueue.Payment> q = new ArrayList<>();
        List<PendingPaymentQueue.Payment> done = new ArrayList<>();
        PendingPaymentQueue.Payment a = detect(GPAY, "You paid ₹100 to Zomato", T);
        add(q, done, a);
        add(q, done, detect(GPAY, "You paid ₹60 to Metro", T));
        assertTrue(PendingPaymentQueue.resolve(q, done, a.id, "synced", T + 1));
        assertFalse(PendingPaymentQueue.resolve(q, done, a.id, "synced", T + 2));
        assertEquals(1, q.size());
        assertEquals(1, done.size());
        // The app reposts the same notification after the upload: still one expense.
        assertEquals(PendingPaymentQueue.AddResult.DUPLICATE, add(q, done, detect(GPAY, "You paid ₹100 to Zomato", T + 20_000)));
    }
}
