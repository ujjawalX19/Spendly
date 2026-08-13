import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { UpiNotification } from '../plugins/UpiNotification';

/**
 * useNotificationPermission
 * 
 * Custom hook that manages the Notification Listener permission lifecycle:
 *  1. Checks permission on initial mount
 *  2. Re-checks automatically when the app returns to foreground
 *     (e.g. after the user toggles the switch in Android Settings)
 *  3. Exposes openSettings() to launch the Android Notification Listener screen
 * 
 * Returns:
 *   { isAndroid, hasAccess, loading, openSettings }
 */
export function useNotificationPermission() {
    const [isAndroid, setIsAndroid] = useState(false);
    const [hasAccess, setHasAccess] = useState(true); // default true to hide banner on web
    const [loading, setLoading] = useState(true);

    // ── Check permission once ─────────────────────────────────
    const checkAccess = useCallback(async () => {
        if (Capacitor.getPlatform() !== 'android') {
            setIsAndroid(false);
            setHasAccess(true);
            setLoading(false);
            return;
        }

        setIsAndroid(true);
        try {
            const { granted } = await UpiNotification.hasNotificationAccess();
            setHasAccess(granted);
        } catch (err) {
            console.error('[useNotificationPermission] Error checking access:', err);
            setHasAccess(false);
        } finally {
            setLoading(false);
        }
    }, []);

    // ── Initial check on mount ────────────────────────────────
    useEffect(() => {
        checkAccess();
    }, [checkAccess]);

    // ── Re-check when app comes back to foreground ────────────
    // Uses Capacitor's App plugin to listen for appStateChange.
    // When isActive becomes true (user returns from Settings), re-check.
    useEffect(() => {
        if (Capacitor.getPlatform() !== 'android') return;

        let appPlugin = null;
        let listener = null;

        const setup = async () => {
            try {
                // Dynamically import @capacitor/app so it doesn't break web builds
                // if the package isn't installed
                const { App } = await import('@capacitor/app');
                appPlugin = App;

                listener = await App.addListener('appStateChange', ({ isActive }) => {
                    if (isActive) {
                        // User just returned to the app — re-check permission
                        checkAccess();
                    }
                });
            } catch (err) {
                // @capacitor/app not installed or not available — fall back to
                // document visibility API
                console.warn('[useNotificationPermission] @capacitor/app not available, using visibilitychange fallback');

                const handleVisibility = () => {
                    if (document.visibilityState === 'visible') {
                        checkAccess();
                    }
                };
                document.addEventListener('visibilitychange', handleVisibility);

                // Store cleanup in listener shape
                listener = {
                    remove: () => document.removeEventListener('visibilitychange', handleVisibility)
                };
            }
        };

        setup();

        return () => {
            if (listener) listener.remove();
        };
    }, [checkAccess]);

    // ── Open Android Settings ─────────────────────────────────
    const openSettings = useCallback(async () => {
        try {
            await UpiNotification.openNotificationSettings();
        } catch (err) {
            console.error('[useNotificationPermission] Could not open settings:', err);
        }
    }, []);

    return {
        isAndroid,
        hasAccess,
        loading,
        openSettings,
        recheckAccess: checkAccess,
    };
}
