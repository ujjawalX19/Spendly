package com.vittova.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Android drops every alarm on a reboot (and can on an app update). This
 * re-arms the debit and mission reminders that were scheduled before, from
 * the lists DebitRemindersPlugin keeps on the phone, without Vittova being
 * opened. Mission reminders past their expiry (a day that has ended) are
 * dropped, not shown late.
 *
 * Not exported: BOOT_COMPLETED and MY_PACKAGE_REPLACED come from the system.
 * It only sets alarms (no service, no network). Turning reminders off or
 * signing out clears the stored list, so nothing comes back after that.
 * Some phones (vivo, Xiaomi and others with auto-start controls) may still
 * hold back boot broadcasts until the app is opened once.
 */
public class DebitReminderBootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) return;
        // Each group separately: a problem with one never stops the other.
        for (String group : new String[] { DebitRemindersPlugin.GROUP_DEBIT, DebitRemindersPlugin.GROUP_MISSION, DebitRemindersPlugin.GROUP_ALERT }) {
            try {
                DebitRemindersPlugin.rearmStored(context.getApplicationContext(), group, System.currentTimeMillis());
            } catch (Exception e) {
                Log.w("VittovaReminders", "Could not re-arm " + group + " reminders: " + e.getClass().getSimpleName());
            }
        }
    }
}
