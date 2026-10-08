// The field being typed in must stay above the on-screen keyboard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installKeepFieldVisible, keyboardInset, needsScroll } from '../src/lib/keepFieldVisible.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, '..', p), 'utf8');

test('the keyboard height is what the window lost to it, and never negative', () => {
  assert.equal(keyboardInset({ innerHeight: 800, visualViewport: { height: 500, offsetTop: 0 } }), 300);
  assert.equal(keyboardInset({ innerHeight: 800, visualViewport: { height: 480, offsetTop: 20 } }), 300);
  // The page itself shrank (nothing is covered), or the browser has no visual viewport.
  assert.equal(keyboardInset({ innerHeight: 500, visualViewport: { height: 500, offsetTop: 0 } }), 0);
  assert.equal(keyboardInset({ innerHeight: 800 }), 0);
  assert.equal(keyboardInset({ innerHeight: 400, visualViewport: { height: 500, offsetTop: 0 } }), 0);
  assert.equal(keyboardInset({ innerHeight: NaN, visualViewport: { height: 500 } }), 0);
});

test('a field is moved only when it is under the keyboard or off the top', () => {
  assert.equal(needsScroll({ top: 200, bottom: 248 }, 500), false);
  assert.equal(needsScroll({ top: 470, bottom: 518 }, 500), true);
  assert.equal(needsScroll({ top: 440, bottom: 490 }, 500), true, 'touching the keyboard counts');
  assert.equal(needsScroll({ top: -30, bottom: 18 }, 500), true);
});

test('the focused field is scrolled into view once the keyboard has settled', async () => {
  const listeners = {};
  const style = {};
  let scrolled = null;
  const field = { tagName: 'INPUT', getBoundingClientRect: () => ({ top: 560, bottom: 608 }), scrollIntoView: (o) => { scrolled = o; } };
  const win = {
    innerHeight: 800,
    visualViewport: { height: 500, offsetTop: 0, addEventListener() {}, removeEventListener() {} },
    addEventListener() {}, removeEventListener() {},
    document: {
      activeElement: field,
      documentElement: { style: { setProperty: (k, v) => { style[k] = v; } } },
      addEventListener: (name, fn) => { listeners[name] = fn; },
      removeEventListener: (name) => { delete listeners[name]; },
    },
  };
  const stop = installKeepFieldVisible(win);
  listeners.focusin();
  await new Promise((r) => setTimeout(r, 400));
  assert.deepEqual(scrolled, { block: 'center', behavior: 'smooth' });
  assert.equal(style['--v-kb'], '300px');

  // A button taking focus is left alone.
  scrolled = null;
  win.document.activeElement = { tagName: 'BUTTON' };
  listeners.focusin();
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(scrolled, null);
  stop();
  assert.equal(listeners.focusin, undefined);
});

test('the app starts the watcher, and the sign-in frame leaves room for the keyboard', () => {
  assert.match(read('src/App.jsx'), /useEffect\(\(\) => installKeepFieldVisible\(\), \[\]\);/);
  assert.match(read('src/components/AuthLayout.jsx'), /var\(--v-kb, ?0px\)/);
});
