import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getHomePrefs, gettingStartedSteps, markStep, setGoal, toggleSection, dismissGettingStarted } from '../src/lib/homePrefs.js';

const here = dirname(fileURLToPath(import.meta.url));
const store = new Map();
globalThis.window = { localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } };
test.beforeEach(() => store.clear());

test('choices are remembered and sections toggle both ways', () => {
  setGoal('save');
  assert.equal(getHomePrefs().goal, 'save');
  toggleSection('week');
  assert.deepEqual(getHomePrefs().hidden, ['week']);
  toggleSection('week');
  assert.deepEqual(getHomePrefs().hidden, []);
  dismissGettingStarted();
  assert.equal(getHomePrefs().startDismissed, true);
});

test('blocked or broken storage falls back to defaults', () => {
  store.set('vittova.home.v1', '{not json');
  assert.equal(getHomePrefs().goal, null);
  const saved = globalThis.window;
  globalThis.window = { localStorage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } } };
  assert.deepEqual(getHomePrefs().hidden, []);
  assert.deepEqual(toggleSection('week').hidden, ['week']);
  globalThis.window = saved;
});

test('steps reflect real progress and every link has a route', () => {
  markStep('report');
  markStep('report');
  const steps = gettingStartedSteps(getHomePrefs(), true);
  assert.equal(steps.find((s) => s.id === 'expense').done, true);
  assert.equal(steps.find((s) => s.id === 'report').done, true);
  assert.equal(steps.find((s) => s.id === 'budget').done, false);
  assert.equal(getHomePrefs().done.length, 1);
  const app = readFileSync(join(here, '..', 'src/App.jsx'), 'utf8');
  for (const s of steps.filter((x) => x.to)) assert.ok(app.includes(`path="${s.to}"`), s.to);
});

test('SMS is asked for only by someone who chose to track, and can always be skipped', () => {
  const page = readFileSync(join(here, '..', 'src/pages/Onboarding.jsx'), 'utf8');
  assert.match(page, /showPermissionStep = goal === 'track' &&/);
  assert.match(page, /Not now/);
  assert.match(page, /SMS_DISCLOSURE/);
});
