// Applies the saved look (dark, light or "match phone") before the first paint,
// so a page never flashes the wrong one. Loaded by index.html and by the
// static pages; the rules are the same as src/lib/theme.js.
(function () {
  var choice = 'dark';
  try { choice = window.localStorage.getItem('vittova.theme') || 'dark'; } catch (e) { /* storage unavailable */ }
  var light = choice === 'light'
    || (choice === 'system' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
  var root = document.documentElement;
  root.classList.toggle('light', light);
  root.classList.toggle('dark', !light);
  // In the Android app the first frame must match Android's dark launch screen,
  // whatever the look; a browser shows the chosen look from the start.
  var native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (!native) root.classList.add('v-web');
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', light ? '#F3F3F3' : '#000000');
})();
