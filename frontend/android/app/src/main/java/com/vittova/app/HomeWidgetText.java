package com.vittova.app;

/**
 * What the Home screen widget says. Kept free of Android classes so the privacy
 * rules can be tested: no snapshot, or one from another day, shows no figure,
 * and a figure shows only if the person chose that.
 */
final class HomeWidgetText {
    static final String TITLE = "Safe to spend today";
    static final String HIDDEN = "Tap to view";
    static final String SIGNED_OUT = "Open Vittova";

    private HomeWidgetText() {}

    static String value(String amount, String snapshotDay, boolean showAmount, String today) {
        if (amount == null || snapshotDay == null) return SIGNED_OUT;
        if (!snapshotDay.equals(today)) return SIGNED_OUT;
        return showAmount ? amount : HIDDEN;
    }
}
