package com.spendly.app;

import android.content.Intent;
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
 *        Opens Android's Notification Access screen. The web layer must only
 *        call this from an explicit user tap.
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
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open notification settings");
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
        // Exact package match. The previous substring check on the secure
        // setting could report access for a different app whose package name
        // merely contained ours.
        result.put("granted", NotificationManagerCompat.getEnabledListenerPackages(getContext())
            .contains(getContext().getPackageName()));
        call.resolve(result);
    }
}
