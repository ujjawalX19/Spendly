package com.spendly.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * PaymentNotificationListener
 *
 * Extends Android's NotificationListenerService to passively intercept
 * active push notifications from UPI payment apps.
 *
 * IMPORTANT: This service does NOT read SMS messages. It only receives
 * notifications that are already displayed in the notification shade.
 *
 * The user must explicitly grant Notification Access via:
 *   Settings → Apps → Special App Access → Notification Access → Spendly
 */
public class PaymentNotificationListener extends NotificationListenerService {

    private static final String TAG = "SpendlyNLS";

    // ── Target UPI App Package Names ───────────────────────────────────────
    private static final Set<String> UPI_PACKAGES = new HashSet<String>() {{
        add("com.google.android.apps.nbu.paisa.user"); // GPay
        add("com.phonepe.app");                         // PhonePe
        add("net.one97.paytm");                         // Paytm
        add("in.org.npci.upiapp");                      // BHIM UPI (bonus)
        add("com.amazon.mShop.android.shopping");       // Amazon Pay (bonus)
    }};

    // ── Regex: Capture INR amounts (₹50, Rs.1,200, INR 500.00) ────────────
    // Handles: ₹ / Rs / Rs. / INR prefix, optional space, digits with commas,
    //          optional decimal part
    private static final Pattern AMOUNT_PATTERN = Pattern.compile(
        "(?:₹|Rs\\.?|INR)\\s*([\\d,]+(?:\\.\\d{1,2})?)",
        Pattern.CASE_INSENSITIVE
    );

    // ── Regex: Capture merchant/payee name ────────────────────────────────
    // Handles: "to Zomato", "paid to HDFC", "sent to Swiggy", "at McDonald's"
    private static final Pattern MERCHANT_PATTERN = Pattern.compile(
        "(?:paid\\s+to|sent\\s+to|to|at|towards)\\s+([A-Za-z0-9 &\\.@'\\-]+?)(?:\\.|,|$|\\s+(?:via|using|on|for))",
        Pattern.CASE_INSENSITIVE
    );

    // ── Human-readable app name map ────────────────────────────────────────
    private String getAppName(String packageName) {
        switch (packageName) {
            case "com.google.android.apps.nbu.paisa.user": return "GPay";
            case "com.phonepe.app":                         return "PhonePe";
            case "net.one97.paytm":                         return "Paytm";
            case "in.org.npci.upiapp":                      return "BHIM";
            case "com.amazon.mShop.android.shopping":       return "Amazon Pay";
            default:                                        return "UPI";
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            if (sbn == null) return;

            final String packageName = sbn.getPackageName();

            // Step 1: Filter — only process UPI app notifications
            if (!UPI_PACKAGES.contains(packageName)) return;

            // Step 2: Extract notification text
            Bundle extras = sbn.getNotification().extras;
            if (extras == null) return;

            CharSequence titleCS = extras.getCharSequence("android.title");
            CharSequence textCS  = extras.getCharSequence("android.text");
            CharSequence bigTextCS = extras.getCharSequence("android.bigText");

            String title   = titleCS   != null ? titleCS.toString()   : "";
            String body    = textCS    != null ? textCS.toString()    : "";
            String bigText = bigTextCS != null ? bigTextCS.toString() : "";

            // Combine all text for regex matching
            String fullText = title + " " + body + " " + bigText;

            Log.d(TAG, "UPI Notification from " + packageName + ": " + fullText);

            // Step 3: Extract amount using regex
            Matcher amountMatcher = AMOUNT_PATTERN.matcher(fullText);
            String rawAmount = null;
            double amount = 0;

            if (amountMatcher.find()) {
                rawAmount = amountMatcher.group(1);
                if (rawAmount != null) {
                    // Remove commas before parsing (₹1,200 → 1200)
                    amount = Double.parseDouble(rawAmount.replace(",", ""));
                }
            }

            // Skip if we couldn't parse a valid amount
            if (amount <= 0) {
                Log.d(TAG, "No valid amount found in notification, skipping.");
                return;
            }

            // Step 4: Extract merchant using regex
            Matcher merchantMatcher = MERCHANT_PATTERN.matcher(fullText);
            String merchant = "Unknown";

            if (merchantMatcher.find()) {
                String found = merchantMatcher.group(1);
                if (found != null) {
                    merchant = found.trim();
                }
            }

            // Step 5: Build payload and notify the Capacitor plugin
            String appName    = getAppName(packageName);
            long   timestamp  = sbn.getPostTime();

            Log.d(TAG, String.format(
                "Payment detected — App: %s | Amount: ₹%.2f | Merchant: %s",
                appName, amount, merchant
            ));

            // Delegate to plugin (static bridge method)
            UpiNotificationPlugin.notifyPayment(appName, amount, merchant, timestamp);

        } catch (Exception e) {
            // Never crash the service — just log
            Log.e(TAG, "Error processing notification: " + e.getMessage(), e);
        }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // Not needed — we only care about posted notifications
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        Log.d(TAG, "NotificationListenerService connected — Spendly is watching for UPI payments.");
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        Log.d(TAG, "NotificationListenerService disconnected.");
        // Request rebind to keep the service alive
        requestRebind(new ComponentName(this, PaymentNotificationListener.class));
    }
}
