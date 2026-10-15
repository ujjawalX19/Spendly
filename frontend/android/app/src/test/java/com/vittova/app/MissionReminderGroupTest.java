package com.vittova.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * v1.14 mission reminders share DebitRemindersPlugin with debit reminders but
 * must never disturb them: separate stored lists, a separate alarm action and
 * channel, and no reminder for a day that has ended.
 */
public class MissionReminderGroupTest {

    private static final long NOW = 1_790_000_000_000L;
    private static final long HOUR = 60L * 60 * 1000;

    @Test
    public void debitRemindersKeepTheStoredKeysTheyHadBeforeV114() {
        // Phones updated from v1.1 still find their scheduled debit reminders.
        assertEquals("request_codes", DebitRemindersPlugin.keyIds(DebitRemindersPlugin.GROUP_DEBIT));
        assertEquals("reminders", DebitRemindersPlugin.keyList(DebitRemindersPlugin.GROUP_DEBIT));
        assertEquals(DebitRemindersPlugin.LATE_GRACE_MS, DebitRemindersPlugin.lateGrace(DebitRemindersPlugin.GROUP_DEBIT));
    }

    @Test
    public void missionRemindersAreStoredApart() {
        assertNotEquals(DebitRemindersPlugin.keyIds(DebitRemindersPlugin.GROUP_DEBIT), DebitRemindersPlugin.keyIds(DebitRemindersPlugin.GROUP_MISSION));
        assertNotEquals(DebitRemindersPlugin.keyList(DebitRemindersPlugin.GROUP_DEBIT), DebitRemindersPlugin.keyList(DebitRemindersPlugin.GROUP_MISSION));
        assertNotEquals(DebitReminderReceiver.CHANNEL_ID, DebitReminderReceiver.MISSION_CHANNEL_ID);
    }

    @Test
    public void onlyKnownGroupsAndRoutesAreAccepted() {
        assertTrue(DebitRemindersPlugin.isGroup("debit"));
        assertTrue(DebitRemindersPlugin.isGroup("mission"));
        assertFalse(DebitRemindersPlugin.isGroup("marketing"));
        assertFalse(DebitRemindersPlugin.isGroup(null));
        assertTrue(DebitRemindersPlugin.ROUTES.contains("/rewards"));
        assertTrue(DebitRemindersPlugin.ROUTES.contains("/subscription-audit"));
        assertFalse(DebitRemindersPlugin.ROUTES.contains("https://example.com"));
        assertFalse(DebitRemindersPlugin.ROUTES.contains("/settings"));
    }

    @Test
    public void aMissionReminderIsNeverArmedForADayThatHasEnded() {
        long midnight = NOW + 3 * HOUR;
        assertFalse(DebitRemindersPlugin.expired(NOW + HOUR, midnight));
        assertTrue(DebitRemindersPlugin.expired(midnight, midnight));
        assertTrue(DebitRemindersPlugin.expired(midnight + 1, midnight));
        // No expiry (debit reminders, or older stored lists): never expired.
        assertFalse(DebitRemindersPlugin.expired(NOW + 100 * HOUR, 0L));
    }

    @Test
    public void aMissionReminderMissedWhileThePhoneWasOffGetsOnlyAShortGrace() {
        long grace = DebitRemindersPlugin.lateGrace(DebitRemindersPlugin.GROUP_MISSION);
        assertEquals(HOUR, grace);
        assertEquals(NOW + 60_000L, DebitRemindersPlugin.armTime(NOW - 30 * 60_000L, NOW, grace));
        assertEquals(-1L, DebitRemindersPlugin.armTime(NOW - 2 * HOUR, NOW, grace));
    }
}
