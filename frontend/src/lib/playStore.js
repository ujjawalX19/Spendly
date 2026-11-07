/**
 * The one verified Google Play listing for Vittova, used by every download
 * button on the website. Each placement is passed to Play as a campaign
 * referrer, so Play Console can show which button led to an install.
 */
import { track } from './telemetry';

export const PLAY_LISTING = 'https://play.google.com/store/apps/details?id=com.vittova.app';

/** The listing URL with campaign attribution. `placement` is lowercase words and underscores. */
export function playUrl(placement = 'website') {
  const referrer = `utm_source=vittova.in&utm_medium=website&utm_campaign=${placement}`;
  return `${PLAY_LISTING}&referrer=${encodeURIComponent(referrer)}`;
}

/** Records which download button was used. Never carries personal data. */
export function trackPlayClick(placement) {
  track('site_play_click', { code: placement });
}
