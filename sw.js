/* Anyara Hills — offline cache.
   Bump CACHE when you change any app file, so iPads pick the new version up. */

const CACHE = 'anyara-v8';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './data.js',
  './auth.js',
  './app.js',
  './config.js',
  './lots.js',
  './vendor/supabase.js',
  './manifest.webmanifest',
  './assets/logo-black.png',
  './assets/watermark-white.png',
  './assets/icon-180.png',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll is all-or-nothing; add individually so one miss can't break install
      .then(cache => Promise.all(SHELL.map(url => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Only the app shell and web fonts are cacheable. Supabase REST and auth calls
// must always hit the network — serving those from a cache would hand back a
// stale price list, or a stale session.
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

function isCacheable(url) {
  if (FONT_HOSTS.includes(url.hostname)) return true;
  if (url.origin !== self.location.origin) return false;   // Supabase, anything else
  // back office stays live. `includes`, not `startsWith` — on GitHub Pages and
  // similar the app is served under a subpath, e.g. /anyara-hills-proposal/admin/
  if (url.pathname.indexOf('/admin') !== -1) return false;
  return true;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (!isCacheable(new URL(req.url))) return;               // straight to the network

  // Navigations: network first, fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Everything else: cache first, then network, caching what succeeds.
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => new Response('', { status: 503, statusText: 'Offline' })))
  );
});
