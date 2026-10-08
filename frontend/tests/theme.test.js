// The design system: dark is the primary look, light is derived from the same
// roles, and screens take their colours from those roles rather than from
// one-off values.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CHOICE, THEME_CHOICES, THEME_COLOR, readChoice, resolveTheme } from '../src/lib/theme.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, '..', p), 'utf8');
const css = read('src/index.css');
// Dark is the default, and .v-dark pins a part of a page to it (the public homepage).
const DARK = ':root, :root.dark, .v-dark';

/** The --v-* declarations inside one rule, as { name: value }. */
function tokens(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} found`);
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(--v-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const hex = (value) => {
  const m = /^#([0-9a-f]{6})$/i.exec(value);
  assert.ok(m, `${value} is a six-digit hex colour`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
};
const luminance = (value) => {
  const [r, g, b] = hex(value).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('dark is the default look; a stored choice is honoured only when it is a real one', () => {
  assert.equal(DEFAULT_CHOICE, 'dark');
  assert.deepEqual(THEME_CHOICES, ['dark', 'light', 'system']);
  assert.equal(readChoice('light'), 'light');
  assert.equal(readChoice('system'), 'system');
  for (const junk of [null, undefined, '', 'blue', 'LIGHT', 0]) assert.equal(readChoice(junk), 'dark');

  assert.equal(resolveTheme('dark', true), 'dark');
  assert.equal(resolveTheme('light', false), 'light');
  assert.equal(resolveTheme('system', true), 'light');
  assert.equal(resolveTheme('system', false), 'dark');
  assert.equal(resolveTheme('nonsense', true), 'dark');
});

test('both looks define the same colour roles', () => {
  const dark = tokens(DARK);
  const light = tokens(':root.light');
  assert.deepEqual(Object.keys(light).sort(), Object.keys(dark).sort());
  for (const role of ['--v-bg', '--v-surface', '--v-surface-2', '--v-ink', '--v-ink-2', '--v-ink-3', '--v-accent', '--v-on-fill', '--v-warn', '--v-danger']) {
    assert.ok(dark[role], `dark ${role}`);
    assert.ok(light[role], `light ${role}`);
  }
  // The status-bar colour the app reports is the page colour of each look.
  assert.equal(THEME_COLOR.dark.toLowerCase(), dark['--v-bg'].toLowerCase());
  assert.equal(THEME_COLOR.light.toLowerCase(), light['--v-bg'].toLowerCase());
  // Light is its own palette, not dark with the values swapped.
  assert.notEqual(light['--v-accent'], dark['--v-accent']);
  assert.ok(luminance(light['--v-bg']) > 0.8 && luminance(dark['--v-bg']) < 0.02);
});

test('text and the main button are readable in both looks', () => {
  for (const [name, t] of [['dark', tokens(DARK)], ['light', tokens(':root.light')]]) {
    for (const surface of ['--v-bg', '--v-surface', '--v-surface-2']) {
      assert.ok(contrast(t['--v-ink'], t[surface]) >= 7, `${name}: ink on ${surface}`);
      assert.ok(contrast(t['--v-ink-2'], t[surface]) >= 4.5, `${name}: secondary text on ${surface}`);
    }
    // The quietest text is for captions; it still has to be readable on the page and on blocks.
    assert.ok(contrast(t['--v-ink-3'], t['--v-bg']) >= 4, `${name}: caption text on the page`);
    assert.ok(contrast(t['--v-ink-3'], t['--v-surface']) >= 4, `${name}: caption text on a block`);
    assert.ok(contrast(t['--v-on-fill'], t['--v-accent']) >= 4.5, `${name}: label on the main button`);
    for (const status of ['--v-accent', '--v-warn', '--v-danger']) {
      assert.ok(contrast(t[status], t['--v-surface']) >= 4.5, `${name}: ${status} as text on a block`);
    }
  }
});

test('screens take colours from the roles, not from one-off values', () => {
  const files = [];
  for (const dir of ['src/components', 'src/pages']) {
    for (const e of readdirSync(join(here, '..', dir), { withFileTypes: true })) {
      if (e.isFile() && e.name.endsWith('.jsx')) files.push(`${dir}/${e.name}`);
    }
  }
  // Allowed: Google's own logo colours, the brand mark's drawing, the frame an
  // error screen falls back to if the stylesheet never loaded, and Hero.jsx
  // (an old page no route uses).
  const exempt = new Set(['src/components/AuthLayout.jsx', 'src/components/VittovaLogo.jsx', 'src/components/StartupSplash.jsx', 'src/components/ErrorBoundary.jsx', 'src/pages/Hero.jsx']);
  for (const file of files) {
    if (exempt.has(file)) continue;
    const source = read(file);
    assert.doesNotMatch(source, /(?:bg|text|border|from|to|via|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/, `${file}: arbitrary hex colour class`);
    assert.doesNotMatch(source, /(?:stroke|fill|stopColor|color|background)=?:?\s*["']#[0-9a-fA-F]{3,8}["']/, `${file}: hex colour in a chart or inline style`);
    assert.doesNotMatch(source, /bg-gradient-to-|backdrop-blur|rgba\(163, ?230, ?53|rgba\(57, ?255, ?20/, `${file}: gradient, blur or neon glow`);
  }
  const google = read('src/components/AuthLayout.jsx').match(/#[0-9A-Fa-f]{6}/g) || [];
  assert.deepEqual([...new Set(google)].sort(), ['#34A853', '#4285F4', '#EA4335', '#FBBC05']);
});

test('the public homepage uses the same roles and follows the chosen look', () => {
  const dir = 'src/pages/Landing';
  const files = readdirSync(join(here, '..', dir)).filter((n) => n.endsWith('.jsx'));
  assert.ok(files.length >= 10, 'homepage sections found');
  for (const name of files) {
    const source = read(`${dir}/${name}`);
    assert.doesNotMatch(source, /(?:bg|text|border|from|to|via|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/, `${name}: arbitrary hex colour class`);
    assert.doesNotMatch(source, /bg-gradient-to-|backdrop-blur|blur-3xl|rgba\(/, `${name}: gradient, blur or one-off colour`);
    // Role names only: the old palette names are for screens not yet rewritten.
    // (white stays: on the gradient card it is the card's own ink, as in the app.)
    assert.doesNotMatch(source, /\b(?:bg|text|border)-(?:lime|zinc|amber|rose|emerald)\b/, `${name}: palette name instead of a role`);
    assert.doesNotMatch(source, /className="[^"]*\buppercase\b/, `${name}: shouted label`);
    assert.doesNotMatch(source, /\bSparkles\b/, `${name}: sparkle icon`);
  }
  // Not pinned to dark any more: it follows the look, and offers the switch.
  assert.doesNotMatch(read(`${dir}/index.jsx`), /v-dark/);
  assert.match(read(`${dir}/Navbar.jsx`), /useTheme\(\)/);
});

test('the saved look is applied before the first paint, by the same rules as the app', () => {
  const boot = read('public/theme-boot.js');
  const lib = read('src/lib/theme.js');
  const key = /THEME_KEY = '([^']+)'/.exec(lib)[1];
  assert.ok(boot.includes(`'${key}'`), 'same storage key');
  assert.ok(boot.includes(`'${THEME_COLOR.dark}'`) && boot.includes(`'${THEME_COLOR.light}'`), 'same page colours');
  assert.match(boot, /choice === 'light'/);
  assert.match(boot, /choice === 'system'/);
  // Loaded in <head>, after the theme-color tag it updates and before the app.
  const html = read('index.html');
  const at = (needle) => { const i = html.indexOf(needle); assert.ok(i >= 0, needle); return i; };
  assert.ok(at('name="theme-color"') < at('src="/theme-boot.js"'));
  assert.ok(at('src="/theme-boot.js"') < at('</head>'));
  assert.ok(at('src="/theme-boot.js"') < at('src="/src/main.jsx"'));
});

test('labels are sentence case and nothing is decorated as "AI"', () => {
  for (const dir of ['src/components', 'src/pages']) {
    for (const e of readdirSync(join(here, '..', dir), { withFileTypes: true })) {
      if (!e.isFile() || !e.name.endsWith('.jsx') || e.name === 'Hero.jsx') continue;
      const source = read(`${dir}/${e.name}`);
      assert.doesNotMatch(source, /className="[^"]*\buppercase\b/, `${dir}/${e.name}: shouted label`);
      assert.doesNotMatch(source, /\bSparkles\b/, `${dir}/${e.name}: sparkle icon`);
    }
  }
});

test('the bottom bar is a plain bar, and Profile offers the three looks', () => {
  const nav = read('src/components/BottomNav.jsx');
  assert.match(nav, /border-t border-line bg-bg/);
  assert.doesNotMatch(nav, /rounded-full|framer-motion|shadow/);
  const settings = read('src/pages/Settings.jsx');
  assert.match(settings, /<SettingsGroup title="Appearance"/);
  for (const label of ['Dark', 'Light', 'Match phone']) assert.ok(settings.includes(label), label);
});
