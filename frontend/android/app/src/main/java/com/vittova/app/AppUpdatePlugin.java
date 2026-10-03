package com.vittova.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.UpdateAvailability;

/**
 * AppUpdatePlugin — Google Play's in-app update, for a version people must not
 * stay on (see lib/appUpdate.js; the decision is made there, from the server's
 * minimum supported version).
 *
 *   check()           { available, inProgress, immediateAllowed, availableVersionCode }
 *   startImmediate()  Google Play's full-screen update; { result: 'updated' |
 *                     'cancelled' | 'failed' | 'not_available' }
 *   openStore()       Vittova's page in the Play Store app, when the in-app
 *                     update cannot run
 *
 * Google Play downloads and installs the update. Nothing is downloaded by the
 * app itself. On a copy not installed by Google Play (a sideloaded APK) Google
 * reports an error, which reaches the web layer as UNAVAILABLE.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    private AppUpdateManager manager;

    @Override
    public void load() {
        manager = AppUpdateManagerFactory.create(getContext());
    }

    /** What Google Play's answer means for the app. Kept apart so it can be unit-tested. */
    static String state(int availability) {
        if (availability == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS) return "in_progress";
        if (availability == UpdateAvailability.UPDATE_AVAILABLE) return "available";
        return "none";
    }

    /** startUpdateFlow's result code, in the web layer's words. */
    static String result(int resultCode) {
        if (resultCode == Activity.RESULT_OK) return "updated";
        if (resultCode == Activity.RESULT_CANCELED) return "cancelled";
        return "failed";
    }

    @PluginMethod
    public void check(PluginCall call) {
        manager.getAppUpdateInfo()
            .addOnSuccessListener(info -> {
                String state = state(info.updateAvailability());
                JSObject out = new JSObject();
                out.put("available", !"none".equals(state));
                out.put("inProgress", "in_progress".equals(state));
                out.put("immediateAllowed", info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE));
                out.put("availableVersionCode", info.availableVersionCode());
                call.resolve(out);
            })
            .addOnFailureListener(e -> call.reject("Google Play could not be asked for an update.", "UNAVAILABLE"));
    }

    @PluginMethod
    public void startImmediate(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No screen to show the update on.", "UNAVAILABLE");
            return;
        }
        manager.getAppUpdateInfo()
            .addOnSuccessListener(info -> {
                if ("none".equals(state(info.updateAvailability())) || !info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)) {
                    JSObject out = new JSObject();
                    out.put("result", "not_available");
                    call.resolve(out);
                    return;
                }
                start(info, activity, call);
            })
            .addOnFailureListener(e -> call.reject("Google Play could not be asked for an update.", "UNAVAILABLE"));
    }

    private void start(AppUpdateInfo info, Activity activity, PluginCall call) {
        manager.startUpdateFlow(info, activity, AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build())
            .addOnSuccessListener(code -> {
                if (call == null) return;
                JSObject out = new JSObject();
                out.put("result", result(code));
                call.resolve(out);
            })
            .addOnFailureListener(e -> {
                if (call != null) call.reject("The update could not be started.", "UNAVAILABLE");
            });
    }

    /**
     * An immediate update the person left half-way (they switched apps while
     * it downloaded) carries on when they come back, as Google requires.
     */
    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        Activity activity = getActivity();
        if (manager == null || activity == null) return;
        manager.getAppUpdateInfo().addOnSuccessListener(info -> {
            if (info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS) {
                start(info, activity, null);
            }
        });
    }

    @PluginMethod
    public void openStore(PluginCall call) {
        String id = getContext().getPackageName();
        Intent store = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + id))
            .setPackage("com.android.vending")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(store);
            call.resolve();
        } catch (ActivityNotFoundException noPlayStore) {
            call.reject("The Play Store is not available on this phone.", "UNAVAILABLE");
        }
    }
}
