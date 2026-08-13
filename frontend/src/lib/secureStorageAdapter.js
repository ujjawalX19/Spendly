/**
 * secureStorageAdapter.js
 * ─────────────────────────────────────────────────────────────
 * A Supabase-compatible storage adapter that uses Capacitor's
 * SecureStorage on native platforms (Android/iOS) and falls
 * back to localStorage on web.
 *
 * SecureStorage uses Android Keystore / iOS Keychain under the
 * hood, providing hardware-backed encryption for JWT tokens.
 *
 * Usage: Pass this as `auth.storage` to createClient().
 */
import { Capacitor } from '@capacitor/core';

// Lazy-loaded SecureStorage reference
let SecureStorage = null;
let secureStorageAvailable = false;

/**
 * Initialize secure storage on native platforms.
 * Safe to call multiple times — will only init once.
 */
async function initSecureStorage() {
  if (SecureStorage !== null) return secureStorageAvailable;
  
  if (Capacitor.isNativePlatform()) {
    try {
      const mod = await import('@aparajita/capacitor-secure-storage');
      SecureStorage = mod.SecureStorage;
      secureStorageAvailable = true;
    } catch (e) {
      console.warn('[SecureStorage] Plugin not available, falling back to localStorage:', e.message);
      secureStorageAvailable = false;
    }
  }
  return secureStorageAvailable;
}

/**
 * Supabase SupportedStorage adapter.
 * Implements getItem, setItem, removeItem.
 */
export const secureStorageAdapter = {
  async getItem(key) {
    const ready = await initSecureStorage();
    if (ready) {
      try {
        const { value } = await SecureStorage.get({ key });
        return value;
      } catch {
        // Key doesn't exist yet — return null (Supabase expects this)
        return null;
      }
    }
    return localStorage.getItem(key);
  },

  async setItem(key, value) {
    const ready = await initSecureStorage();
    if (ready) {
      try {
        await SecureStorage.set({ key, value });
        return;
      } catch (e) {
        console.warn('[SecureStorage] setItem failed, falling back:', e.message);
      }
    }
    localStorage.setItem(key, value);
  },

  async removeItem(key) {
    const ready = await initSecureStorage();
    if (ready) {
      try {
        await SecureStorage.remove({ key });
        return;
      } catch (e) {
        console.warn('[SecureStorage] removeItem failed, falling back:', e.message);
      }
    }
    localStorage.removeItem(key);
  },
};
