// Offline support for the PWA: both games run fully in the browser, so caching the pages and
// their static assets is enough to play with no network.
const CACHE = "naija-games-v5";
const PRECACHE = ["/", "/whot", "/ayo", "/style", "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    if (request.mode === "navigate") {
      const home = await cache.match("/");
      if (home) return home;
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Online rooms and accounts need the network anyway. Caching invite pages would only fill the cache, and
  // /profile is where sign-in returns with a one-time ?code= that shouldn't be stored.
  // /_vercel is the analytics script and beacons: never cache them, so offline play stays analytics-free.
  if (url.pathname.startsWith("/play") || url.pathname.startsWith("/profile") || url.pathname.startsWith("/_vercel")) return;
  // Build assets are content-hashed, so a cached copy never goes stale.
  if (url.pathname.startsWith("/_next/static/")) event.respondWith(cacheFirst(request));
  else event.respondWith(networkFirst(request));
});
