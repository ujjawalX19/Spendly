package com.vittova.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.vittova.app.PaymentNotificationParser.Kind;
import com.vittova.app.PaymentNotificationParser.Result;

import org.junit.Test;

import java.util.ArrayList;
import java.util.List;

/**
 * Bank debit SMS. The messages below follow the formats Indian banks use for
 * UPI, card and account debits (amounts, names and references are made up).
 * A missed SMS is an expense the user adds by hand; a misread one corrupts
 * their numbers, so every negative case matters as much as the positive ones.
 */
public class BankSmsParserTest {

    private static final long T = 1_760_000_000_000L;

    private static Result sms(String sender, String body) {
        assertTrue("sender should be accepted: " + sender, SmsSources.isBusinessSender(sender));
        return PaymentNotificationParser.parseSms(sender, body, T);
    }

    private static void debit(Result r, double amount, String payee) {
        assertEquals(r.reason, Kind.EXPENSE, r.kind);
        assertEquals(amount, r.amount, 0.001);
        assertEquals(payee, r.merchant);
    }

    // ── Who may be read ─────────────────────────────────────────────────────

    @Test
    public void onlyBusinessSenderIdsAreRead() {
        for (String ok : new String[] { "VM-HDFCBK", "AX-SBIUPI", "JD-ICICIT-S", "VK-AXISBK-T", "BZ-KOTAKB", "HDFCBK", "vm-hdfcbk" }) {
            assertTrue(ok, SmsSources.isBusinessSender(ok));
        }
        for (String person : new String[] { "+919876543210", "9876543210", "09876543210", "56767", "123456",
                "VM-AMAZON-P", "Rahul", "someone@example.com", "", null }) {
            assertFalse(String.valueOf(person), SmsSources.isBusinessSender(person));
        }
    }

    @Test
    public void banksAreNamedFromTheirSenderId() {
        assertEquals("HDFC Bank", SmsSources.bankName("VM-HDFCBK"));
        assertEquals("SBI", SmsSources.bankName("AX-SBIUPI"));
        assertEquals("SBI Card", SmsSources.bankName("VM-SBICRD"));
        assertEquals("ICICI Bank", SmsSources.bankName("JD-ICICIT-S"));
        assertEquals("Bank SMS", SmsSources.bankName("VM-ZXYWVU"));
        assertEquals("sms:HDFCBK", SmsSources.sourceKey("VM-HDFCBK-S"));
    }

    // ── Debits, bank by bank ────────────────────────────────────────────────

    @Test
    public void hdfcUpiDebit() {
        Result r = sms("VM-HDFCBK", "Sent Rs.250.00\nFrom HDFC Bank A/C *1234\nTo SWIGGY\nOn 29/09/26\nRef 412345678901\n"
            + "Not You?\nCall 18002586161/SMS BLOCK UPI to 7308080808");
        debit(r, 250, "SWIGGY");
        assertEquals("HDFC Bank", r.appName);
        assertEquals("412345678901", r.reference);
        assertFalse(r.needsConfirmation);
    }

    @Test
    public void sbiUpiDebitWithoutACurrencySymbol() {
        Result r = sms("AX-SBIUPI", "Dear UPI user A/C X1234 debited by 250.0 on date 29Sep26 trf to SWIGGY Refno 412345678901. "
            + "If not u? call 1800111109. -SBI");
        debit(r, 250, "SWIGGY");
        assertEquals("412345678901", r.reference);
    }

    @Test
    public void iciciDebitNamesThePayeeBeforeCredited() {
        Result r = sms("JD-ICICIT", "ICICI Bank Acct XX123 debited for Rs 250.00 on 29-Sep-26; SWIGGY credited. UPI:412345678901. "
            + "Call 18002662 for dispute. SMS BLOCK 123 to 9215676766.");
        debit(r, 250, "SWIGGY");
        assertEquals("412345678901", r.reference);
    }

    @Test
    public void axisDebitWithUpiPath() {
        Result r = sms("VK-AXISBK", "INR 250.00 debited\nA/c no. XX1234\n29-09-26, 14:03:11\nUPI/P2M/412345678901/SWIGGY\n"
            + "Not you? SMS BLOCKUPI Cust ID to 919951860002\nAxis Bank");
        debit(r, 250, "SWIGGY");
        assertEquals("412345678901", r.reference);
    }

    @Test
    public void kotakDebitToAUpiIdKeepsOnlyTheHandle() {
        Result r = sms("BZ-KOTAKB", "Sent Rs.250.00 from Kotak Bank AC X1234 to swiggy@icici on 29-09-26.UPI Ref 412345678901. "
            + "Not you, https://kotak.com/KBANKT/Fraud");
        // Only the handle is kept, shown as a name rather than "swiggy".
        debit(r, 250, "Swiggy");
    }

    @Test
    public void aUpiHandleIsShownAsAName() {
        assertEquals("Uber", PaymentNotificationParser.cleanPayee("uber@okaxis"));
        assertEquals("Swiggy Instamart", PaymentNotificationParser.cleanPayee("swiggy.instamart@icici"));
        assertEquals("Blinkit Store", PaymentNotificationParser.cleanPayee("blinkit_store@ybl"));
        // A handle with its own capitals is left alone.
        assertEquals("PhonePeMerchant", PaymentNotificationParser.cleanPayee("PhonePeMerchant@ybl"));
        // A phone-number handle is still never shown.
        assertEquals("UPI transfer", PaymentNotificationParser.cleanPayee("9876543210@ybl"));
    }

    @Test
    public void aPhoneNumberInAUpiIdIsNeverStored() {
        Result r = sms("BZ-KOTAKB", "Sent Rs.500.00 from Kotak Bank AC X1234 to 9876543210@ybl on 29-09-26.UPI Ref 412345678902.");
        debit(r, 500, "UPI transfer");
        assertFalse(r.merchant.contains("9876543210"));
    }

    @Test
    public void pnbDebitWithoutAPayeeIsStillCertain() {
        Result r = sms("VM-PNBSMS", "A/c XX1234 debited INR 250.00 Dt 29-09-26 14:03 thru UPI:412345678901. Bal INR 12,345.00 "
            + "Not u?Fwd this SMS to 9264092640 to block UPI.-PNB");
        debit(r, 250, "Unknown");
        assertFalse("a bank debit without a payee is not uncertain", r.needsConfirmation);
        assertEquals("412345678901", r.reference);
    }

    @Test
    public void bankOfBarodaIgnoresBothBalances() {
        Result r = sms("VM-BOBTXN", "Rs.250.00 transferred from A/c ...1234 to:UPI/412345678901. Total Bal:Rs.12345.00CR. "
            + "Avlbl Amt:Rs.12345.00(29-09-2026 14:03:11) - Bank of Baroda");
        debit(r, 250, "Unknown");
        assertFalse(r.needsConfirmation);
        assertEquals("412345678901", r.reference);
    }

    @Test
    public void canaraDebitWithPathAndBalance() {
        Result r = sms("VM-CANBNK", "An amount of INR 250.00 has been DEBITED to your account XXX1234 on 29/09/2026 towards "
            + "UPI/P2M/412345678901/SWIGGY. Total Avail.bal INR 12,345.00. - Canara Bank");
        debit(r, 250, "SWIGGY");
    }

    @Test
    public void cardSpendNamesTheMerchantAfterAt() {
        Result r = sms("VM-SBICRD", "Rs.1,299.00 spent on your SBI Credit Card ending 1234 at AMAZON on 29/09/26. "
            + "Trxn. not done by you? Report at https://sbicard.com/Dispute");
        debit(r, 1299, "AMAZON");
        assertEquals("SBI Card", r.appName);
    }

    @Test
    public void atmCashIsAlwaysConfirmedByTheUser() {
        Result r = sms("VM-HDFCBK", "Rs.2000 withdrawn at ATM S1ACWN12 on 29-09-26 from A/c XX1234. Avl Bal Rs 12,345.00");
        assertEquals(Kind.EXPENSE, r.kind);
        assertEquals(2000, r.amount, 0.001);
        assertEquals("Cash withdrawal", r.merchant);
        assertTrue(r.needsConfirmation);
    }

    @Test
    public void aLargeDebitIsConfirmedByTheUser() {
        assertTrue(sms("VM-HDFCBK", "Sent Rs.40,000.00\nFrom HDFC Bank A/C *1234\nTo LANDLORD\nOn 29/09/26\nRef 412345678903").needsConfirmation);
    }

    // ── Never an expense ────────────────────────────────────────────────────

    @Test
    public void oneTimePasswordsAreNeverPayments() {
        assertEquals(Kind.UNKNOWN, sms("VM-HDFCBK", "123456 is the OTP for your transaction of Rs.1,299.00 at AMAZON on HDFC Bank "
            + "Card 1234. OTP valid for 5 mins. Do not share with anyone.").kind);
        assertEquals(Kind.UNKNOWN, sms("JD-ICICIT", "OTP for txn of INR 1,299.00 at AMAZON on ICICI Bank Card XX1234 is 482913.").kind);
        assertEquals(Kind.UNKNOWN, sms("AX-SBIUPI", "Your OTP is 482913 to authorise Rs 500 on SBI UPI.").kind);
    }

    @Test
    public void aDebitWithAnOtpSafetyWarningIsStillAPayment() {
        Result r = sms("VK-AXISBK", "INR 250.00 debited\nA/c no. XX1234\nUPI/P2M/412345678901/SWIGGY\nNever share your OTP with anyone. Axis Bank");
        debit(r, 250, "SWIGGY");
    }

    @Test
    public void creditsAreIncomeNotSpending() {
        assertEquals(Kind.INCOME, sms("VM-HDFCBK", "Dear Customer, Rs.500.00 credited to your A/c XX1234 on 29-09-26 by UPI ref 412345678901").kind);
        assertEquals(Kind.INCOME, sms("AX-SBIUPI", "Dear SBI UPI User, ur A/cX1234 credited by Rs500 on 29Sep26 by (Ref no 412345678901)").kind);
    }

    @Test
    public void offersRemindersMandatesAndFailuresAreIgnored() {
        assertEquals(Kind.UNKNOWN, sms("VM-HDFCBK", "Get Rs 500 cashback on your first UPI payment! Offer valid till 30 Sep. T&C apply").kind);
        assertEquals(Kind.UNKNOWN, sms("VM-HDFCBK", "Your UPI-Mandate for Rs.649.00 towards NETFLIX is successfully created. Mandate created on 29-09-26").kind);
        assertEquals(Kind.UNKNOWN, sms("VM-SBICRD", "Your SBI Card statement is ready. Total amount due Rs 5,000. Pay by 10 Oct.").kind);
        assertEquals(Kind.UNKNOWN, sms("VM-HDFCBK", "Rs.649.00 will be debited from your A/c XX1234 on 01-10-26 towards NETFLIX").kind);
        assertEquals(Kind.FAILED, sms("VM-HDFCBK", "Your UPI transaction of Rs.250.00 to SWIGGY has failed. Amount if debited will be reversed.").kind);
    }

    @Test
    public void aMandateDebitItselfIsAPayment() {
        Result r = sms("VM-HDFCBK", "Rs.649.00 debited from A/c XX1234 on 01-10-26 towards NETFLIX (UPI Mandate). UPI Ref 412345678904");
        assertEquals(Kind.EXPENSE, r.kind);
        assertEquals(649, r.amount, 0.001);
    }

    // ── One payment, two announcements ──────────────────────────────────────

    @Test
    public void aGooglePayNotificationAndTheBankSmsAreOneExpense() {
        List<PendingPaymentQueue.Payment> queue = new ArrayList<>();
        List<PendingPaymentQueue.Payment> done = new ArrayList<>();
        String gpay = "com.google.android.apps.nbu.paisa.user";
        Result app = PaymentNotificationParser.parse(gpay, "Payment", "You paid ₹250 to Swiggy", null, T);
        assertEquals(PendingPaymentQueue.AddResult.ADDED,
            PendingPaymentQueue.add(queue, done, PendingPaymentQueue.fromParse(app, gpay, "UPI_APP", T), T));
        Result bank = PaymentNotificationParser.parseSms("VM-HDFCBK", "Sent Rs.250.00\nFrom HDFC Bank A/C *1234\nTo SWIGGY\nOn 29/09/26\nRef 412345678901", T + 20_000);
        assertEquals(PendingPaymentQueue.AddResult.DUPLICATE,
            PendingPaymentQueue.add(queue, done, PendingPaymentQueue.fromParse(bank, SmsSources.sourceKey("VM-HDFCBK"), "BANK_SMS", T + 20_000), T + 20_000));
        assertEquals(1, queue.size());
    }

    @Test
    public void theSameSmsSeenLiveAndInTheInboxHasOneId() {
        String body = "Dear UPI user A/C X1234 debited by 250.0 on date 29Sep26 trf to SWIGGY Refno 412345678901. -SBI";
        PendingPaymentQueue.Payment live = PendingPaymentQueue.fromParse(
            PaymentNotificationParser.parseSms("AX-SBIUPI", body, T), SmsSources.sourceKey("AX-SBIUPI"), "BANK_SMS", T);
        PendingPaymentQueue.Payment inbox = PendingPaymentQueue.fromParse(
            PaymentNotificationParser.parseSms("AX-SBIUPI", body, T), SmsSources.sourceKey("AX-SBIUPI"), "BANK_SMS", T);
        assertEquals(live.id, inbox.id);
        List<PendingPaymentQueue.Payment> queue = new ArrayList<>();
        List<PendingPaymentQueue.Payment> done = new ArrayList<>();
        assertEquals(PendingPaymentQueue.AddResult.ADDED, PendingPaymentQueue.add(queue, done, live, T));
        assertEquals(PendingPaymentQueue.AddResult.DUPLICATE, PendingPaymentQueue.add(queue, done, inbox, T));
    }

    @Test
    public void twoRealDebitsOfTheSameAmountAreKept() {
        List<PendingPaymentQueue.Payment> queue = new ArrayList<>();
        List<PendingPaymentQueue.Payment> done = new ArrayList<>();
        for (String ref : new String[] { "412345678901", "412345678902" }) {
            Result r = PaymentNotificationParser.parseSms("AX-SBIUPI", "Dear UPI user A/C X1234 debited by 20.0 on date 29Sep26 trf to TEA STALL Refno " + ref + ". -SBI", T);
            PendingPaymentQueue.add(queue, done, PendingPaymentQueue.fromParse(r, SmsSources.sourceKey("AX-SBIUPI"), "BANK_SMS", T), T);
        }
        assertEquals(2, queue.size());
    }

    @Test
    public void theStoredEntryHoldsNoSmsText() throws Exception {
        Result r = sms("VM-HDFCBK", "Sent Rs.250.00\nFrom HDFC Bank A/C *1234\nTo SWIGGY\nOn 29/09/26\nRef 412345678901\nNot You? Call 18002586161");
        List<PendingPaymentQueue.Payment> queue = new ArrayList<>();
        queue.add(PendingPaymentQueue.fromParse(r, SmsSources.sourceKey("VM-HDFCBK"), "BANK_SMS", T));
        String saved = PaymentJson.write(queue);
        assertFalse(saved.contains("412345678901"));
        assertFalse(saved.contains("*1234"));
        assertFalse(saved.contains("18002586161"));
        assertFalse(saved.toLowerCase().contains("not you"));
    }

    @Test
    public void tailTextIsNeverReadAsAPayee() {
        String head = PaymentNotificationParser.smsHead("Rs 250 debited. Not you? Fwd this SMS to 9264092640 to block UPI");
        assertFalse(head.toLowerCase().contains("block"));
    }
}
