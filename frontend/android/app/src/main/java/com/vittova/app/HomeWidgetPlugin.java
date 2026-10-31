package com.vittova.app;

import android.content.Context;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * HomeWidgetPlugin — the app hands the widget one figure, or clears it.
 *
 *   update({ amount, day, showAmount })
 *   clear()   at sign-out, so the widget shows nothing about the last account
 */
@CapacitorPlugin(name = "HomeWidget")
public class HomeWidgetPlugin extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        Context context = getContext();
        context.getSharedPreferences(HomeWidgetProvider.PREFS, Context.MODE_PRIVATE).edit()
                .putString("amount", call.getString("amount"))
                .putString("day", call.getString("day"))
                .putBoolean("showAmount", Boolean.TRUE.equals(call.getBoolean("showAmount", false)))
                .apply();
        HomeWidgetProvider.refresh(context);
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        Context context = getContext();
        context.getSharedPreferences(HomeWidgetProvider.PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        HomeWidgetProvider.refresh(context);
        call.resolve();
    }
}
