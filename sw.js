/* FitFlow service worker — cache-first app shell */
const CACHE = "fitflow-v14";
const SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/storage.js",
  "./js/api.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first: always take the freshest file when online, fall back to cache offline.
// (Cache-first made updates arrive late — the whole point of this change.)
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Never intercept API calls or cross-origin requests
  if (url.origin !== location.origin || e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(cached => cached || caches.match("./index.html")))
  );
});
