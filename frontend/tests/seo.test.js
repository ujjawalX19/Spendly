// Search-engine basics for https://vittova.in: robots.txt and sitemap.xml are
// real files (they used to fall through to the app's HTML), only public pages
// are in the sitemap, signed-in screens are marked noindex, and the homepage's
// structured data is valid and makes no invented claims.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, '..', p), 'utf8');
const PUBLIC_URLS = ['https://vittova.in/', 'https://vittova.in/privacy', 'https://vittova.in/terms', 'https://vittova.in/delete-account', 'https://vittova.in/support'];

test('robots.txt allows the site, keeps admin and auth hand-off out, and names the sitemap', () => {
  const robots = read('public/robots.txt');
  assert.match(robots, /^User-agent: \*$/m);
  // The owner console moved to /vittova-ops (267d6f2) and is deliberately NOT
  // listed here, since a Disallow line would advertise it; it is kept out of
  // search by an X-Robots-Tag header instead (checked below).
  assert.doesNotMatch(robots, /vittova-ops/);
  const headers = JSON.parse(read('vercel.json')).headers;
  assert.ok(headers.some((h) => h.source.startsWith('/vittova-ops') && h.headers.some((x) => x.key === 'X-Robots-Tag' && /noindex/.test(x.value))), 'console must be noindex');
  assert.match(robots, /^Disallow: \/auth\/$/m);
  assert.match(robots, /^Sitemap: https:\/\/vittova\.in\/sitemap\.xml$/m);
  for (const publicPath of ['/privacy', '/terms', '/delete-account']) {
    assert.doesNotMatch(robots, new RegExp(`^Disallow: ${publicPath}$`, 'm'));
  }
  assert.doesNotMatch(robots, /^Disallow: \/$/m, 'must not block the whole site');
});

test('sitemap lists exactly the public pages', () => {
  const locs = [...read('public/sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, PUBLIC_URLS);
});

test('signed-in and auth screens are noindex; public pages are not', () => {
  const { headers } = JSON.parse(read('vercel.json'));
  const noindexSources = headers
    .filter((h) => h.headers.some((x) => x.key === 'X-Robots-Tag' && /noindex/.test(x.value)))
    .map((h) => h.source);
  for (const route of ['dash', 'login', 'settings', 'transactions', 'bot', 'wealth']) {
    assert.ok(noindexSources.some((s) => s.includes(route)), `${route} should be noindex`);
  }
  assert.ok(noindexSources.includes('/pool/:path*'));
  assert.ok(noindexSources.includes('/auth/:path*'));
  for (const s of noindexSources) {
    assert.doesNotMatch(s, /privacy|terms|delete-account/, `public page marked noindex: ${s}`);
    assert.notEqual(s, '/(.*)');
  }
});

test('homepage metadata: title, canonical, share image and valid structured data', () => {
  const html = read('index.html');
  const title = /<title>([^<]+)<\/title>/.exec(html)[1];
  assert.ok(title.length <= 65 && /Expense Tracker/.test(title), title);
  assert.match(html, /<link rel="canonical" href="https:\/\/vittova\.in\/" \/>/);
  assert.match(html, /<meta property="og:image" content="https:\/\/vittova\.in\/og-image\.png" \/>/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image" \/>/);
  assert.ok(existsSync(join(here, '..', 'public/og-image.png')));
  assert.ok(existsSync(join(here, '..', 'public/favicon.ico')));
  const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1]);
  assert.deepEqual(ld['@graph'].map((n) => n['@type']), ['Organization', 'WebSite', 'WebApplication']);
  const raw = JSON.stringify(ld);
  assert.doesNotMatch(raw, /aggregateRating|ratingValue|review|"price"|award|users/i, 'no invented claims');
  assert.match(raw, /support@vittova\.in/);
});
