import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { UpiNotification } from '../plugins/UpiNotification';

export function usePaymentNotifications({ onPaymentDetected } = {}) {
  const [isSupported, setIsSupported] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);

  // 1. Initial Permission Check
  useEffect(() => {
    const initPlugin = async () => {
      if (Capacitor.getPlatform() !== 'android') {
        setIsSupported(false);
        return;
      }
      setIsSupported(true);
      
      try {
        const { granted } = await UpiNotification.checkPermission();
        setPermissionGranted(granted);
      } catch (err) {
        console.error("Error checking UPI Notification permission:", err);
      }
    };

    initPlugin();
  }, []);

  // 2. Setup Event Listener
  useEffect(() => {
    if (!isSupported || !permissionGranted) return;

    let listener = null;

    const setupListener = async () => {
      try {
        listener = await UpiNotification.addListener('paymentDetected', (payload) => {
          console.log("UPI Payment Detected:", payload);
          if (onPaymentDetected) {
            onPaymentDetected(payload);
          }
        });
      } catch (err) {
        console.error("Error setting up UPI Notification listener:", err);
      }
    };

    setupListener();

    // Cleanup on unmount
    return () => {
      if (listener) {
        listener.remove();
      }
    };
  }, [isSupported, permissionGranted, onPaymentDetected]);

  // 3. Request Permission Handler
  const requestPermission = useCallback(async () => {
    if (!isSupported) return;
    
    try {
      await UpiNotification.requestNotificationPermission();
      // We can't know immediately if they granted it because they are redirected
      // to settings. The app will resume later, so they can manually check again
      // or we can re-check on app resume.
    } catch (err) {
      console.error("Failed to request notification permission:", err);
    }
  }, [isSupported]);

  // Expose a manual check method for when the user returns from Settings
  const checkPermissionNow = useCallback(async () => {
    if (!isSupported) return false;
    try {
      const { granted } = await UpiNotification.checkPermission();
      setPermissionGranted(granted);
      return granted;
    } catch (err) {
      console.error("Error checking permission:", err);
      return false;
    }
  }, [isSupported]);

  return {
    isSupported,
    permissionGranted,
    requestPermission,
    checkPermissionNow
  };
}
