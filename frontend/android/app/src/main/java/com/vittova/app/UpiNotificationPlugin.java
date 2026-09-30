package com.vittova.app;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.util.Log;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PermissionState;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.List;

/**
 * UpiNotificationPlugin — bridge between the payment-tracking store and the
 * web layer. The listener never needs this plugin: it captures and stores
 * payments on its own while the app is closed.
 *
 *   getTrackingInfo()  -> { granted, trackingEnabled, listenerConnected,
 *                           listenerChangedAt, restrictedSettingsLikely,
 *                           sdkInt, manufacturer }
 *        `granted` is Android's real Notification Access state, read fresh on
 *        every call; `trackingEnabled` is Vittova's own switch (on by default).
 *   setTrackingEnabled({ enabled })               Vittova's switch
 *   ensureListenerBound()                          ask Android to reconnect the
 *        listener if access is granted (after an OEM battery manager stopped it)
 *   getPendingPayments()  -> { payments: [...] }  queued detections
 *   resolvePendingPayment({ id, outcome })         "synced" | "dismissed" | "rejected"
 *   markSyncAttempt({ id, error })                 failed upload (short code)
 *   markForReview({ id })                           needs the user after all
 *   bindOwner({ userId })  -> { action }           "keep" | "claim" | "clear"
 *   clearTrackingData()                            on account deletion
 *   requestNotificationPermission() / openNotificationSettings()
 *        Opens Android's Notification Access screen (Vittova's own page on
 *        Android 11+). The web layer must only call this from an explicit tap.
 *   openAppSettings()                             Vittova's App info screen, where
 *        Android 13+ offers ⋮ → "Allow restricted settings" for APK installs
 *        and manufacturers put battery / background settings.
 *   checkPermission() / hasNotificationAccess() / getAccessInfo()   older names
 *   removePendingPayment({ fingerprint })         older name for "dismissed"
 *   event "paymentDetected"                       a detection was just queued
 */
@CapacitorPlugin(
    name = "UpiNotification",
    permissions = {
        @Permission(alias = "sms", strings = { Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS }),
    }
)
public class UpiNotificationPlugin extends Plugin {

    private static final String TAG = "UpiNotificationPlugin";

    // The live plugin instance, if the app is running. Notifications that
    // arrive while it is null are still kept in PendingPaymentStore.
    private static volatile UpiNotificationPlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        super.handleOnDestroy();
    }

    static void notifyPayment(PendingPaymentQueue.Payment payment) {
        UpiNotificationPlugin plugin = instance;
        if (plugin == null) return;
        try {
            plugin.notifyListeners("paymentDetected", toJs(payment));
        } catch (Exception e) {
            Log.w(TAG, "Could not deliver a live payment event");
        }
    }

    private static JSObject toJs(PendingPaymentQueue.Payment p) {
        JSObject o = new JSObject();
        o.put("id", p.id);
        o.put("fingerprint", p.id); // older web builds key on this
        o.put("kind", p.kind);
        o.put("amount", p.amount);
        o.put("merchant", p.merchant);
        o.put("app", p.app);
        o.put("timestamp", p.timestamp);
        o.put("needsConfirmation", p.needsConfirmation);
        o.put("status", p.status);
        o.put("attempts", p.attempts);
        o.put("lastError", p.lastError);
        return o;
    }

    @PluginMethod
    public void getPendingPayments(PluginCall call) {
        try {
            List<PendingPaymentQueue.Payment> entries = PendingPaymentStore.list(getContext());
            JSArray payments = new JSArray();
            for (PendingPaymentQueue.Payment p : entries) payments.put(toJs(p));
            JSObject result = new JSObject();
            result.put("payments", payments);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not read pending payments");
        }
    }

    @PluginMethod
    public void resolvePendingPayment(PluginCall call) {
        String id = call.getString("id");
        String outcome = call.getString("outcome", "dismissed");
        if (id == null || id.isEmpty() || !("synced".equals(outcome) || "dismissed".equals(outcome) || "rejected".equals(outcome))) {
            call.reject("id and a valid outcome are required");
            return;
        }
        JSObject result = new JSObject();
        result.put("removed", PendingPaymentStore.resolve(getContext(), id, outcome));
        call.resolve(result);
    }

    /** Older web builds: removing a detection meant the user logged or dismissed it. */
    @PluginMethod
    public void removePendingPayment(PluginCall call) {
        String id = call.getString("fingerprint");
        if (id == null || id.isEmpty()) {
            call.reject("fingerprint is required");
            return;
        }
        JSObject result = new JSObject();
        result.put("removed", PendingPaymentStore.resolve(getContext(), id, "dismissed"));
        call.resolve(result);
    }

    @PluginMethod
    public void markSyncAttempt(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("id is required");
            return;
        }
        JSObject result = new JSObject();
        result.put("updated", PendingPaymentStore.markAttempt(getContext(), id, call.getString("error", "")));
        call.resolve(result);
    }

    @PluginMethod
    public void markForReview(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("id is required");
            return;
        }
        JSObject result = new JSObject();
        result.put("updated", PendingPaymentStore.markForReview(getContext(), id));
        call.resolve(result);
    }

    @PluginMethod
    public void bindOwner(PluginCall call) {
        String userId = call.getString("userId");
        if (userId == null || !userId.matches("^[0-9a-fA-F-]{36}$")) {
            call.reject("a user id is required");
            return;
        }
        JSObject result = new JSObject();
        result.put("action", PendingPaymentStore.bindOwner(getContext(), userId));
        call.resolve(result);
    }

    @PluginMethod
    public void clearTrackingData(PluginCall call) {
        PendingPaymentStore.clearAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void setTrackingEnabled(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) {
            call.reject("enabled is required");
            return;
        }
        PendingPaymentStore.setTrackingEnabled(getContext(), enabled);
        if (enabled) requestRebind();
        call.resolve(trackingInfo());
    }

    @PluginMethod
    public void ensureListenerBound(PluginCall call) {
        if (isGranted() && PendingPaymentStore.trackingEnabled(getContext())) requestRebind();
        call.resolve(trackingInfo());
    }

    @PluginMethod
    public void getTrackingInfo(PluginCall call) {
        call.resolve(trackingInfo());
    }

    // ── Bank SMS ────────────────────────────────────────────────────────────

    /**
     * Android's SMS permission dialog. The web layer calls this only from a tap
     * on a screen that has just explained what is read and why.
     */
    @PluginMethod
    public void requestSmsPermission(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) {
            onSmsGranted();
            call.resolve(trackingInfo());
            return;
        }
        requestPermissionForAlias("sms", call, "smsPermissionResult");
    }

    @PermissionCallback
    private void smsPermissionResult(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) onSmsGranted();
        call.resolve(trackingInfo());
    }

    private void onSmsGranted() {
        PendingPaymentStore.markSmsGranted(getContext(), System.currentTimeMillis());
        PendingPaymentStore.setSmsEnabled(getContext(), true);
    }

    /** Vittova's own switch for bank SMS (on by default once access is granted). */
    @PluginMethod
    public void setSmsEnabled(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) {
            call.reject("enabled is required");
            return;
        }
        PendingPaymentStore.setSmsEnabled(getContext(), enabled);
        call.resolve(trackingInfo());
    }

    /** Catch up on bank SMS the receiver missed. Reads only messages since the last catch-up. */
    @PluginMethod
    public void scanSmsInbox(PluginCall call) {
        new Thread(() -> {
            int added = 0;
            try {
                if (SmsIntake.smsGranted(getContext())) PendingPaymentStore.markSmsGranted(getContext(), System.currentTimeMillis());
                added = SmsIntake.scanInbox(getContext());
            } catch (Exception e) {
                Log.w(TAG, "SMS catch-up failed");
            }
            JSObject result = new JSObject();
            result.put("added", added);
            call.resolve(result);
        }, "vittova-sms-scan").start();
    }

    private JSObject trackingInfo() {
        JSObject result = new JSObject();
        boolean smsGranted = SmsIntake.smsGranted(getContext());
        result.put("smsGranted", smsGranted);
        result.put("smsEnabled", PendingPaymentStore.smsEnabled(getContext()));
        // "prompt" | "prompt-with-rationale" | "denied" (Android will not ask again) | "granted"
        result.put("smsPermission", getPermissionState("sms") == null ? "prompt" : getPermissionState("sms").toString());
        result.put("granted", isGranted());
        result.put("trackingEnabled", PendingPaymentStore.trackingEnabled(getContext()));
        result.put("listenerConnected", PendingPaymentStore.listenerConnected(getContext()));
        result.put("listenerChangedAt", PendingPaymentStore.listenerChangedAt(getContext()));
        result.put("sdkInt", Build.VERSION.SDK_INT);
        result.put("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase(java.util.Locale.ROOT));
        result.put("restrictedSettingsLikely", InstallSource.restrictedSettingsLikely(Build.VERSION.SDK_INT, installerPackage()));
        return result;
    }

    /** Ask Android to (re)connect the listener. Harmless when it is already connected. */
    private void requestRebind() {
        try {
            NotificationListenerService.requestRebind(new ComponentName(getContext(), PaymentNotificationListener.class));
        } catch (Exception e) {
            Log.w(TAG, "Could not request a listener rebind");
        }
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        openSettings(call);
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        openSettings(call);
    }

    private void openSettings(PluginCall call) {
        // Android 11+: go straight to Vittova's toggle rather than the list of
        // every app. Some manufacturers lack that screen, so fall back.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                Intent detail = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS);
                detail.putExtra(
                    Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
                    new ComponentName(getContext(), PaymentNotificationListener.class).flattenToString());
                detail.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(detail);
                call.resolve();
                return;
            } catch (ActivityNotFoundException | SecurityException e) {
                // fall through to the list screen
            }
        }
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open notification settings");
        }
    }

    /** App info for Vittova: where "Allow restricted settings" lives on Android 13+. */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", getContext().getPackageName(), null));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open app settings");
        }
    }

    @PluginMethod
    public void getAccessInfo(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", isGranted());
        result.put("sdkInt", Build.VERSION.SDK_INT);
        result.put("restrictedSettingsLikely", InstallSource.restrictedSettingsLikely(Build.VERSION.SDK_INT, installerPackage()));
        call.resolve(result);
    }

    /** Package that installed Vittova, or null when unknown (e.g. a downloaded APK). */
    private String installerPackage() {
        try {
            PackageManager pm = getContext().getPackageManager();
            String pkg = getContext().getPackageName();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                return pm.getInstallSourceInfo(pkg).getInstallingPackageName();
            }
            return pm.getInstallerPackageName(pkg);
        } catch (Exception e) {
            return null;
        }
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        resolveGranted(call);
    }

    @PluginMethod
    public void hasNotificationAccess(PluginCall call) {
        resolveGranted(call);
    }

    private void resolveGranted(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", isGranted());
        call.resolve(result);
    }

    private boolean isGranted() {
        // Exact package match. The previous substring check on the secure
        // setting could report access for a different app whose package name
        // merely contained ours.
        return NotificationManagerCompat.getEnabledListenerPackages(getContext())
            .contains(getContext().getPackageName());
    }
}
