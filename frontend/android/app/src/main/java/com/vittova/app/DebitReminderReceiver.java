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
 * Shows one "expected debit tomorrow" reminder scheduled by DebitRemindersPlugin.
 * Not exported: only this app's own alarms can trigger it. Tapping the
 * notification opens Vittova on the subscription audit.
 */
public class DebitReminderReceiver extends BroadcastReceiver {

    static final String CHANNEL_ID = "debit_reminders";
    static final String EXTRA_ID = "id";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_BODY = "body";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Expected debit reminders", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("A reminder the day before a recurring payment is expected");
            context.getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
        int id = intent.getIntExtra(EXTRA_ID, 0);
        Intent open = new Intent(context, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(DebitRemindersPlugin.EXTRA_ROUTE, "/subscription-audit");
        PendingIntent content = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder n = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_vittova)
                .setContentTitle(intent.getStringExtra(EXTRA_TITLE))
                .setContentText(intent.getStringExtra(EXTRA_BODY))
                .setStyle(new NotificationCompat.BigTextStyle().bigText(intent.getStringExtra(EXTRA_BODY)))
                .setContentIntent(content)
                .addAction(0, "Review subscriptions", content)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        try {
            NotificationManagerCompat.from(context).notify(id, n.build());
        } catch (SecurityException ignored) {
            // Permission revoked after scheduling.
        }
    }
}
