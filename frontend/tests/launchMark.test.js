// The opening: Android's launch screen and the web splash must draw the SAME
// frame (so the hand-off is invisible), the mark must be a vector (sharp at
// 288 dp) and fit Android's visible circle, and the web splash must sit where
// Android put the icon.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GRADIENT, GRADIENT_Y, LAUNCH, LAUNCH_BACKGROUND, STROKE_DOWN, STROKE_UP, STROKE_WIDTH, launchCenterY,
} from '../src/lib/brandMark.js';

const here = dirname(fileURLToPath(import.meta.url));
const res = (p) => readFileSync(join(here, '../android/app/src/main/res', p), 'utf8');
const vector = res('drawable/splash_mark.xml');
const attr = (xml, name) => [...xml.matchAll(new RegExp(`android:${name}="([^"]+)"`, 'g'))].map((m) => m[1]);
const argb = (c) => c.toUpperCase().replace(/^#FF([0-9A-F]{6})$/, '#$1');

test('the launch icon is the vector mark, not a stretched launcher bitmap', () => {
  const styles = res('values/styles.xml');
  assert.match(styles, /windowSplashScreenAnimatedIcon">@drawable\/splash_mark</);
  assert.doesNotMatch(styles, /windowSplashScreenAnimatedIcon">@mipmap\//);
  assert.match(vector, /^<\?xml[\s\S]*<vector /);
  assert.deepEqual(attr(vector, 'width'), ['288dp']);
  assert.deepEqual(attr(vector, 'height'), ['288dp']);
});

test('Android and the web splash draw the same mark in the same place', () => {
  assert.deepEqual(attr(vector, 'viewportWidth'), [String(LAUNCH.viewport)]);
  assert.deepEqual(attr(vector, 'viewportHeight'), [String(LAUNCH.viewport)]);
  assert.deepEqual(attr(vector, 'translateX'), [String(LAUNCH.translateX)]);
  assert.deepEqual(attr(vector, 'translateY'), [String(LAUNCH.translateY)]);
  assert.equal(LAUNCH.sizeDp, 288);
  // Falling stroke, then the rising stroke on top (no tile rim on the launch screen).
  assert.deepEqual(attr(vector, 'pathData'), [STROKE_DOWN, STROKE_UP]);
  assert.deepEqual(attr(vector, 'strokeWidth'), [String(STROKE_WIDTH), String(STROKE_WIDTH)]);
  assert.deepEqual(attr(vector, 'strokeColor'), []);
  // The web splash draws the same two strokes, in the same order.
  const splash = readFileSync(join(here, '../src/components/StartupSplash.jsx'), 'utf8');
  const order = [...splash.matchAll(/<path (?:className="[^"]*" )?d=\{(STROKE_\w+)\}[^>]*strokeWidth=\{(\w+)\}/g)].map((m) => `${m[1]}:${m[2]}`);
  assert.deepEqual(order, ['STROKE_DOWN:STROKE_WIDTH', 'STROKE_DOWN:LIGHT_WIDTH', 'STROKE_UP:STROKE_WIDTH', 'STROKE_UP:LIGHT_WIDTH']);
  // Both gradient strokes use the brand gradient.
  assert.deepEqual(attr(vector, 'startY'), [String(GRADIENT_Y[0]), String(GRADIENT_Y[0])]);
  assert.deepEqual(attr(vector, 'endY'), [String(GRADIENT_Y[1]), String(GRADIENT_Y[1])]);
  const stops = attr(vector, 'color').map(argb);
  const expected = GRADIENT.map((s) => s.color.toUpperCase());
  assert.deepEqual(stops, [...expected, ...expected]);
  assert.deepEqual(attr(vector, 'offset').map(Number), [...GRADIENT.map((s) => s.offset), ...GRADIENT.map((s) => s.offset)]);
});

test('one background colour from tap to app: launch screen, window, WebView and splash', () => {
  const colors = res('values/ic_launcher_background.xml');
  const named = (name) => new RegExp(`<color name="${name}">([^<]+)</color>`).exec(colors)[1].toUpperCase();
  assert.equal(named('splash_background'), LAUNCH_BACKGROUND.toUpperCase());
  const styles = res('values/styles.xml');
  assert.match(styles, /windowSplashScreenBackground">@color\/splash_background</);
  assert.match(styles, /android:windowBackground">@color\/splash_background</);
  const cap = JSON.parse(readFileSync(join(here, '../capacitor.config.json'), 'utf8'));
  assert.equal(cap.backgroundColor.toUpperCase(), LAUNCH_BACKGROUND.toUpperCase());
  const splash = readFileSync(join(here, '../src/components/StartupSplash.jsx'), 'utf8');
  assert.match(splash, /backgroundColor: LAUNCH_BACKGROUND/);
});

test('the whole mark is inside the circle Android shows (192 of 288 dp)', () => {
  // Every point of a stroke lies within its control hull, so checking the
  // path's points is conservative.
  const radius = LAUNCH.viewport / 3;
  const centre = LAUNCH.viewport / 2;
  let worst = 0;
  for (const d of [STROKE_UP, STROKE_DOWN]) {
    const nums = d.match(/[A-Z]|-?\d+(\.\d+)?/g);
    let x = 0; let y = 0; let cmd = '';
    const points = [];
    for (let i = 0; i < nums.length;) {
      if (/[A-Z]/.test(nums[i])) { cmd = nums[i]; i++; continue; }
      if (cmd === 'H') { x = Number(nums[i]); i += 1; } else { x = Number(nums[i]); y = Number(nums[i + 1]); i += 2; }
      points.push([x, y]);
    }
    for (const [px, py] of points) {
      const dist = Math.hypot(px + LAUNCH.translateX - centre, py + LAUNCH.translateY - centre) + STROKE_WIDTH / 2;
      worst = Math.max(worst, dist);
    }
  }
  assert.ok(worst < radius, `mark reaches ${worst.toFixed(0)} of ${radius}`);
});

test('the web splash centres the mark where Android drew it', () => {
  // Android 14, not edge-to-edge: the WebView starts under a 32 dp status bar.
  assert.equal(launchCenterY({ windowTopDp: 0, screenHeightDp: 800, webViewTopDp: 32, viewportHeight: 720 }), 368);
  // Android 15+, edge-to-edge: the same centre as the page.
  assert.equal(launchCenterY({ windowTopDp: 0, screenHeightDp: 800, webViewTopDp: 0, viewportHeight: 800 }), 400);
  // Split screen, bottom half.
  assert.equal(launchCenterY({ windowTopDp: 400, screenHeightDp: 400, webViewTopDp: 424, viewportHeight: 376 }), 176);
  // No geometry (the website, an older build): centre of the page.
  assert.equal(launchCenterY({ viewportHeight: 700 }), 350);
  // Nonsense is not trusted.
  assert.equal(launchCenterY({ screenHeightDp: 800, webViewTopDp: 900, viewportHeight: 700 }), 350);
  assert.equal(launchCenterY({ screenHeightDp: -1, webViewTopDp: 0, viewportHeight: 700 }), 350);
});

test('the splash animates only transforms, opacity and a stroke offset, and the mark returns to its exact size', () => {
  const css = readFileSync(join(here, '../src/index.css'), 'utf8');
  const block = css.slice(css.indexOf('Startup splash'), css.indexOf('── Landing'));
  assert.ok(block.length > 100, 'splash styles found');
  // Cheap to animate on any phone: nothing that forces layout or repaint.
  const animated = [...block.matchAll(/@keyframes [\w-]+ \{([\s\S]*?)\}\n/g)].map((m) => m[1]).join(' ');
  const props = new Set([...animated.matchAll(/([a-z-]+):/g)].map((m) => m[1]));
  for (const p of props) assert.ok(['opacity', 'stroke-dashoffset', 'transform'].includes(p), p);
  // The pulse: the mark beats by a few percent at most, and starts and ends at
  // exactly scale 1, so the hand-off from Android's frame has no jump and the
  // vector is at its native size whenever it is still.
  const beat = /@keyframes v-launch-beat \{([\s\S]*?)\}\n/.exec(block)[1];
  const scales = [...beat.matchAll(/scale\(([\d.]+)\)/g)].map((m) => Number(m[1]));
  assert.equal(scales[0], 1);
  assert.equal(scales[scales.length - 1], 1);
  assert.ok(Math.max(...scales) <= 1.04 && Math.min(...scales) === 1, `beat scales ${scales}`);
  // Not kept on a pre-rasterised layer, so it is redrawn sharp at each size.
  assert.doesNotMatch(block, /\.v-launch-mark \{[^}]*will-change/);
  assert.match(block, /@keyframes v-launch-tagline \{ from \{ opacity: 0; transform: translateY\(6px\); \}/);
});
