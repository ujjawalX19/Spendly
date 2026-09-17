// The public legal pages at vittova.in/privacy, /terms and /delete-account are
// static HTML (public/legal) so they load with no JavaScript or app
// configuration, as Google Play requires. The app shows the same text from
// React pages. These checks fail when the two copies drift apart.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUPPORTED_PAYMENT_APPS } from '../src/lib/supportedPaymentApps.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, '..', p), 'utf8');
const legalJs = read('src/lib/legal.js');
const lastUpdated = /POLICY_LAST_UPDATED = '([^']+)'/.exec(legalJs)[1];
const supportEmail = /\|\| '([^']+@[^']+)'/.exec(legalJs)[1];

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const jsxText = (src) => src.replace(/\{'\s*'\}/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const PAGES = [
  { html: 'public/legal/privacy.html', jsx: 'src/pages/PrivacyPolicy.jsx', route: '/privacy' },
  { html: 'public/legal/terms.html', jsx: 'src/pages/TermsOfService.jsx', route: '/terms' },
  { html: 'public/legal/delete-account.html', jsx: 'src/pages/DeleteAccountInfo.jsx', route: '/delete-account' },
];

test('Vercel serves each legal URL from its static page, before the app catch-all', () => {
  const { rewrites } = JSON.parse(read('vercel.json'));
  const catchAll = rewrites.findIndex((r) => r.source === '/(.*)');
  for (const page of PAGES) {
    const i = rewrites.findIndex((r) => r.source === page.route);
    assert.ok(i >= 0 && i < catchAll, `${page.route} rewrite before catch-all`);
    assert.equal(rewrites[i].destination, `/${page.html.replace('public/', '')}`);
  }
});

test('static pages need no JavaScript and carry the current date and contact', () => {
  for (const page of PAGES) {
    const html = read(page.html);
    assert.doesNotMatch(html, /<script/i, page.html);
    assert.ok(html.includes(`mailto:${supportEmail}`), page.html);
    assert.doesNotMatch(html, /spendly/i, page.html);
  }
  assert.match(read('public/legal/privacy.html'), new RegExp(`Last updated: ${lastUpdated}`));
  assert.match(read('public/legal/terms.html'), new RegExp(`Last updated: ${lastUpdated}`));
  assert.match(read('src/pages/TermsOfService.jsx'), new RegExp(`Last updated: ${lastUpdated}`));
});

test('the support address survives Cloudflare email obfuscation', () => {
  // Scrape Shield rewrites plain mailto links into "[email protected]", which
  // hides the address from anyone without JavaScript, including Play reviewers.
  // Cloudflare skips anything between these comments.
  for (const page of PAGES) {
    const html = read(page.html);
    for (const link of html.match(/<a href="mailto:[^"]*">[^<]*<\/a>/g) || []) {
      assert.ok(html.includes(`<!--email_off-->${link}<!--email_on-->`), `${page.html}: ${link}`);
    }
  }
});

test('every section heading matches between the static and in-app pages', () => {
  const privacyJsxTitles = [...read('src/pages/PrivacyPolicy.jsx').matchAll(/<Section title="([^"]+)"/g)].map((m) => m[1]);
  const termsJsxTitles = [...read('src/pages/TermsOfService.jsx').matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1].trim());
  const deleteJsxTitles = [...read('src/pages/DeleteAccountInfo.jsx').matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1].trim());
  const htmlTitles = (p) => [...read(p).matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => m[1].trim());
  assert.deepEqual(htmlTitles('public/legal/privacy.html'), privacyJsxTitles);
  assert.deepEqual(htmlTitles('public/legal/terms.html'), termsJsxTitles);
  assert.deepEqual(htmlTitles('public/legal/delete-account.html'), deleteJsxTitles);
});

test('the privacy policy lists exactly the supported payment apps', () => {
  const box = /<p class="box">([^<]+)<\/p>/.exec(read('public/legal/privacy.html'))[1];
  const listed = box.replace(/\.$/, '').split(', ');
  assert.deepEqual(listed, SUPPORTED_PAYMENT_APPS.map((a) => a.name));
});

test('key commitments are word-for-word the same in both copies', () => {
  const phrases = {
    privacy: [
      'Vittova does not request SMS permission and does not read SMS.',
      'for up to 7 days. The notification text itself is not saved or uploaded.',
      'We do not sell or rent personal data, and we do not use your financial data for advertising.',
      'Vittova is intended for people aged 18 and over.',
      'is not a SEBI-registered investment adviser.',
    ],
    terms: [
      'Vittova Pro is not yet available and cannot be purchased.',
      'To the extent permitted by applicable law, we are not liable for any financial losses',
      'These terms are governed by the laws of India.',
    ],
    'delete-account': [
      'Your account is deleted straight away and you are signed out on every device.',
      'complete deletion within 30 days, then confirm by email.',
    ],
  };
  for (const page of PAGES) {
    const key = page.route.slice(1);
    const html = text(read(page.html));
    const jsx = jsxText(read(page.jsx));
    for (const phrase of phrases[key]) {
      assert.ok(html.includes(phrase), `${page.html}: ${phrase}`);
      assert.ok(jsx.includes(phrase), `${page.jsx}: ${phrase}`);
    }
  }
});
