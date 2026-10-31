// Rewards screens (v1.14): wording, the share card, the design system and
// navigation. Display only: every number on these screens comes from the server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rewardLine, missionDayStatus, eventStatus, missionProgress, shareCardLines, shareCardText, timeLeft, difficultyOptions, goalPace } from '../src/lib/rewardsDisplay.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, '..', p), 'utf8');
const PAGES = ['src/pages/Rewards.jsx', 'src/pages/Goals.jsx', 'src/pages/WeeklyRecap.jsx', 'src/components/MoneyStreakCard.jsx'];

test('reward lines', () => {
  assert.equal(rewardLine({ xp: 25, points: 8 }), '+25 XP · +8 Points');
  assert.equal(rewardLine({ xp: 10 }), '+10 XP');
  assert.equal(rewardLine({ points: 1 }), '+1 Point');
  assert.equal(rewardLine({ points: -5 }), '−5 Points');
  assert.equal(rewardLine({}), '');
});

test('calm words: a day is "not kept", never failed; reversals are labelled', () => {
  for (const s of ['active', 'earned', 'pending', 'missed', undefined]) assert.doesNotMatch(missionDayStatus(s).label, /fail|lost|bad/i);
  assert.equal(missionDayStatus('missed').label, 'Not kept');
  assert.equal(eventStatus({ status: 'reversal' }).label, 'Reversed');
  assert.equal(eventStatus({ status: 'reversed' }).label, 'Later reversed');
  assert.equal(eventStatus({ status: 'confirmed' }).label, 'Confirmed');
  assert.equal(goalPace({ pace: 'behind' }), 'A little behind');
});

test('mission progress and time left', () => {
  assert.deepEqual(missionProgress({ current: 270, target: 540, unit: 'inr' }), { text: '₹270 of ₹540', percent: 50, over: false });
  assert.equal(missionProgress({ current: 600, target: 540, unit: 'inr' }).over, true);
  assert.equal(missionProgress({ current: 2499, target: 0, unit: 'inr' }), null, 'no bar for a "none at all" mission');
  assert.equal(missionProgress(null), null);
  const now = Date.parse('2026-10-15T18:40:00+05:30');
  assert.equal(timeLeft('2026-10-15T18:30:00.000Z', now), '5 h 20 min left');
  assert.equal(timeLeft('2026-10-15T13:00:00.000Z', now), 'Day ended');
});

test('difficulty options come from the server, with Automatic first', () => {
  const opts = difficultyOptions({ difficulties: [{ key: 'easy', label: 'Easy', summary: 's' }, { key: 'balanced', label: 'Balanced', summary: 's' }, { key: 'advanced', label: 'Advanced', summary: 's' }] });
  assert.deepEqual(opts.map((o) => o.key), ['auto', 'easy', 'balanced', 'advanced']);
});

test('the share card shows only the server\'s share fields', () => {
  const share = { title: 'My Vittova week · 5–11 Oct', stats: [{ label: 'Missions kept', value: '5 of 7' }, { label: 'XP earned', value: '+180' }], budget: 'Within plan', level: 'Level 3 · Money Smart', badges: [] };
  assert.deepEqual(shareCardLines(share), [{ label: 'Missions kept', value: '5 of 7' }, { label: 'XP earned', value: '+180' }, { label: 'This week', value: 'Within plan' }]);
  assert.doesNotMatch(shareCardText(share), /₹/);
  // The card is drawn from `share` alone.
  const card = read('src/lib/recapCard.js');
  assert.match(card, /export function drawRecapCard\(canvas, share\)/);
  const code = card.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /categories|savings|budget\.spent|amountInr|merchant/);
  // Sharing is a button after a preview, never automatic.
  const recap = read('src/pages/WeeklyRecap.jsx');
  assert.ok(recap.indexOf('Preview share card') < recap.indexOf('onClick={share}'));
});

test('Points are never presented as money', () => {
  for (const p of PAGES) assert.doesNotMatch(read(p), /Points? (are|is) worth|₹\s*\{?[^}]*points|cash ?back|withdraw|redeem for cash/i, p);
  assert.match(read('src/pages/Rewards.jsx'), /no cash value|points\.note/);
  assert.match(read('src/components/MoneyStreakCard.jsx'), /no cash value/);
});

test('the new screens use the design tokens: no neon, rainbow or raw palette colours', () => {
  for (const p of [...PAGES, 'src/lib/recapCard.js']) {
    const src = read(p);
    assert.doesNotMatch(src, /\b(text|bg|border|from|to|via|ring)-(lime|fuchsia|pink|purple|cyan|teal|emerald|rose|yellow|indigo|sky|violet)-\d{2,3}\b/, p);
    assert.doesNotMatch(src, /\b(text|bg|border)-zinc-\d{2,3}\b/, `${p} uses the old palette`);
    assert.doesNotMatch(src, /animate-bounce|animate-spin-slow|confetti/i, p);
  }
  // Sheets respect reduced motion.
  for (const p of ['src/pages/Goals.jsx', 'src/components/MoneyStreakCard.jsx']) assert.match(read(p), /useReducedMotion/, p);
});

test('rewards are reachable from Home, Profile, Wealth and Save-to-Earn without repeating challenges', () => {
  const app = read('src/App.jsx');
  for (const path of ['/rewards', '/rewards/recap', '/goals']) assert.match(app, new RegExp(`path="${path}"`), path);
  assert.match(read('src/components/MoneyStreakCard.jsx'), /navigate\(streak\?\.missions \? '\/rewards' : '\/save-to-earn'\)/);
  assert.match(read('src/pages/Settings.jsx'), /navigate\('\/rewards'\)/);
  assert.match(read('src/pages/Settings.jsx'), /navigate\('\/goals'\)/);
  assert.match(read('src/pages/Wealth.jsx'), /to="\/goals"/);
  assert.match(read('src/pages/SaveToEarn.jsx'), /to="\/rewards"/);
  // The Rewards screen links to challenges; it does not list templates or start them.
  const rewards = read('src/pages/Rewards.jsx');
  assert.match(rewards, /to="\/save-to-earn"/);
  assert.doesNotMatch(rewards, /save-to-earn\/challenges/);
});

test('the client never sends XP, Points, progress or a result', () => {
  const srcs = [...PAGES, 'src/lib/offlineQueue.js', 'src/lib/missionSync.js'].map(read).join('\n');
  for (const m of srcs.matchAll(/body: \{([^}]*)\}/g)) assert.doesNotMatch(m[1], /\b(xp|points|percent|status|kept|reward)\b/, m[0]);
});
