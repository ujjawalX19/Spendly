package com.vittova.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * DebitRemindersPlugin — local "expected debit tomorrow" reminders.
 *
 * The server computes which recurring payments are due (lib/recurringAudit);
 * the device only shows the notification at the time given. Nothing is sent
 * anywhere: no push service, no third party.
 *
 *   checkPermission() / requestPermission() -> { display: 'granted'|'denied'|'prompt' }
 *       POST_NOTIFICATIONS on Android 13+, asked only when the user turns
 *       reminders on.
 *   schedule({ reminders: [{ id, title, body, notifyAt }] })  replaces all
 *   cancelAll()
 *   event "reminderOpened" { route }  when the user taps a reminder
 *
 * Alarms are inexact (setAndAllowWhileIdle): no exact-alarm permission, and
 * "about 24 hours before" is what the wording promises. Alarms do not survive
 * a reboot; the app re-schedules them every time it opens.
 */
@CapacitorPlugin(
        name = "DebitReminders",
        permissions = { @Permission(alias = "display", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class DebitRemindersPlugin extends Plugin {

    static final String PREFS = "vittova_debit_reminders";
    static final String KEY_IDS = "request_codes";
    static final String EXTRA_ROUTE = "vittova_route";
    static final int MAX_REMINDERS = 20;

    @Override
    public void load() {
        super.load();
        deliverOpenedRoute(getActivity() != null ? getActivity().getIntent() : null);
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        deliverOpenedRoute(intent);
    }

    private void deliverOpenedRoute(Intent intent) {
        if (intent == null) return;
        String route = intent.getStringExtra(EXTRA_ROUTE);
        // Only this app's own reminder route is honoured.
        if ("/subscription-audit".equals(route)) {
            intent.removeExtra(EXTRA_ROUTE);
            JSObject data = new JSObject();
            data.put("route", route);
            notifyListeners("reminderOpened", data, true);
        }
    }

    private String displayState() {
        if (Build.VERSION.SDK_INT < 33) {
            return NotificationManagerCompat.from(getContext()).areNotificationsEnabled() ? "granted" : "denied";
        }
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return "granted";
        PermissionState state = getPermissionState("display");
        return state == PermissionState.DENIED ? "denied" : "prompt";
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject r = new JSObject();
        r.put("display", displayState());
        call.resolve(r);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || "granted".equals(displayState())) {
            checkPermission(call);
            return;
        }
        requestPermissionForAlias("display", call, "permissionResult");
    }

    @PermissionCallback
    private void permissionResult(PluginCall call) {
        checkPermission(call);
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        JSArray list = call.getArray("reminders");
        cancelScheduled(getContext());
        AlarmManager alarms = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        Set<String> codes = new HashSet<>();
        int scheduled = 0;
        try {
            for (int i = 0; list != null && i < list.length() && scheduled < MAX_REMINDERS; i++) {
                JSONObject r = list.getJSONObject(i);
                long at = r.getLong("notifyAt");
                if (at <= System.currentTimeMillis()) continue;
                int code = r.getString("id").hashCode();
                Intent intent = new Intent(getContext(), DebitReminderReceiver.class)
                        .putExtra(DebitReminderReceiver.EXTRA_ID, code)
                        .putExtra(DebitReminderReceiver.EXTRA_TITLE, limit(r.getString("title"), 80))
                        .putExtra(DebitReminderReceiver.EXTRA_BODY, limit(r.getString("body"), 240));
                PendingIntent pi = PendingIntent.getBroadcast(getContext(), code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                codes.add(String.valueOf(code));
                scheduled++;
            }
        } catch (Exception e) {
            call.reject("Invalid reminders");
            return;
        }
        prefs(getContext()).edit().putStringSet(KEY_IDS, codes).apply();
        JSObject r = new JSObject();
        r.put("scheduled", scheduled);
        call.resolve(r);
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        cancelScheduled(getContext());
        call.resolve();
    }

    private static String limit(String s, int max) {
        return s == null ? "" : (s.length() > max ? s.substring(0, max) : s);
    }

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void cancelScheduled(Context ctx) {
        AlarmManager alarms = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        for (String code : prefs(ctx).getStringSet(KEY_IDS, new HashSet<>())) {
            int c = Integer.parseInt(code);
            PendingIntent pi = PendingIntent.getBroadcast(ctx, c, new Intent(ctx, DebitReminderReceiver.class),
                    PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
            if (pi != null) {
                alarms.cancel(pi);
                pi.cancel();
            }
        }
        prefs(ctx).edit().remove(KEY_IDS).apply();
    }
}
