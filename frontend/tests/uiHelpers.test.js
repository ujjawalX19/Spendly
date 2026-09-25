// v1.1 UI helpers: when the startup splash shows, and how a bill's due date is worded.
import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowSplash, markSplashShown, SPLASH_SESSION_KEY } from '../src/lib/splash.js';
import { billDueIn } from '../src/lib/moneyDisplay.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test('splash: once per session, on every app route of a cold start', () => {
  const store = memoryStorage();
  assert.equal(shouldShowSplash('/dash', false, store), true);
  assert.equal(shouldShowSplash('/login', false, store), true);
  markSplashShown(store);
  assert.equal(store.getItem(SPLASH_SESSION_KEY), '1');
  assert.equal(shouldShowSplash('/dash', false, store), false);
  assert.equal(shouldShowSplash('/dash', true, store), false);
});

test('splash: the website landing, legal and auth-return pages skip it; the app never does', () => {
  for (const path of ['/', '/privacy', '/terms', '/delete-account', '/auth/callback']) {
    assert.equal(shouldShowSplash(path, false, memoryStorage()), false, path);
    assert.equal(shouldShowSplash(path, true, memoryStorage()), true, path);
  }
});

test('splash: storage that throws still shows it rather than crashing', () => {
  const broken = { getItem() { throw new Error('blocked'); } };
  assert.equal(shouldShowSplash('/dash', false, broken), true);
});

test('bill due dates read naturally', () => {
  assert.equal(billDueIn(20, 20), 'due today');
  assert.equal(billDueIn(21, 20), 'due tomorrow');
  assert.equal(billDueIn(25, 20), 'in 5 days');
  assert.equal(billDueIn(5, 20), 'on the 5');
  assert.equal(billDueIn('7', '3'), 'in 4 days');
});
