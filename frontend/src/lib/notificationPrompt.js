/**
 * Remembers the user's answer to the notification-access explanation, so a
 * "Not now" in onboarding or on the dashboard is respected everywhere.
 */
export const PROMPT_KEY = 'spendly.notificationPrompt.v1';

export function readNotificationPrompt() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PROMPT_KEY) || 'null');
    return parsed && typeof parsed.dismissedAt === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

export function recordNotificationPromptDismissed({ reminderDismissed = false } = {}) {
  const value = { dismissedAt: Date.now(), reminderDismissed };
  try { window.localStorage.setItem(PROMPT_KEY, JSON.stringify(value)); } catch { /* storage unavailable */ }
  return value;
}
