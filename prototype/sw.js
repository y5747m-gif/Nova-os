/* ══════════════════════════════════════════════════════════════
   NOVA OS — service worker (installable web app / offline shell)
   Strategy per docs/06-install.md §4:
     · app shell (HTML/CSS/JS/icons): stale-while-revalidate
     · navigations: network-first, falling back to the cached shell
     · anything cross-origin: untouched
   NOVA_VERSION must match src/core/version.js and /VERSION.
   ══════════════════════════════════════════════════════════════ */

const NOVA_VERSION = '1.0.1';
const CACHE = `nova-shell-${NOVA_VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/tokens.css',
  './styles/nova.css',
  './styles/shell.css',
  './styles/shell-android.css',
  './styles/orbit-brand.css',
  './styles/surfaces.css',
  './styles/fx.css',
  './styles/install.css',
  './src/main.js',
  './src/core/dom.js',
  './src/core/icons.js',
  './src/core/store.js',
  './src/core/sound.js',
  './src/core/haptics.js',
  './src/core/version.js',
  './src/core/install.js',
  './src/core/launcher.js',
  './src/core/wallpaper.js',
  './src/motion/ticker.js',
  './src/motion/springs.js',
  './src/motion/config.js',
  './src/motion/motion.js',
  './src/motion/gestures.js',
  './src/motion/fx.js',
  './src/nova/tokens/tokens.js',
  './src/nova/glass/glass.js',
  './src/nova/shapes/shapes.js',
  './src/nova/motion/motion-api.js',
  './src/nova/performance/performance.js',
  './src/nova/gesture/gesture.js',
  './src/nova/text/text-motion.js',
  './src/nova/haptics/haptics.js',
  './src/nova/audio/audio.js',
  './src/nova/find/find.js',
  './src/nova/spaces/spaces.js',
  './src/nova/security/security.js',
  './src/nova/ai/ai.js',
  './src/nova/settings/settings.js',
  './src/nova/index.js',
  './src/surfaces/home.js',
  './src/surfaces/app.js',
  './src/surfaces/core.js',
  './src/surfaces/flow.js',
  './src/surfaces/orb.js',
  './src/surfaces/canvas.js',
  './src/surfaces/dock.js',
  './src/surfaces/control.js',
  './src/surfaces/lock.js',
  './src/surfaces/split.js',
  './src/surfaces/dnd.js',
  './src/surfaces/setup.js',
  './src/surfaces/launch.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll fails atomically: add one by one so a single 404 can't break the install
    await Promise.all(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('nova-shell-') && k !== CACHE).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.disable();
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'VERSION') event.source?.postMessage({ type: 'VERSION', version: NOVA_VERSION });
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;          // CDN fonts etc. → let them through

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        // A resolved fetch is NOT a working site. A host that was moved, expired,
        // or detached from its deployment answers with the *platform's* error
        // page and a 404 — and handing that to the page would paint a 404 over
        // the launcher icon for every installed copy. An error response counts
        // as "the network did not answer": fall through to the cached shell so
        // an installed NOVA always opens NOVA, even mid-migration.
        if (!fresh.ok) throw new Error(`nova:navigation HTTP ${fresh.status}`);
        const cache = await caches.open(CACHE);
        await cache.put('./index.html', fresh.clone());   // awaited + ok-only: Cache.put rejects on 404s
        return fresh;
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    const network = fetch(request).then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
