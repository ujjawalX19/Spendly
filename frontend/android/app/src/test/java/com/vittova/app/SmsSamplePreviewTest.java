package com.vittova.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/**
 * "See how it works" (SmsAccessSheet) shows what the real bank-SMS rules do
 * with built-in sample messages. These are the outcomes the screen promises,
 * so a change to the parser that breaks one of them must fail here.
 */
public class SmsSamplePreviewTest {

    private static final long T = 1_760_000_000_000L;

    private static String[] preview(int i) {
        return SmsIntake.preview(SmsIntake.SAMPLES[i][0], SmsIntake.SAMPLES[i][1], T);
    }

    @Test
    public void hdfcDebitIsRecognised() {
        String[] r = preview(0);
        assertEquals("debit", r[0]);
        assertEquals(250.0, Double.parseDouble(r[1]), 0.001);
        assertEquals("SWIGGY", r[2]);
        assertEquals("HDFC Bank", r[3]);
    }

    @Test
    public void sbiUpiDebitIsRecognised() {
        String[] r = preview(1);
        assertEquals("debit", r[0]);
        assertEquals(120.0, Double.parseDouble(r[1]), 0.001);
        assertEquals("TEA STALL", r[2]);
    }

    @Test
    public void otpIsSkipped() {
        assertEquals("skipped", preview(2)[0]);
    }

    @Test
    public void messageFromAPersonIsNeverRead() {
        assertEquals("not_read", preview(3)[0]);
    }

    @Test
    public void everySampleHasAnExpectedOutcome() {
        assertEquals(4, SmsIntake.SAMPLES.length);
    }
}
