package com.vittova.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * HomeWidgetProvider — the "Safe to spend today" widget. It draws the last
 * snapshot the app handed over (HomeWidgetPlugin) and opens the app on a tap.
 * It holds no token and makes no network requests.
 */
public class HomeWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "vittova_home_widget";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        render(context, manager, ids);
    }

    static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, HomeWidgetProvider.class));
        render(context, manager, ids);
    }

    private static void render(Context context, AppWidgetManager manager, int[] ids) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
        format.setTimeZone(TimeZone.getTimeZone("Asia/Kolkata"));
        String value = HomeWidgetText.value(
                prefs.getString("amount", null), prefs.getString("day", null),
                prefs.getBoolean("showAmount", false), format.format(new Date()));

        Intent open = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        for (int id : ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_home);
            views.setTextViewText(R.id.widget_title, HomeWidgetText.TITLE);
            views.setTextViewText(R.id.widget_value, value);
            views.setOnClickPendingIntent(R.id.widget_root, tap);
            manager.updateAppWidget(id, views);
        }
    }
}
