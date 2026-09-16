package com.spendly.app;

import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

/**
 * UpiNotificationPlugin — bridge between the notification listener and the
 * web layer.
 *
 *   checkPermission() / hasNotificationAccess()  -> { granted }
 *   requestNotificationPermission() / openNotificationSettings()
 *        Opens Android's Notification Access screen (Vittova's own page on
 *        Android 11+). The web layer must only call this from an explicit tap.
 *   openAppSettings()                             Vittova's App info screen, where
 *        Android 13+ offers ⋮ → "Allow restricted settings" for APK installs.
 *   getAccessInfo()   -> { granted, restrictedSettingsLikely, sdkInt }
 *   getPendingPayments()                          -> { payments: [...] }
 *   removePendingPayment({ fingerprint })        -> { removed }
 *   event "paymentDetected"                       live copy of a queued detection
 */
@CapacitorPlugin(name = "UpiNotification")
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

    static void notifyPayment(PendingPaymentQueue.Entry entry) {
        UpiNotificationPlugin plugin = instance;
        if (plugin == null) return;
        try {
            plugin.notifyListeners("paymentDetected", toJs(entry));
        } catch (Exception e) {
            Log.w(TAG, "Could not deliver a live payment event");
        }
    }

    private static JSObject toJs(PendingPaymentQueue.Entry e) {
        JSObject o = new JSObject();
        o.put("fingerprint", e.fingerprint);
        o.put("kind", e.kind);
        o.put("amount", e.amount);
        o.put("merchant", e.merchant);
        o.put("app", e.app);
        o.put("timestamp", e.timestamp);
        o.put("needsConfirmation", e.needsConfirmation);
        return o;
    }

    @PluginMethod
    public void getPendingPayments(PluginCall call) {
        try {
            List<PendingPaymentQueue.Entry> entries = PendingPaymentStore.list(getContext());
            JSArray payments = new JSArray();
            for (PendingPaymentQueue.Entry e : entries) payments.put(toJs(e));
            JSObject result = new JSObject();
            result.put("payments", payments);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not read pending payments");
        }
    }

    @PluginMethod
    public void removePendingPayment(PluginCall call) {
        String fingerprint = call.getString("fingerprint");
        if (fingerprint == null || fingerprint.isEmpty()) {
            call.reject("fingerprint is required");
            return;
        }
        JSObject result = new JSObject();
        result.put("removed", PendingPaymentStore.remove(getContext(), fingerprint));
        call.resolve(result);
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
