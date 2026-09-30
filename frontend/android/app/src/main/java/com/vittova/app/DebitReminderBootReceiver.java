package com.vittova.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Android drops every alarm on a reboot (and can on an app update). This
 * re-arms the debit reminders that were scheduled before, from the list
 * DebitRemindersPlugin keeps on the phone, without Vittova being opened.
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
        try {
            DebitRemindersPlugin.rearmStored(context.getApplicationContext(), System.currentTimeMillis());
        } catch (Exception e) {
            Log.w("VittovaReminders", "Could not re-arm reminders: " + e.getClass().getSimpleName());
        }
    }
}
