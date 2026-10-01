// Visual and wording rules that keep Vittova looking like one finished product:
// how an expense is worded, the startup pulse, the frame shown before the app's
// code runs, and a few things that must never reach a person's screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceLabel, expenseTitle, expenseMeta, groupByDay } from '../src/lib/expenseDisplay.js';
import { STROKE_UP, STROKE_DOWN, STROKE_WIDTH, GRADIENT, LAUNCH, LAUNCH_BACKGROUND } from '../src/lib/brandMark.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, '..', p), 'utf8');
const css = read('src/index.css');

test('an expense is worded for people, never with stored values', () => {
  assert.equal(sourceLabel('upi_auto'), 'Auto-tracked');
  assert.equal(sourceLabel('ai_scan'), 'Receipt scan');
  assert.equal(sourceLabel('pdf_import'), 'Statement import');
  // Typed in by hand: the normal case carries no label.
  assert.equal(sourceLabel('manual'), '');
  assert.equal(sourceLabel(undefined), '');

  assert.equal(expenseMeta({ category: 'Food', source: 'upi_auto' }), 'Food · Auto-tracked');
  assert.equal(expenseMeta({ category: 'Transport', source: 'manual' }), 'Transport');
  assert.equal(expenseMeta({}), 'Other');
  for (const row of [{ category: 'Food', source: 'upi_auto' }, { category: 'Shopping', source: 'ai_scan' }]) {
    assert.doesNotMatch(expenseMeta(row), /upi|_|ai scan/i);
  }
});

test('a scanned receipt is named after the shop', () => {
  assert.equal(expenseTitle({ description: 'Receipt from D-Mart', source: 'ai_scan' }), 'D-Mart');
  assert.equal(expenseTitle({ description: 'Receipt from Unknown', source: 'ai_scan' }), 'Receipt');
  // Only scans: a hand-typed "Receipt from ..." is the person's own wording.
  assert.equal(expenseTitle({ description: 'Receipt from landlord', source: 'manual' }), 'Receipt from landlord');
  assert.equal(expenseTitle({ description: '  Swiggy ', source: 'upi_auto' }), 'Swiggy');
  assert.equal(expenseTitle({ description: '', category: 'Food' }), 'Food');
  assert.equal(expenseTitle({}), 'Expense');
});

test('activity is grouped by day, each with its total', () => {
  const label = (iso) => iso.slice(0, 10);
  const days = groupByDay([
    { id: 1, amount: 100, occurred_at: '2026-10-02T10:00:00Z' },
    { id: 2, amount: '50.5', occurred_at: '2026-10-02T08:00:00Z' },
    { id: 3, amount: 20, created_at: '2026-10-01T08:00:00Z' },
  ], label);
  assert.deepEqual(days.map((d) => [d.label, d.total, d.rows.length]), [['2026-10-02', 150.5, 2], ['2026-10-01', 20, 1]]);
  assert.deepEqual(groupByDay([], label), []);
  assert.deepEqual(groupByDay(undefined, label), []);

  const page = read('src/pages/Transactions.jsx');
  assert.match(page, /groupByDay\(s\.rows, dayLabel\)/);
  // No three-letter category codes, no raw source text.
  assert.doesNotMatch(page, /slice\(0, 3\)\.toUpperCase\(\)|source\.replace\('_', ' '\)/);
  assert.match(page, />Activity<\/h1>/);
});

test('the startup pulse: two beats, two ripples, then still', () => {
  // The mark beats and settles back to exactly the size Android left it.
  const beat = /@keyframes v-launch-beat \{([^}]*\}){5}/.exec(css)[0];
  assert.match(beat, /0% \{ transform: scale\(1\); \}/);
  assert.match(beat, /100% \{ transform: scale\(1\); \}/);
  const scales = [...beat.matchAll(/scale\(([\d.]+)\)/g)].map((m) => Number(m[1]));
  assert.ok(Math.max(...scales) <= 1.04, 'a subtle beat, never a bounce');
  // Each animation runs once: nothing loops.
  for (const rule of css.match(/\.v-splash-play \.v-launch-[^{]+\{[^}]+\}/g)) {
    assert.doesNotMatch(rule, /infinite/, rule);
  }
  assert.match(css, /\.v-splash-play \.v-launch-ring-1 \{ animation: v-launch-ripple/);
  assert.match(css, /\.v-splash-play \.v-launch-ring-2 \{ --ring-peak: 0\.18; animation: v-launch-ripple/);
  // The tagline arrives after the beats.
  const tagline = /\.v-splash-play \.v-launch-tagline \{ animation: v-launch-tagline \d+ms [^;]+? (\d+)ms both; \}/.exec(css);
  assert.ok(Number(tagline[1]) >= 600);
  // Reduced motion: no beat, no ripple.
  assert.match(css, /\.v-splash-static \.v-launch-light, \.v-splash-static \.v-launch-ring \{ display: none; \}/);

  const splash = read('src/components/StartupSplash.jsx');
  const play = Number(/const PLAY_MS = (\d+);/.exec(splash)[1]);
  const exit = Number(/const EXIT_MS = (\d+);/.exec(splash)[1]);
  assert.ok(play + exit >= 1400 && play + exit <= 2200, `total ${play + exit} ms`);
  assert.match(splash, /your money&rsquo;s <span className="text-lime-300">pulse<\/span>/);
});

test('the splash fades onto a screen, never onto a loading spinner', async () => {
  const { loaderShown, loadersOnScreen, whenScreenReady } = await import('../src/lib/appReady.js');
  // A stand-in clock: each timer runs when the test says so.
  const queue = [];
  const timers = { setTimeout: (fn) => { queue.push(fn); } };
  const tick = () => queue.shift()();

  // Nothing loading: ready after two clear checks.
  let ready = false;
  whenScreenReady(2500, timers).then(() => { ready = true; });
  tick();
  await Promise.resolve();
  assert.equal(ready, true);

  // A loader on screen holds the splash; one loader handing over to the next
  // (session restore, then the screen's code) does not let it go in between.
  const first = loaderShown();
  ready = false;
  whenScreenReady(2500, timers).then(() => { ready = true; });
  tick(); tick();
  await Promise.resolve();
  assert.equal(ready, false);
  first();
  tick();
  const second = loaderShown();
  tick();
  await Promise.resolve();
  assert.equal(ready, false);
  second(); second();
  assert.equal(loadersOnScreen(), 0);
  tick(); tick();
  await Promise.resolve();
  assert.equal(ready, true);

  // A loader that never leaves (no network): the splash still goes, on time.
  const stuck = loaderShown();
  ready = false;
  whenScreenReady(200, timers).then(() => { ready = true; });
  for (let i = 0; i < 4; i++) tick();
  await Promise.resolve();
  assert.equal(ready, true);
  assert.equal(queue.length, 0);
  stuck();

  const app = read('src/App.jsx');
  assert.match(app, /function FullScreenLoader[\s\S]{0,200}useEffect\(\(\) => loaderShown\(\), \[\]\);/);
  const splash = read('src/components/StartupSplash.jsx');
  assert.match(splash, /whenScreenReady\(READY_WAIT_MS\)\.then\(\(\) => \{ if \(!cancelled\) setPhase\('leave'\); \}\)/);
  assert.ok(Number(/const READY_WAIT_MS = (\d+);/.exec(splash)[1]) <= 3000);
});

test('before the app code runs, the page shows the launch frame, not an empty page', () => {
  assert.match(css, /#root:empty \{\s*position: fixed; inset: 0; z-index: 999;\s*background: #0B1220 var\(--v-boot-mark\) center \/ 288px 288px no-repeat;/);
  assert.equal(LAUNCH_BACKGROUND, '#0B1220');
  assert.equal(LAUNCH.sizeDp, 288);
  // The mark in that frame is the same drawing as everywhere else.
  const mark = /--v-boot-mark: url\("data:image\/svg\+xml,([^"]+)"\);/.exec(css)[1];
  assert.ok(mark.includes(`d='${STROKE_UP}'`));
  assert.ok(mark.includes(`d='${STROKE_DOWN}'`));
  assert.ok(mark.indexOf(STROKE_DOWN) < mark.indexOf(STROKE_UP), 'the rising stroke is drawn on top');
  assert.ok(mark.includes(`stroke-width='${STROKE_WIDTH}'`));
  assert.ok(mark.includes(`viewBox='0 0 ${LAUNCH.viewport} ${LAUNCH.viewport}'`));
  assert.ok(mark.includes(`translate(${LAUNCH.translateX} ${LAUNCH.translateY})`));
  for (const stop of GRADIENT) assert.ok(mark.includes(stop.color.replace('#', '%23')), stop.color);
  // Android holds its launch screen long enough that a slow start is not cut short.
  const native = read('android/app/src/main/java/com/vittova/app/LaunchScreenPlugin.java');
  assert.ok(Number(/MAX_HOLD_MS = (\d+)L/.exec(native)[1]) >= 5000);
});

test('money figures use the brand typeface with tabular numerals, not a code font', () => {
  assert.match(css, /--font-mono: 'Space Grotesk'/);
  const rule = /\.font-mono, \.font-mono-finance \{[^}]+\}/.exec(css)[0];
  assert.match(rule, /font-variant-numeric: tabular-nums/);
  assert.doesNotMatch(rule, /JetBrains|monospace/);
  assert.doesNotMatch(read('index.html'), /JetBrains/);
});

test('if the app breaks, people see a plain message, not a stack trace', () => {
  const boundary = read('src/components/ErrorBoundary.jsx');
  assert.match(boundary, /Something went wrong/);
  assert.match(boundary, /Your data is safe/);
  // The error text and component stack are for development builds only.
  assert.match(boundary, /const dev = Boolean\(import\.meta\.env\?\.DEV\);/);
  assert.match(boundary, /\{dev && \(\s*<pre/);
  const outsideDev = boundary.slice(0, boundary.indexOf('{dev && ('));
  assert.doesNotMatch(outsideDev, /componentStack\}|error\?\.toString\(\)/);
});

test('one icon set, no emoji decorating the app screens', () => {
  const emoji = /[\u{1F300}-\u{1FAFF}\u{26A0}]/u;
  const dirs = ['src/components', 'src/pages'];
  for (const dir of dirs) {
    for (const e of readdirSync(join(here, '..', dir), { withFileTypes: true })) {
      if (!e.isFile() || !e.name.endsWith('.jsx')) continue;
      assert.doesNotMatch(read(`${dir}/${e.name}`), emoji, `${dir}/${e.name}`);
    }
  }
});

test('profile is a few titled groups in sentence case, and its switches stay in their tracks', () => {
  const settings = read('src/pages/Settings.jsx');
  const titles = [...settings.matchAll(/<SettingsGroup title="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(titles, ['Budget and goals', 'Money tracking', 'Reminders', 'Tools', 'Vittova Pro', 'Your data', 'Privacy and legal', 'Account']);
  for (const label of [...settings.matchAll(/label="([^"]+)"/g)].map((m) => m[1])) {
    // Sentence case: no word after the first is capitalised unless it is a name.
    const rest = label.split(' ').slice(1).filter((w) => /^[A-Z]/.test(w) && !['Pool', 'SMS', 'Vittova', 'Pro', 'Save-to-Earn', 'PDF'].includes(w.replace(/[()]/g, '')));
    assert.deepEqual(rest, [], label);
  }
  assert.match(settings, /absolute left-0 top-1 block h-5 w-5 rounded-full bg-white/);
});
