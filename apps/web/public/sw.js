/*
 * MyEnergy service worker: lets the installed app open even when the local web server is
 * not running. Bluetooth and the simulator run entirely in the page, so a cached shell is
 * all that is needed. The API (another origin) is never cached.
 */
const VERSION = 'myenergy-v1';
const SHELL = ['/', '/dashboard', '/planner', '/history', '/settings', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

/** Cache every page of the shell plus the JS/CSS chunks each page references. */
async function precache() {
  const cache = await caches.open(VERSION);
  const assets = new Set();
  await Promise.allSettled(
    SHELL.map(async (url) => {
      const response = await fetch(new Request(url, { cache: 'reload' }));
      if (!response.ok) return;
      await cache.put(url, response.clone());
      if ((response.headers.get('content-type') || '').includes('text/html')) {
        const html = await response.text();
        for (const m of html.matchAll(/\/_next\/static\/[^"'\s)\\]+/g)) assets.add(m[0]);
      }
    }),
  );
  await Promise.allSettled([...assets].map((url) => cache.add(url)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(VERSION);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) || (fallbackUrl && (await cache.match(fallbackUrl))) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  const update = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit);
  return hit || update;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // API, fonts CDN etc.: straight to network
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/dashboard'));
  } else if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request)); // content-hashed, immutable
  } else if (url.pathname.startsWith('/_next/') || url.searchParams.has('_rsc')) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});
