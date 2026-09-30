package com.vittova.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/** When DebitReminderBootReceiver re-arms a stored reminder after a reboot. */
public class DebitReminderRearmTest {

    private static final long NOW = 1_790_000_000_000L;
    private static final long HOUR = 60L * 60 * 1000;
    private static final long GRACE = DebitRemindersPlugin.LATE_GRACE_MS;

    @Test
    public void aReminderStillAheadKeepsItsTime() {
        assertEquals(NOW + 5 * HOUR, DebitRemindersPlugin.armTime(NOW + 5 * HOUR, NOW, GRACE));
    }

    @Test
    public void aReminderMissedWhileThePhoneWasOffIsShownSoon() {
        assertEquals(NOW + 60_000L, DebitRemindersPlugin.armTime(NOW - 2 * HOUR, NOW, GRACE));
        assertEquals(NOW + 60_000L, DebitRemindersPlugin.armTime(NOW - GRACE, NOW, GRACE));
    }

    @Test
    public void aReminderMissedByMoreThanTheGraceIsDropped() {
        assertEquals(-1L, DebitRemindersPlugin.armTime(NOW - GRACE - 1, NOW, GRACE));
        assertEquals(-1L, DebitRemindersPlugin.armTime(NOW - 30 * HOUR, NOW, GRACE));
    }

    @Test
    public void whenTheAppSchedulesNothingPastIsArmed() {
        // DebitRemindersPlugin.schedule passes no grace: past reminders are skipped.
        assertEquals(-1L, DebitRemindersPlugin.armTime(NOW - 1, NOW, 0L));
        assertEquals(-1L, DebitRemindersPlugin.armTime(NOW, NOW, 0L));
    }
}
