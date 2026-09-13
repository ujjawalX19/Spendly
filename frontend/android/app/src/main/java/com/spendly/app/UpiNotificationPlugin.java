package com.spendly.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * UpiNotificationPlugin
 *
 * Capacitor plugin bridge that:
 *  1. Exposes requestNotificationPermission() to the React web layer
 *     — redirects user to Android Settings → Notification Access.
 *  2. Exposes checkPermission() to silently detect current permission state.
 *  3. Receives payment data from PaymentNotificationListener (static bridge)
 *     and fires a "paymentDetected" event to the JavaScript layer.
 *
 * Plugin name registered as "UpiNotification" — used in:
 *   import { registerPlugin } from '@capacitor/core';
 *   const UpiNotification = registerPlugin('UpiNotification');
 */
@CapacitorPlugin(name = "UpiNotification")
public class UpiNotificationPlugin extends Plugin {

    private static final String TAG = "UpiNotificationPlugin";

    // Static reference to the active plugin instance so that
    // PaymentNotificationListener (instantiated by Android, not Capacitor)
    // can call notifyListeners without needing a plugin reference.
    private static UpiNotificationPlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
        Log.d(TAG, "UpiNotificationPlugin loaded and registered.");
    }

    // ──────────────────────────────────────────────────────────────────────
    // Static bridge: called by PaymentNotificationListener
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Called from PaymentNotificationListener when a UPI payment is detected.
     * Fires a "paymentDetected" event to JavaScript listeners.
     */
    public static void notifyPayment(String appName, double amount,
                                     String merchant, long timestamp,
                                     String kind, boolean needsConfirmation,
                                     String fingerprint) {
        if (instance == null) {
            Log.w(TAG, "Plugin instance not ready — payment event dropped.");
            return;
        }

        try {
            JSObject payload = new JSObject();
            payload.put("app",       appName);
            payload.put("amount",    amount);
            payload.put("merchant",  merchant);
            payload.put("timestamp", timestamp);
            // EXPENSE | INCOME | REFUND — the JS layer must not assume spending.
            payload.put("kind",      kind);
            // When true the UI has to ask the user before saving anything.
            payload.put("needsConfirmation", needsConfirmation);
            // Stable key so the JS layer can suppress repeats across restarts.
            payload.put("fingerprint", fingerprint);

            instance.notifyListeners("paymentDetected", payload);
            // The payload contains an amount and a payee name. Never log it.
            Log.d(TAG, "paymentDetected event fired");

        } catch (Exception e) {
            Log.e(TAG, "Error notifying JS layer: " + e.getMessage(), e);
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Plugin Methods (callable from JavaScript)
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Opens Android Notification Access settings so the user can grant
     * the required permission. Cannot be granted programmatically by design.
     *
     * Usage (JS):
     *   await UpiNotification.requestNotificationPermission();
     */
    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Could not open notification settings: " + e.getMessage(), e);
            call.reject("Could not open notification settings: " + e.getMessage());
        }
    }

    /**
     * Silently checks if Notification Access is already granted for this app.
     * Does NOT prompt the user.
     *
     * Usage (JS):
     *   const { granted } = await UpiNotification.checkPermission();
     *
     * Returns: { granted: boolean }
     */
    @PluginMethod
    public void checkPermission(PluginCall call) {
        try {
            boolean granted = isNotificationAccessGranted(getContext());

            JSObject result = new JSObject();
            result.put("granted", granted);
            call.resolve(result);

        } catch (Exception e) {
            Log.e(TAG, "Error checking permission: " + e.getMessage(), e);
            call.reject("Error checking permission: " + e.getMessage());
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Explicit Permission API (clean names for the React permission hook)
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Checks if this app has Notification Listener access.
     * This is a dedicated, cleanly-named method for the permission banner flow.
     *
     * Usage (JS):
     *   const { granted } = await UpiNotification.hasNotificationAccess();
     *
     * Returns: { granted: boolean }
     */
    @PluginMethod
    public void hasNotificationAccess(PluginCall call) {
        try {
            boolean granted = isNotificationAccessGranted(getContext());
            JSObject result = new JSObject();
            result.put("granted", granted);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error checking notification access: " + e.getMessage(), e);
            call.reject("Error checking notification access: " + e.getMessage());
        }
    }

    /**
     * Opens the Android Notification Listener Settings screen so the user
     * can toggle the switch for this app.
     *
     * Usage (JS):
     *   await UpiNotification.openNotificationSettings();
     */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Could not open notification settings: " + e.getMessage(), e);
            call.reject("Could not open notification settings: " + e.getMessage());
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Private helpers
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Reads the "enabled_notification_listeners" secure setting to determine
     * if this app's NotificationListenerService is enabled.
     */
    private boolean isNotificationAccessGranted(Context context) {
        String enabledListeners = Settings.Secure.getString(
            context.getContentResolver(),
            "enabled_notification_listeners"
        );

        if (TextUtils.isEmpty(enabledListeners)) return false;

        // Check if our package name appears in the colon-separated list
        String packageName = context.getPackageName();
        String[] parts = enabledListeners.split(":");

        for (String part : parts) {
            if (part.contains(packageName)) return true;
        }

        return false;
    }
}
