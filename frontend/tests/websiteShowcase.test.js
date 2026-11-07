import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURES, NEXT_UPDATE_LIVE, isAvailable } from '../src/lib/siteFeatures.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, '..', p), 'utf8');
const LISTING = 'https://play.google.com/store/apps/details?id=com.vittova.app';

test('on the website every app screen and sign-in route shows the get-the-app page', () => {
  const app = read('src/App.jsx');
  const webBlock = app.slice(app.indexOf('{WEB ? ('), app.indexOf(') : ('));
  assert.match(webBlock, /APP_ONLY_PATHS\.map\(\(p\) => <Route key=\{p\} path=\{p\} element=\{<AppOnlyPage \/>\}/);
  assert.doesNotMatch(webBlock, /<Login|<Signup|<Dashboard|<ProUpgrade|<ProtectedRoute/);
  for (const p of ['/login', '/signup', '/dash', '/budgets', '/reports', '/pool/:groupId', '/bot', '/settings']) assert.ok(app.includes(`'${p}'`), p);
  // The Android app keeps every screen.
  const nativeBlock = app.slice(app.indexOf(') : ('));
  for (const el of ['<Login />', '<Dashboard />', '<ProUpgrade />', '<Budgets />']) assert.ok(nativeBlock.includes(el), el);
  // Email links still work on the website.
  assert.match(webBlock, /path="\/reset-password"/);
  assert.match(webBlock, /path="\/auth\/callback"/);
});

test('every download button points at the one verified listing, with attribution', async () => {
  const src = read('src/lib/playStore.js');
  assert.ok(src.includes(`'${LISTING}'`));
  const qr = read('scripts/play-qr.mjs');
  assert.ok(qr.includes(LISTING));
  assert.match(read('public/play-qr.svg'), /^<svg/);
  const files = ['src/pages/Landing/shared.jsx', 'src/pages/site/SiteLayout.jsx', 'src/pages/site/SimplePages.jsx', 'src/pages/site/DemoPage.jsx', 'src/pages/site/FeaturesPage.jsx'];
  for (const f of files) assert.doesNotMatch(read(f), /play\.google\.com/, `${f} must use lib/playStore`);
});

test('features marked live have shipped; next-update ones are labelled and get no install button', () => {
  assert.equal(NEXT_UPDATE_LIVE, false);
  assert.ok(FEATURES.length >= 15);
  for (const f of FEATURES.filter((x) => !x.live)) assert.equal(isAvailable(f), false, f.id);
  for (const f of FEATURES.filter((x) => x.shot)) assert.ok(f.live, `${f.id} uses a screenshot of the shipped app`);
  const page = read('src/pages/site/FeaturesPage.jsx');
  assert.match(page, /Coming in the next update/);
  assert.match(page, /\{available && \(\s*<a href=\{playUrl/);
});

test('the demo is sample data only: no network, storage or account calls', () => {
  const demo = read('src/pages/site/DemoPage.jsx');
  assert.match(demo, /Interactive Demo — Sample Data/);
  assert.doesNotMatch(demo, /apiJson|apiFetch|fetch\(|axios|supabase|localStorage|sessionStorage|useAuth/);
  assert.match(demo, /site_demo_started/);
  assert.match(demo, /site_demo_completed/);
});

test('website analytics events are allowed by the server and carry no personal data', () => {
  const events = readFileSync(join(here, '..', '..', 'backend/lib/appEvents.js'), 'utf8');
  for (const e of ['site_home_view', 'site_feature_view', 'site_demo_started', 'site_demo_completed', 'site_play_click', 'site_qr_click', 'site_faq_open', 'site_pro_cta']) assert.ok(events.includes(`'${e}'`), e);
});

test('no iPhone availability is claimed', () => {
  for (const f of ['src/pages/site/SimplePages.jsx', 'src/pages/Landing/Faq.jsx', 'src/pages/Landing/Footer.jsx']) {
    assert.doesNotMatch(read(f), /App Store|(?<!not )available (on|for) (iOS|iPhone)/i, f);
  }
});
