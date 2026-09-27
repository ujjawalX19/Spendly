// Share text: only the achievement; an amount only when the user opts in, labelled as an estimate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { shareText, shareProgress } from '../src/lib/shareProgress.js';

test('share text contains the achievement only, no money by default', () => {
  const t = shareText({ kind: 'challenge', challengeTitle: '7-Day Zero Food Delivery', estimate: 720 });
  assert.match(t, /7-Day Zero Food Delivery/);
  assert.doesNotMatch(t, /₹/);
  assert.match(shareText({ kind: 'streak', streakDays: 6 }), /6-day Money Streak/);
  assert.match(shareText({ kind: 'badge', badgeTitle: 'Budget Keeper' }), /Budget Keeper/);
});

test('an amount appears only when chosen, and is called an estimate', () => {
  const t = shareText({ kind: 'challenge', challengeTitle: 'X', estimate: 720, includeAmount: true });
  assert.match(t, /₹720 of spending avoided \(estimate\)/);
  assert.doesNotMatch(shareText({ kind: 'challenge', challengeTitle: 'X', estimate: 0, includeAmount: true }), /₹/);
});

test('falls back to the clipboard, and a dismissed share is not an error', async () => {
  let copied = '';
  assert.equal(await shareProgress('hi', { clipboard: { writeText: async (s) => { copied = s; } } }), 'copied');
  assert.equal(copied, 'hi');
  assert.equal(await shareProgress('hi', { share: async () => { throw new Error('AbortError'); } }), 'cancelled');
});
