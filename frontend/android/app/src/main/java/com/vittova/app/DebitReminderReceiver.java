package com.vittova.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Shows one reminder scheduled by DebitRemindersPlugin. Not exported: only
 * this app's own alarms can trigger it.
 *
 *  - Expected-debit reminders (no action): channel "debit_reminders"; tapping
 *    opens the subscription audit. Unchanged since v1.1.
 *  - Mission reminders (ACTION_MISSION, v1.14): channel "money_missions";
 *    tapping opens Rewards. Shown under their own notification tag, so they
 *    never replace a debit reminder that shares a number.
 */
public class DebitReminderReceiver extends BroadcastReceiver {

    static final String CHANNEL_ID = "debit_reminders";
    static final String MISSION_CHANNEL_ID = "money_missions";
    static final String MISSION_TAG = "mission";
    static final String ACTION_OPEN_MISSIONS = "com.vittova.app.OPEN_MISSIONS";
    static final String EXTRA_ID = "id";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_BODY = "body";

    @Override
    public void onReceive(Context context, Intent intent) {
        boolean mission = DebitRemindersPlugin.ACTION_MISSION.equals(intent.getAction());
        String group = mission ? DebitRemindersPlugin.GROUP_MISSION : DebitRemindersPlugin.GROUP_DEBIT;
        int id = intent.getIntExtra(EXTRA_ID, 0);
        // Due now: never re-arm this one again (boot or app update), shown or not.
        DebitRemindersPlugin.markShown(context.getApplicationContext(), group, id);
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return;
        String channel = mission ? MISSION_CHANNEL_ID : CHANNEL_ID;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel c = mission
                    ? new NotificationChannel(MISSION_CHANNEL_ID, "Daily mission reminders", NotificationManager.IMPORTANCE_DEFAULT)
                    : new NotificationChannel(CHANNEL_ID, "Expected debit reminders", NotificationManager.IMPORTANCE_DEFAULT);
            c.setDescription(mission
                    ? "Your daily money mission and weekly recap. Change or turn off in Vittova settings."
                    : "A reminder the day before a recurring payment is expected");
            context.getSystemService(NotificationManager.class).createNotificationChannel(c);
        }
        Intent open = new Intent(context, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(DebitRemindersPlugin.EXTRA_ROUTE, mission ? "/rewards" : "/subscription-audit");
        // A distinct action keeps a mission's tap target from replacing a debit one with the same number.
        if (mission) open.setAction(ACTION_OPEN_MISSIONS);
        PendingIntent content = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder n = new NotificationCompat.Builder(context, channel)
                .setSmallIcon(R.drawable.ic_stat_vittova)
                .setContentTitle(intent.getStringExtra(EXTRA_TITLE))
                .setContentText(intent.getStringExtra(EXTRA_BODY))
                .setStyle(new NotificationCompat.BigTextStyle().bigText(intent.getStringExtra(EXTRA_BODY)))
                .setContentIntent(content)
                .addAction(0, mission ? "Open missions" : "Review subscriptions", content)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        try {
            if (mission) NotificationManagerCompat.from(context).notify(MISSION_TAG, id, n.build());
            else NotificationManagerCompat.from(context).notify(id, n.build());
        } catch (SecurityException ignored) {
            // Permission revoked after scheduling.
        }
    }
}
