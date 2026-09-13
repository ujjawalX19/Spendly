package com.spendly.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import com.spendly.app.PaymentNotificationParser.Kind;
import com.spendly.app.PaymentNotificationParser.Result;

import org.junit.Test;

/**
 * Wording taken from real GPay / PhonePe / Paytm / bank notifications.
 *
 * The cases that matter most are the negative ones. Every assertion here that
 * expects UNKNOWN or FAILED represents a phantom expense the previous
 * implementation would have written into the user's ledger.
 */
public class PaymentNotificationParserTest {

    private static final String GPAY = "com.google.android.apps.nbu.paisa.user";
    private static final String PHONEPE = "com.phonepe.app";
    private static final String PAYTM = "net.one97.paytm";
    private static final String HDFC = "com.snapwork.hdfc";

    private static Result parse(String pkg, String title, String text) {
        return PaymentNotificationParser.parse(pkg, title, text, null, 1_700_000_000_000L);
    }

    // ── Outgoing payments ───────────────────────────────────────────────────

    @Test
    public void detectsSimpleUpiPayment() {
        Result r = parse(GPAY, "Payment successful", "You paid ₹250 to Zomato");
        assertEquals(Kind.EXPENSE, r.kind);
        assertEquals(250.0, r.amount, 0.001);
        assertEquals("Zomato", r.merchant);
        assertFalse(r.needsConfirmation);
    }

    @Test
    public void parsesCommaGroupedAndDecimalAmounts() {
        assertEquals(1200.0, parse(PHONEPE, "Paid", "You paid Rs.1,200 to Swiggy").amount, 0.001);
        assertEquals(1499.5, parse(PHONEPE, "Paid", "You paid Rs 1,499.50 to BigBasket").amount, 0.001);
        assertEquals(100000.0, parse(HDFC, "Debit", "INR 1,00,000 debited from A/c to Builder Ltd").amount, 0.001);
    }

    @Test
    public void handlesBankDebitWording() {
        Result r = parse(HDFC, "HDFC Bank", "Rs.899.00 has been debited from your account to NETFLIX");
        assertEquals(Kind.EXPENSE, r.kind);
        assertEquals(899.0, r.amount, 0.001);
        assertEquals("NETFLIX", r.merchant);
    }

    @Test
    public void handlesMerchantNamesWithPunctuation() {
        assertEquals("McDonald's", parse(GPAY, "Paid", "You paid ₹320 to McDonald's via UPI").merchant);
        assertEquals("Reliance Smart & Fresh",
                parse(GPAY, "Paid", "You paid ₹1,020 to Reliance Smart & Fresh for groceries").merchant);
    }

    // ── Incoming money must never become spending ───────────────────────────

    @Test
    public void moneyReceivedIsIncomeNotExpense() {
        Result r = parse(GPAY, "Payment received", "₹500 received from Rahul Sharma");
        assertEquals(Kind.INCOME, r.kind);
        assertEquals(500.0, r.amount, 0.001);
        assertEquals("Rahul Sharma", r.merchant);
    }

    @Test
    public void bankCreditIsIncome() {
        Result r = parse(HDFC, "HDFC Bank", "Rs.45,000.00 is credited to your A/c from ACME PAYROLL");
        assertEquals(Kind.INCOME, r.kind);
        assertEquals(45000.0, r.amount, 0.001);
    }

    @Test
    public void refundIsClassifiedSeparately() {
        Result r = parse(PAYTM, "Refund", "Refund of ₹349 has been credited to your Paytm wallet");
        assertEquals(Kind.REFUND, r.kind);
        assertEquals(349.0, r.amount, 0.001);
    }

    @Test
    public void cashbackReceivedIsRefundNotExpense() {
        Result r = parse(PHONEPE, "Cashback", "Cashback of ₹25 received on your payment");
        assertEquals(Kind.REFUND, r.kind);
    }

    // ── Failures must never be recorded ─────────────────────────────────────

    @Test
    public void failedPaymentIsNotAnExpense() {
        for (String body : new String[] {
                "Your payment of ₹250 to Zomato failed",
                "Payment of Rs.1,200 was declined",
                "Transaction of ₹500 could not be completed",
                "₹300 payment unsuccessful due to insufficient balance",
        }) {
            Result r = parse(GPAY, "Payment", body);
            assertEquals("should not record: " + body, Kind.FAILED, r.kind);
            assertFalse(r.isRecordable());
        }
    }

    @Test
    public void failureWinsOverPaymentWording() {
        // Contains "paid" but also "failed" — the failure must dominate.
        Result r = parse(GPAY, "Failed", "You paid ₹250 to Zomato — transaction failed");
        assertEquals(Kind.FAILED, r.kind);
    }

    // ── Non-transactions ────────────────────────────────────────────────────

    @Test
    public void paymentRequestIsNotAPayment() {
        for (String body : new String[] {
                "Rahul is requesting ₹500",
                "You have a payment request of ₹1,200 from Priya",
                "Reminder: ₹800 payment request from Amit",
        }) {
            Result r = parse(GPAY, "Request", body);
            assertEquals("should ignore: " + body, Kind.UNKNOWN, r.kind);
            assertFalse(r.isRecordable());
        }
    }

    @Test
    public void marketingIsIgnored() {
        for (String body : new String[] {
                "Get ₹200 cashback on your next recharge",
                "Win up to ₹1,000 — scratch card inside",
                "Flat ₹150 off on your first order",
                "Congratulations! You won a voucher worth ₹500",
        }) {
            Result r = parse(PAYTM, "Offer", body);
            assertEquals("should ignore: " + body, Kind.UNKNOWN, r.kind);
        }
    }

    @Test
    public void balanceUpdateIsIgnored() {
        Result r = parse(HDFC, "HDFC Bank", "Your available balance is Rs.12,340.55");
        assertEquals(Kind.UNKNOWN, r.kind);
    }

    @Test
    public void scheduledFuturePaymentIsIgnored() {
        Result r = parse(HDFC, "Autopay", "Rs.499 will be debited on 05-Apr for Netflix autopay");
        assertEquals(Kind.UNKNOWN, r.kind);
    }

    @Test
    public void unsupportedAppIsIgnored() {
        Result r = parse("com.random.game", "You won", "You paid ₹500 to the shop");
        assertEquals(Kind.UNKNOWN, r.kind);
    }

    @Test
    public void textWithoutAnAmountIsIgnored() {
        assertEquals(Kind.UNKNOWN, parse(GPAY, "Payment successful", "You paid Zomato").kind);
    }

    @Test
    public void emptyNotificationIsIgnored() {
        assertEquals(Kind.UNKNOWN, parse(GPAY, null, null).kind);
        assertEquals(Kind.UNKNOWN, parse(GPAY, "", "").kind);
    }

    // ── Amount selection ────────────────────────────────────────────────────

    @Test
    public void ignoresTrailingBalanceWhenPickingTheAmount() {
        Result r = parse(HDFC, "HDFC Bank",
                "Rs.250.00 debited from A/c XX1234 to SWIGGY. Avl Bal Rs.12,340.55");
        assertEquals(Kind.EXPENSE, r.kind);
        assertEquals(250.0, r.amount, 0.001);
    }

    @Test
    public void flagsGenuinelyAmbiguousAmountsForConfirmation() {
        Result r = parse(GPAY, "Split", "You paid ₹250 of the ₹750 bill at Barbeque Nation");
        assertEquals(Kind.EXPENSE, r.kind);
        assertTrue("two plausible amounts should require confirmation", r.needsConfirmation);
    }

    @Test
    public void flagsLargeAmountsForConfirmation() {
        Result r = parse(GPAY, "Paid", "You paid ₹85,000 to Landlord");
        assertEquals(Kind.EXPENSE, r.kind);
        assertTrue(r.needsConfirmation);
    }

    @Test
    public void flagsMissingPayeeForConfirmation() {
        Result r = parse(PHONEPE, "Debited", "₹430 debited");
        assertEquals(Kind.EXPENSE, r.kind);
        assertEquals("Unknown", r.merchant);
        assertTrue(r.needsConfirmation);
    }

    @Test
    public void rejectsAbsurdAmounts() {
        assertEquals(Kind.UNKNOWN, parse(GPAY, "Paid", "You paid ₹99,99,99,999 to X").kind);
    }

    // ── Direction precedence ────────────────────────────────────────────────

    @Test
    public void earliestVerbDecidesDirection() {
        // Bank phrasing that mentions both sides of the same transfer.
        Result r = parse(HDFC, "HDFC Bank", "Rs.200 debited from your A/c and credited to Rahul");
        assertEquals(Kind.EXPENSE, r.kind);
    }

    // ── Deduplication ───────────────────────────────────────────────────────

    @Test
    public void identicalRepostsShareAFingerprint() {
        long t = 1_700_000_000_000L;
        Result a = PaymentNotificationParser.parse(GPAY, "Paid", "You paid ₹250 to Zomato", null, t);
        Result b = PaymentNotificationParser.parse(GPAY, "Paid", "You paid ₹250 to Zomato", null, t + 3_000);
        assertEquals(a.fingerprint, b.fingerprint);
    }

    @Test
    public void theSamePaymentSeenByTwoAppsCollides() {
        // GPay and the bank both announce one payment seconds apart.
        long t = 1_700_000_000_000L;
        Result viaGpay = PaymentNotificationParser.parse(GPAY, "Paid", "You paid ₹250 to Zomato", null, t);
        Result viaBank = PaymentNotificationParser.parse(HDFC, "HDFC Bank",
                "Rs.250.00 debited from A/c to Zomato", null, t + 8_000);
        assertEquals(viaGpay.fingerprint, viaBank.fingerprint);
    }

    @Test
    public void differentAmountsDoNotCollide() {
        long t = 1_700_000_000_000L;
        Result a = PaymentNotificationParser.parse(GPAY, "Paid", "You paid ₹250 to Zomato", null, t);
        Result b = PaymentNotificationParser.parse(GPAY, "Paid", "You paid ₹260 to Zomato", null, t);
        assertNotEquals(a.fingerprint, b.fingerprint);
    }

    @Test
    public void differentMerchantsDoNotCollide() {
        long t = 1_700_000_000_000L;
        Result a = PaymentNotificationParser.parse(GPAY, "Paid", "You paid ₹250 to Zomato", null, t);
        Result b = PaymentNotificationParser.parse(GPAY, "Paid", "You paid ₹250 to Swiggy", null, t);
        assertNotEquals(a.fingerprint, b.fingerprint);
    }

    @Test
    public void aGenuineRepeatPurchaseLaterIsNotADuplicate() {
        long t = 1_700_000_000_000L;
        Result morning = PaymentNotificationParser.parse(GPAY, "Paid", "You paid ₹250 to Zomato", null, t);
        Result evening = PaymentNotificationParser.parse(GPAY, "Paid", "You paid ₹250 to Zomato",
                null, t + 6 * 60 * 60 * 1000L);
        assertNotEquals(morning.fingerprint, evening.fingerprint);
    }

    @Test
    public void bucketStraddlingEventsStillCollide() {
        // Two reports of one payment landing either side of a bucket boundary.
        long window = PaymentNotificationParser.DEDUPE_WINDOW_MS;
        long justBefore = (1_700_000_000_000L / window) * window - 1_000;
        long justAfter = justBefore + 5_000;

        Result a = PaymentNotificationParser.parse(GPAY, "Paid", "You paid ₹250 to Zomato", null, justBefore);
        String[] laterKeys = PaymentNotificationParser.fingerprintsFor(
                Kind.EXPENSE, 250.0, "Zomato", justAfter);

        boolean collides = laterKeys[0].equals(a.fingerprint) || laterKeys[1].equals(a.fingerprint);
        assertTrue("a repost across a bucket boundary must still be caught", collides);
    }

    @Test
    public void incomeAndExpenseOfTheSameAmountDoNotCollide() {
        long t = 1_700_000_000_000L;
        Result out = PaymentNotificationParser.parse(GPAY, "Paid", "You paid ₹250 to Rahul", null, t);
        Result in = PaymentNotificationParser.parse(GPAY, "Received", "₹250 received from Rahul", null, t);
        assertNotEquals(out.fingerprint, in.fingerprint);
    }

    // ── Robustness ──────────────────────────────────────────────────────────

    @Test
    public void neverThrowsOnHostileInput() {
        String[] nasty = {
            "₹", "Rs.", "INR", "₹₹₹₹", "paid to", "received from",
            "You paid ₹ to ", "₹0 paid to Zomato", "₹-50 paid",
            "  paid ₹10 to X", "a".repeat(5000) + " ₹10 paid to Y",
        };
        for (String s : nasty) {
            Result r = PaymentNotificationParser.parse(GPAY, "T", s, null, 1L);
            assertFalse("must not invent a zero/negative expense: " + s,
                    r.isRecordable() && r.amount <= 0);
        }
    }

    @Test
    public void recognisesTheAppItCameFrom() {
        assertEquals("GPay", PaymentNotificationParser.appNameFor(GPAY));
        assertEquals("PhonePe", PaymentNotificationParser.appNameFor(PHONEPE));
        assertEquals("HDFC Bank", PaymentNotificationParser.appNameFor(HDFC));
        assertTrue(PaymentNotificationParser.isSupportedPackage(PAYTM));
        assertFalse(PaymentNotificationParser.isSupportedPackage("com.random.game"));
        assertFalse(PaymentNotificationParser.isSupportedPackage(null));
    }
}
