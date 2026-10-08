/**
 * theme — which of the two looks is showing.
 *
 * Dark is Vittova's primary design and the default. Light is the same system
 * with lighter surfaces (index.css: the --v-* tokens under :root.light). A
 * person can choose Dark, Light, or "Match phone" in Profile.
 *
 * No imports, so it is unit tested in plain Node (tests/theme.test.js).
 */

export const THEME_KEY = 'vittova.theme';
export const THEME_CHOICES = ['dark', 'light', 'system'];
export const DEFAULT_CHOICE = 'dark';

/** A stored value → a valid choice. Anything unknown is the default. */
export function readChoice(stored) {
  return THEME_CHOICES.includes(stored) ? stored : DEFAULT_CHOICE;
}

/**
 * @param {'dark'|'light'|'system'} choice
 * @param {boolean} systemPrefersLight  the phone's own setting
 * @returns {'dark'|'light'}
 */
export function resolveTheme(choice, systemPrefersLight) {
  if (choice === 'light') return 'light';
  if (choice === 'system') return systemPrefersLight ? 'light' : 'dark';
  return 'dark';
}

/** The browser / status bar colour for each look (matches --v-bg). */
export const THEME_COLOR = { dark: '#000000', light: '#F3F3F3' };
