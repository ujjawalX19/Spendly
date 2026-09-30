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
 * The capture half of automatic payment tracking, from a posted notification
 * to what is stored on the device, including what survives the process being
 * killed (a save → reload round trip through the stored JSON).
 */
public class PaymentTrackingPipelineTest {

    private static final long T = 1_760_000_000_000L;
    private static final String GPAY = "com.google.android.apps.nbu.paisa.user";
    private static final String PHONEPE = "com.phonepe.app";
    private static final String HDFC = "com.snapwork.hdfc";

    private final List<PendingPaymentQueue.Payment> queue = new ArrayList<>();
    private final List<PendingPaymentQueue.Payment> done = new ArrayList<>();

    /** What the listener does for one notification: parse, then build the stored entry. */
    private static PendingPaymentQueue.Payment capture(String pkg, String title, String text, long t) {
        Result r = PaymentNotificationParser.parse(pkg, title, text, null, t);
        if (r.kind != Kind.EXPENSE) return null;
        return PendingPaymentQueue.fromParse(r, pkg, PaymentSources.typeFor(pkg).name(), t);
    }

    private PendingPaymentQueue.AddResult post(String pkg, String text, long t) {
        PendingPaymentQueue.Payment p = capture(pkg, "Payment", text, t);
        assertTrue("not captured as an expense: " + text, p != null);
        return PendingPaymentQueue.add(queue, done, p, t);
    }

    // ── Capture ─────────────────────────────────────────────────────────────

    @Test
    public void aClearPaymentIsQueuedForUpload() {
        PendingPaymentQueue.Payment p = capture(GPAY, "Payment successful", "You paid ₹150 to Chai Point", T);
        assertEquals(PendingPaymentQueue.PENDING_SYNC, p.status);
        assertEquals(150.0, p.amount, 0.001);
        assertEquals("Chai Point", p.merchant);
        assertEquals("GPay", p.app);
        assertTrue(p.id.matches("^[0-9a-f]{32}$"));
    }

    @Test
    public void anUncertainPaymentWaitsForReview() {
        // No payee: plausible, but the user decides.
        PendingPaymentQueue.Payment p = capture(GPAY, "Payment successful", "You paid ₹150", T);
        assertEquals(PendingPaymentQueue.NEEDS_REVIEW, p.status);
        // A very large amount.
        assertEquals(PendingPaymentQueue.NEEDS_REVIEW,
            capture(GPAY, "Paid", "You paid ₹40,000 to Landlord", T).status);
    }

    @Test
    public void incomeRefundsFailuresAndOffersAreNeverCaptured() {
        assertEquals(null, capture(GPAY, "Received", "₹500 received from Rahul", T));
        assertEquals(null, capture(PHONEPE, "Refund", "₹120 refunded to your account", T));
        assertEquals(null, capture(GPAY, "Payment failed", "Payment of ₹250 failed", T));
        assertEquals(null, capture(GPAY, "Offer", "Get ₹200 cashback this weekend", T));
        assertEquals(null, capture(GPAY, "Request", "Rahul is requesting ₹300", T));
    }

    @Test
    public void inrAndRupeeFormatsWithCommasAndDecimals() {
        assertEquals(1234.5, capture(HDFC, "Debit", "INR 1,234.50 debited from A/c XX1234 to AMAZON", T).amount, 0.001);
        assertEquals(100000.0, capture(HDFC, "Debit", "Rs. 1,00,000 debited from A/c XX9876 to ACME REALTY", T).amount, 0.001);
        assertEquals(49.0, capture(GPAY, "Paid", "you paid rs 49 to chai point", T).amount, 0.001);
    }

    // ── References ──────────────────────────────────────────────────────────

    @Test
    public void theTransactionReferenceIsReadButOnlyItsHashIsStored() {
        assertEquals("412345678901",
            PaymentNotificationParser.extractReference("Rs.250 debited to SWIGGY. UPI Ref No. 412345678901"));
        assertEquals("T2309261234567", PaymentNotificationParser.extractReference("Txn ID: T2309261234567"));
        assertEquals("", PaymentNotificationParser.extractReference("Rs.250 debited from A/c XX1234 to SWIGGY"));
        assertEquals("", PaymentNotificationParser.extractReference("Refund of Rs 250 processed"));

        PendingPaymentQueue.Payment p = capture(HDFC, "Debit", "Rs.250 debited from A/c XX1234 to SWIGGY. UPI Ref No. 412345678901", T);
        assertEquals(32, p.refHash.length());
        assertFalse(p.refHash.contains("412345678901"));
    }

    @Test
    public void twoPaymentsOfTheSameAmountWithDifferentReferencesAreBothKept() {
        assertEquals(PendingPaymentQueue.AddResult.ADDED,
            post(HDFC, "Rs 20 debited from A/c XX1234 to TEA STALL. UPI Ref 412345678901", T));
        assertEquals(PendingPaymentQueue.AddResult.ADDED,
            post(HDFC, "Rs 20 debited from A/c XX1234 to TEA STALL. UPI Ref 412345678902", T + 30_000));
        assertEquals(2, queue.size());
    }

    @Test
    public void theSameReferenceRepostedHoursLaterIsOneExpense() {
        post(HDFC, "Rs 250 debited from A/c XX1234 to SWIGGY. UPI Ref 412345678901", T);
        assertEquals(PendingPaymentQueue.AddResult.DUPLICATE,
            post(HDFC, "Rs 250 debited from A/c XX1234 to SWIGGY. UPI Ref 412345678901", T + 3 * 60 * 60 * 1000));
    }

    // ── Bank echoes ─────────────────────────────────────────────────────────

    @Test
    public void eachUpiPaymentAbsorbsOneBankEchoOnly() {
        assertEquals(PendingPaymentQueue.AddResult.ADDED, post(GPAY, "You paid ₹20 to Chai Point", T));
        assertEquals(PendingPaymentQueue.AddResult.ADDED, post(PHONEPE, "Paid ₹20 to Samosa Corner", T + 60_000));
        // The bank announces both payments, without references.
        assertEquals(PendingPaymentQueue.AddResult.DUPLICATE, post(HDFC, "Rs 20 debited from A/c XX1234", T + 90_000));
        assertEquals(PendingPaymentQueue.AddResult.DUPLICATE, post(HDFC, "Rs 20 debited from A/c XX1234 to VPA x@ybl", T + 120_000));
        // A third ₹20 bank debit has no UPI payment left to echo: it is a real, separate payment.
        assertEquals(PendingPaymentQueue.AddResult.ADDED, post(HDFC, "Rs 20 debited from A/c XX1234 to CANTEEN", T + 150_000));
        assertEquals(3, queue.size());
    }

    @Test
    public void twoUpiAppsPayingDifferentPeopleAreTwoPayments() {
        post(GPAY, "You paid ₹100 to Rahul", T);
        assertEquals(PendingPaymentQueue.AddResult.ADDED, post(PHONEPE, "Paid ₹100 to Priya", T + 30_000));
    }

    @Test
    public void aBankAlertLongAfterThePaymentIsNotTreatedAsAnEcho() {
        post(GPAY, "You paid ₹300 to Book Store", T);
        assertEquals(PendingPaymentQueue.AddResult.ADDED,
            post(HDFC, "Rs 300 debited from A/c XX1234 to BOOK STORE", T + PendingPaymentQueue.ECHO_WINDOW_MS + 1));
    }

    // ── Surviving a restart ─────────────────────────────────────────────────

    @Test
    public void queuedPaymentsAndDuplicateMemorySurviveTheProcessBeingKilled() throws Exception {
        post(GPAY, "You paid ₹150 to Chai Point", T);
        post(GPAY, "You paid ₹90 to Metro", T + 1_000);
        PendingPaymentQueue.resolve(queue, done, queue.get(0).id, "synced", T + 2_000);
        PendingPaymentQueue.markAttempt(queue, queue.get(0).id, "network", T + 3_000);

        // Process killed: only what was saved remains.
        List<PendingPaymentQueue.Payment> q2 = PaymentJson.read(PaymentJson.write(queue));
        List<PendingPaymentQueue.Payment> d2 = PaymentJson.read(PaymentJson.write(done));

        assertEquals(1, q2.size());
        assertEquals(PendingPaymentQueue.PENDING_SYNC, q2.get(0).status);
        assertEquals(1, q2.get(0).attempts);
        assertEquals("network", q2.get(0).lastError);
        assertEquals(1, d2.size());
        assertEquals("synced", d2.get(0).outcome);

        // The payment app reposts the already-uploaded notification: still one expense.
        PendingPaymentQueue.Payment repost = capture(GPAY, "Payment", "You paid ₹150 to Chai Point", T + 30_000);
        assertEquals(PendingPaymentQueue.AddResult.DUPLICATE, PendingPaymentQueue.add(q2, d2, repost, T + 30_000));
    }

    @Test
    public void storedDataHoldsNoNotificationTextOrReference() throws Exception {
        post(HDFC, "Rs.250 debited from A/c XX1234 to SWIGGY. UPI Ref No. 412345678901. Avl Bal Rs 12,340", T);
        String saved = PaymentJson.write(queue);
        assertFalse(saved.contains("412345678901"));
        assertFalse(saved.contains("XX1234"));
        assertFalse(saved.toLowerCase().contains("debited"));
        assertFalse(saved.contains("12,340"));
    }

    @Test
    public void detectionsFromBeforeThisVersionGoToReviewNotUpload() throws Exception {
        String legacy = "[{\"fingerprint\":\"EXPENSE|150.00|chaipoint|1\",\"kind\":\"EXPENSE\",\"amount\":150,"
            + "\"merchant\":\"Chai Point\",\"app\":\"GPay\",\"timestamp\":" + T + ",\"needsConfirmation\":false},"
            + "{\"fingerprint\":\"INCOME|500.00|rahul|1\",\"kind\":\"INCOME\",\"amount\":500,"
            + "\"merchant\":\"Rahul\",\"app\":\"GPay\",\"timestamp\":" + T + ",\"needsConfirmation\":false}]";
        List<PendingPaymentQueue.Payment> migrated = PaymentJson.readLegacy(legacy);
        assertEquals(1, migrated.size());
        assertEquals(PendingPaymentQueue.NEEDS_REVIEW, migrated.get(0).status);
    }

    @Test
    public void queueEntriesExpireButDoneEntriesAreKeptOnlyThreeDays() {
        post(GPAY, "You paid ₹150 to Chai Point", T);
        PendingPaymentQueue.resolve(queue, done, queue.get(0).id, "synced", T);
        PendingPaymentQueue.prune(queue, done, T + PendingPaymentQueue.DONE_TTL_MS + 1);
        assertTrue(done.isEmpty());
    }

    @Test
    public void failureCodesAreSanitised() {
        post(GPAY, "You paid ₹150 to Chai Point", T);
        PendingPaymentQueue.markAttempt(queue, queue.get(0).id, "HTTP 500: Chai Point <script>", T);
        assertTrue(queue.get(0).lastError.matches("^[a-z0-9_]*$"));
    }

    // ── Accounts ────────────────────────────────────────────────────────────

    @Test
    public void detectionsAreNeverUploadedToADifferentAccount() {
        String a = "6b1f5c1e-1111-4a4a-9b9b-000000000001";
        String b = "6b1f5c1e-1111-4a4a-9b9b-000000000002";
        assertEquals(PendingPaymentQueue.OwnerAction.CLAIM, PendingPaymentQueue.ownerAction(null, a));
        assertEquals(PendingPaymentQueue.OwnerAction.KEEP, PendingPaymentQueue.ownerAction(a, a));
        assertEquals(PendingPaymentQueue.OwnerAction.CLEAR, PendingPaymentQueue.ownerAction(a, b));
    }

    // ── Sources ─────────────────────────────────────────────────────────────

    @Test
    public void theDeviceTestSourceExistsOnlyInDebugBuilds() {
        // The release variant compiles src/release's empty list, the debug variant src/debug's.
        boolean debugSources = DebugFeatures.EXTRA_SOURCES.length > 0;
        assertEquals(debugSources, PaymentSources.isSupported("com.android.shell"));
        for (String[] row : DebugFeatures.EXTRA_SOURCES) {
            assertEquals("com.android.shell", row[0]);
        }
    }

    @Test
    public void everyAllowlistedAppHasAType() {
        assertEquals(PaymentSources.Type.UPI_APP, PaymentSources.typeFor(GPAY));
        assertEquals(PaymentSources.Type.BANK_APP, PaymentSources.typeFor(HDFC));
        assertEquals(null, PaymentSources.typeFor("com.whatsapp"));
        assertNotEquals(null, PaymentSources.typeFor("com.idfcfirstbank.optimus"));
    }
}
