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

import org.json.JSONArray;
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
 *   schedule({ reminders: [{ id, title, body, notifyAt, expiresAt? }], group? })  replaces the group
 *   cancelAll({ group? })
 *   event "reminderOpened" { route }  when the user taps a reminder
 *
 * Two groups, kept apart (v1.14): "debit" (the default, and the only group
 * before v1.14: its stored keys are unchanged) and "mission" (daily mission
 * and weekly recap reminders, planned by the app in lib/missionReminders).
 * Each group has its own stored list, its own alarm intents (missions carry
 * ACTION_MISSION, so their alarms never match a debit one) and its own
 * notification channel. Scheduling or cancelling one group never touches the
 * other. A reminder with an expiresAt is never armed at or after that time,
 * so a reboot cannot bring back a mission reminder for a day that has ended.
 *
 * Alarms are inexact (setAndAllowWhileIdle): no exact-alarm permission, and
 * "about 24 hours before" is what the wording promises. Android drops alarms
 * on a reboot, so the scheduled list is kept on the phone and
 * DebitReminderBootReceiver re-arms it at boot (and after an app update),
 * without Vittova being opened. The app still re-schedules from the server
 * whenever it opens.
 */
@CapacitorPlugin(
        name = "DebitReminders",
        permissions = { @Permission(alias = "display", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class DebitRemindersPlugin extends Plugin {

    static final String PREFS = "vittova_debit_reminders";
    static final String KEY_IDS = "request_codes";
    static final String KEY_LIST = "reminders";   // what is scheduled now: id code, title, body, notifyAt
    /** A reminder missed while the phone was off is still shown if at most this late. */
    static final long LATE_GRACE_MS = 6L * 60 * 60 * 1000;
    static final String EXTRA_ROUTE = "vittova_route";
    static final int MAX_REMINDERS = 20;

    static final String GROUP_DEBIT = "debit";
    static final String GROUP_MISSION = "mission";
    static final String ACTION_MISSION = "com.vittova.app.MISSION_REMINDER";
    static final String KEY_MISSION_IDS = "mission_request_codes";
    static final String KEY_MISSION_LIST = "mission_reminders";
    /** A mission reminder missed while the phone was off is shown only if at most an hour late. */
    static final long MISSION_LATE_GRACE_MS = 60L * 60 * 1000;
    /** The only screens a tapped reminder may open. */
    static final Set<String> ROUTES = new HashSet<>(java.util.Arrays.asList("/subscription-audit", "/rewards"));

    static boolean isGroup(String group) {
        return GROUP_DEBIT.equals(group) || GROUP_MISSION.equals(group);
    }

    static String keyIds(String group) {
        return GROUP_MISSION.equals(group) ? KEY_MISSION_IDS : KEY_IDS;
    }

    static String keyList(String group) {
        return GROUP_MISSION.equals(group) ? KEY_MISSION_LIST : KEY_LIST;
    }

    static long lateGrace(String group) {
        return GROUP_MISSION.equals(group) ? MISSION_LATE_GRACE_MS : LATE_GRACE_MS;
    }

    /** True when a reminder would fire at or after the time it stops being relevant. */
    static boolean expired(long at, long expiresAt) {
        return expiresAt > 0 && at >= expiresAt;
    }

    /** The alarm intent for a group. Mission alarms carry their own action, so they never match a debit alarm. */
    static Intent alarmIntent(Context ctx, String group) {
        Intent intent = new Intent(ctx, DebitReminderReceiver.class);
        if (GROUP_MISSION.equals(group)) intent.setAction(ACTION_MISSION);
        return intent;
    }

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
        // Only this app's own reminder routes are honoured.
        if (route != null && ROUTES.contains(route)) {
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
        String group = call.getString("group", GROUP_DEBIT);
        if (!isGroup(group)) {
            call.reject("Unknown reminder group");
            return;
        }
        JSArray list = call.getArray("reminders");
        JSONArray wanted = new JSONArray();
        try {
            for (int i = 0; list != null && i < list.length() && wanted.length() < MAX_REMINDERS; i++) {
                JSONObject r = list.getJSONObject(i);
                long at = r.getLong("notifyAt");
                long expiresAt = r.optLong("expiresAt", 0L);
                if (at <= System.currentTimeMillis() || expired(at, expiresAt)) continue;
                wanted.put(new JSONObject()
                        .put("code", r.getString("id").hashCode())
                        .put("title", limit(r.getString("title"), 80))
                        .put("body", limit(r.getString("body"), 240))
                        .put("notifyAt", at)
                        .put("expiresAt", expiresAt));
            }
        } catch (Exception e) {
            call.reject("Invalid reminders");
            return;
        }
        JSObject r = new JSObject();
        r.put("scheduled", arm(getContext(), group, wanted, System.currentTimeMillis(), 0L));
        call.resolve(r);
    }

    /** The debit group, as before v1.14. */
    static int arm(Context ctx, JSONArray list, long now, long lateGraceMs) {
        return arm(ctx, GROUP_DEBIT, list, now, lateGraceMs);
    }

    /**
     * Replace every scheduled alarm of `group` with `list` and remember it for
     * re-arming at boot. A reminder due before `now` is dropped unless it is at
     * most `lateGraceMs` late, in which case it is shown a minute from now; a
     * reminder at or past its expiresAt is dropped. Same request code for the
     * same reminder, and the group's old set is cancelled first, so calling this
     * again never duplicates an alarm.
     */
    static synchronized int arm(Context ctx, String group, JSONArray list, long now, long lateGraceMs) {
        cancelScheduled(ctx, group);
        AlarmManager alarms = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        Set<String> codes = new HashSet<>();
        JSONArray kept = new JSONArray();
        for (int i = 0; list != null && i < list.length(); i++) {
            try {
                JSONObject r = list.getJSONObject(i);
                long at = armTime(r.getLong("notifyAt"), now, lateGraceMs);
                if (at < 0 || expired(at, r.optLong("expiresAt", 0L))) continue;
                int code = r.getInt("code");
                Intent intent = alarmIntent(ctx, group)
                        .putExtra(DebitReminderReceiver.EXTRA_ID, code)
                        .putExtra(DebitReminderReceiver.EXTRA_TITLE, r.getString("title"))
                        .putExtra(DebitReminderReceiver.EXTRA_BODY, r.getString("body"));
                PendingIntent pi = PendingIntent.getBroadcast(ctx, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                codes.add(String.valueOf(code));
                kept.put(r);
            } catch (Exception ignored) {
                // A malformed stored entry is skipped, never fatal at boot.
            }
        }
        prefs(ctx).edit().putStringSet(keyIds(group), codes).putString(keyList(group), kept.toString()).commit();
        return codes.size();
    }

    /**
     * When to fire a reminder due at `at`: unchanged if still ahead; a minute
     * from now if it was missed by at most `lateGraceMs`; -1 (drop) otherwise.
     */
    static long armTime(long at, long now, long lateGraceMs) {
        if (at > now) return at;
        return lateGraceMs > 0 && now - at <= lateGraceMs ? now + 60_000L : -1L;
    }

    /**
     * A reminder has been shown: forget it, so a later re-arm (boot, app
     * update) does not treat it as missed and show it a second time.
     */
    static void markShown(Context ctx, int code) {
        markShown(ctx, GROUP_DEBIT, code);
    }

    static synchronized void markShown(Context ctx, String group, int code) {
        SharedPreferences p = prefs(ctx);
        Set<String> codes = new HashSet<>(p.getStringSet(keyIds(group), new HashSet<>()));
        codes.remove(String.valueOf(code));
        JSONArray kept = new JSONArray();
        try {
            JSONArray stored = new JSONArray(p.getString(keyList(group), "[]"));
            for (int i = 0; i < stored.length(); i++) {
                JSONObject r = stored.getJSONObject(i);
                if (r.optInt("code") != code) kept.put(r);
            }
        } catch (Exception ignored) {
            // Unreadable list: keeping nothing is safer than showing twice.
        }
        p.edit().putStringSet(keyIds(group), codes).putString(keyList(group), kept.toString()).commit();
    }

    /** At boot / after an update: re-arm the debit reminders scheduled before. */
    static int rearmStored(Context ctx, long now) {
        return rearmStored(ctx, GROUP_DEBIT, now);
    }

    /** At boot / after an update: re-arm what `group` had scheduled before. */
    static int rearmStored(Context ctx, String group, long now) {
        String stored = prefs(ctx).getString(keyList(group), null);
        if (stored == null) return 0;
        try {
            return arm(ctx, group, new JSONArray(stored), now, lateGrace(group));
        } catch (Exception e) {
            cancelScheduled(ctx, group);
            return 0;
        }
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        String group = call.getString("group", GROUP_DEBIT);
        if (!isGroup(group)) {
            call.reject("Unknown reminder group");
            return;
        }
        cancelScheduled(getContext(), group);
        call.resolve();
    }

    private static String limit(String s, int max) {
        return s == null ? "" : (s.length() > max ? s.substring(0, max) : s);
    }

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void cancelScheduled(Context ctx) {
        cancelScheduled(ctx, GROUP_DEBIT);
    }

    static synchronized void cancelScheduled(Context ctx, String group) {
        AlarmManager alarms = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        for (String code : prefs(ctx).getStringSet(keyIds(group), new HashSet<>())) {
            int c = Integer.parseInt(code);
            PendingIntent pi = PendingIntent.getBroadcast(ctx, c, alarmIntent(ctx, group),
                    PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
            if (pi != null) {
                alarms.cancel(pi);
                pi.cancel();
            }
        }
        prefs(ctx).edit().remove(keyIds(group)).remove(keyList(group)).commit();
    }
}
