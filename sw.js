/* Anyara Hills — offline cache.
   Bump CACHE when you change any app file, so iPads pick the new version up. */

const CACHE = 'anyara-v37';

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
  './assets/logo-white.png',
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

// Lets the page ask which build it is actually running, so a stale cache can
// be identified instead of guessed at.
self.addEventListener('message', event => {
  if (event.data === 'version' && event.ports && event.ports[0]) {
    event.ports[0].postMessage(CACHE);
  }
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      // keep both the current shell cache and the current photo cache;
      // photos are expensive to re-download and survive an app update fine
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE && k !== PHOTO_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Only the app shell and web fonts are cacheable. Supabase REST and auth calls
// must always hit the network — serving those from a cache would hand back a
// stale price list, or a stale session.
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// Gallery photos are the one cross-origin thing worth keeping: an advisor
// mid-viewing should not lose the imagery because the Wi-Fi dropped. Only the
// public storage path — never the REST or auth endpoints.
// Deliberately not tied to CACHE: photos are expensive to fetch and have no
// reason to be re-downloaded just because the app code changed.
const PHOTO_CACHE = 'anyara-photos-v1';
const PHOTO_LIMIT = 120;

function isGalleryPhoto(url) {
  return url.pathname.includes('/storage/v1/object/public/gallery/');
}

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

  const reqUrl = new URL(req.url);

  // Photos: serve from cache when present, otherwise fetch and keep a copy,
  // trimming the oldest so a large gallery cannot fill the device.
  if (isGalleryPhoto(reqUrl)) {
    event.respondWith(
      caches.open(PHOTO_CACHE).then(cache =>
        cache.match(req).then(hit => hit || fetch(req).then(res => {
          if (res && (res.ok || res.type === 'opaque')) {
            cache.put(req, res.clone());
            cache.keys().then(keys => {
              const excess = keys.length - PHOTO_LIMIT;
              for (let i = 0; i < excess; i++) cache.delete(keys[i]);
            });
          }
          return res;
        }))
      ).catch(() => new Response('', { status: 503, statusText: 'Offline' }))
    );
    return;
  }

  if (!isCacheable(reqUrl)) return;                         // straight to the network

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
