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

    @Test
    public void duplicateNotificationIsNotDuplicated() {
        DuplicateSuppressor suppressor = new DuplicateSuppressor(200);
        Result first = PaymentNotificationParser.parse(GPAY, "Payment successful", "You paid ₹250 to Zomato", null, T);
        Result repost = PaymentNotificationParser.parse(GPAY, "Payment successful", "You paid ₹250 to Zomato", null, T + 5_000);

        assertFalse(suppressor.isDuplicate(first, T));
        assertTrue(suppressor.isDuplicate(repost, T + 5_000));
    }

    @Test
    public void samePaymentFromUpiAppAndBankAppIsRecordedOnce() {
        DuplicateSuppressor suppressor = new DuplicateSuppressor(200);
        Result upi = PaymentNotificationParser.parse(GPAY, "Paid", "You paid ₹250 to Zomato", null, T);
        Result bank = PaymentNotificationParser.parse("com.snapwork.hdfc", "Debit", "Rs 250 paid to Zomato", null, T + 30_000);
        assertFalse(suppressor.isDuplicate(upi, T));
        assertTrue(suppressor.isDuplicate(bank, T + 30_000));
    }

    @Test
    public void aRealSecondPurchaseLaterIsNotSuppressed() {
        DuplicateSuppressor suppressor = new DuplicateSuppressor(200);
        Result a = PaymentNotificationParser.parse(GPAY, "Paid", "You paid ₹40 to Metro", null, T);
        Result b = PaymentNotificationParser.parse(GPAY, "Paid", "You paid ₹40 to Metro", null, T + 60 * 60 * 1000);
        assertFalse(suppressor.isDuplicate(a, T));
        assertFalse(suppressor.isDuplicate(b, T + 60 * 60 * 1000));
    }

    // ── On-device queue ─────────────────────────────────────────────────────

    private static PendingPaymentQueue.Entry entry(String fp, long ts) {
        return new PendingPaymentQueue.Entry(fp, "EXPENSE", 100, "Zomato", "GPay", ts, false);
    }

    @Test
    public void queueDoesNotStoreTheSameDetectionTwice() {
        List<PendingPaymentQueue.Entry> q = new ArrayList<>();
        assertTrue(PendingPaymentQueue.add(q, entry("a", T), T));
        assertFalse(PendingPaymentQueue.add(q, entry("a", T + 1), T + 1));
        assertEquals(1, q.size());
    }

    @Test
    public void queueExpiresEntriesAfterSevenDays() {
        List<PendingPaymentQueue.Entry> q = new ArrayList<>();
        PendingPaymentQueue.add(q, entry("old", T), T);
        PendingPaymentQueue.prune(q, T + PendingPaymentQueue.TTL_MS + 1);
        assertTrue(q.isEmpty());
    }

    @Test
    public void queueIsBounded() {
        List<PendingPaymentQueue.Entry> q = new ArrayList<>();
        for (int i = 0; i < PendingPaymentQueue.MAX_ENTRIES + 10; i++) {
            PendingPaymentQueue.add(q, entry("fp" + i, T + i), T + i);
        }
        assertEquals(PendingPaymentQueue.MAX_ENTRIES, q.size());
        assertNotEquals("fp0", q.get(0).fingerprint);
    }

    @Test
    public void resolvedDetectionIsRemoved() {
        List<PendingPaymentQueue.Entry> q = new ArrayList<>();
        PendingPaymentQueue.add(q, entry("a", T), T);
        PendingPaymentQueue.add(q, entry("b", T), T);
        assertTrue(PendingPaymentQueue.remove(q, "a"));
        assertFalse(PendingPaymentQueue.remove(q, "a"));
        assertEquals(1, q.size());
    }
}
