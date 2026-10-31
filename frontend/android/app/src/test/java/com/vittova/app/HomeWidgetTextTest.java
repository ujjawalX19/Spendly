package com.vittova.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class HomeWidgetTextTest {
    private static final String TODAY = "2026-11-01";

    @Test
    public void amountIsHiddenUnlessChosen() {
        assertEquals(HomeWidgetText.HIDDEN, HomeWidgetText.value("₹500", TODAY, false, TODAY));
        assertEquals("₹500", HomeWidgetText.value("₹500", TODAY, true, TODAY));
    }

    @Test
    public void signedOutOrClearedShowsNoFigure() {
        assertEquals(HomeWidgetText.SIGNED_OUT, HomeWidgetText.value(null, null, true, TODAY));
    }

    @Test
    public void yesterdaysFigureIsNeverShownAsToday() {
        assertEquals(HomeWidgetText.SIGNED_OUT, HomeWidgetText.value("₹500", "2026-10-31", true, TODAY));
    }
}
