/**
 * The Vittova pulse mark: one definition for every place it is drawn.
 *
 * Two interlocking strokes in the 1254×1254 artboard of public/vittova-logo.svg,
 * white, the rising stroke drawn over the falling one. The app icon sets them
 * on the maroon-to-orange tile (TILE_GRADIENT); the launch screen sets them on
 * black.
 *
 * The launch mark (LAUNCH) is the mark centred in a 1728×1728 box drawn at
 * 288 dp: exactly how Android's launch screen draws
 * android/app/src/main/res/drawable/splash_mark.xml (Android draws the launch
 * icon in a 288 dp square and shows what falls inside its central 192 dp
 * circle). The web splash draws the same box at the same size and screen
 * position, so the hand-off from Android's screen to the app is invisible.
 * tests/launchMark.test.js keeps the two in step.
 */

export const STROKE_UP = 'M252 657 H398 Q430 657 446 624 L566 380 Q586 350 614 350 Q646 350 660 386 L744 636';
export const STROKE_DOWN = 'M590 618 L672 872 Q688 908 716 908 Q744 908 762 874 L870 674 Q888 648 918 648 H998';

export const STROKE_WIDTH = 116;
/** Width of the tile-coloured rim under the rising stroke (app-icon logo only). */
export const SEPARATION_WIDTH = 134;

/**
 * The pulse is white. It is still described as a vertical gradient (user space
 * y 320 → 950) because Android's launch vector, the web splash and the boot
 * frame all draw it that way and are checked against these stops.
 */
export const GRADIENT = Object.freeze([
  { offset: 0, color: '#FFFFFF' },
  { offset: 0.48, color: '#FFFFFF' },
  { offset: 1, color: '#FFFFFF' },
]);
export const GRADIENT_Y = Object.freeze([320, 950]);

/**
 * The app-icon tile: deep maroon into orange, top left to bottom right. The
 * same colours as the balance card (index.css: --v-card-a/b/c) and Android's
 * adaptive icon background (res/drawable/ic_launcher_tile.xml).
 */
export const TILE_GRADIENT = Object.freeze([
  { offset: 0, color: '#2E1613' },
  { offset: 0.46, color: '#A32716' },
  { offset: 1, color: '#F87000' },
]);
/** The warm colour of the launch glow and ripples (the tile's brightest stop). */
export const GLOW = '#F87000';

/** Android launch screen and web splash background (res/values: splash_background). */
export const LAUNCH_BACKGROUND = '#000000';

export const LAUNCH = Object.freeze({
  /** Viewport of the launch box. */
  viewport: 1728,
  /** Rendered size of the launch box, in dp (= CSS px in the WebView). */
  sizeDp: 288,
  /** Moves the mark's centre (625, 629) to the box centre (864, 864). */
  translateX: 239,
  translateY: 235,
});

/**
 * Where the web splash must put the launch box's centre, measured from the top
 * of the WebView, to sit exactly where Android drew its launch icon: the centre
 * of the app's window (the whole screen unless in split screen). On Android 14
 * and older the WebView starts below the status bar, so the two centres differ
 * by a few dp. All values in dp (= CSS px), from LaunchScreen.geometry().
 *
 * @param {{ windowTopDp?: number, screenHeightDp?: number, webViewTopDp?: number, viewportHeight: number }} g
 * @returns {number} px from the top of the page
 */
export function launchCenterY({ windowTopDp = 0, screenHeightDp, webViewTopDp, viewportHeight }) {
  const height = Number(screenHeightDp);
  const top = Number(webViewTopDp);
  const windowTop = Number(windowTopDp) || 0;
  if (!(height > 0) || !(top >= 0) || !(viewportHeight > 0)) return viewportHeight / 2;
  const y = windowTop + height / 2 - top;
  // A report that would put the mark off the page is not trusted.
  if (y < 0 || y > viewportHeight) return viewportHeight / 2;
  return y;
}
