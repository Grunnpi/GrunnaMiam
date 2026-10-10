const CACHE_NAME = "mes-recettes-v1";
const APP_SCOPE = self.registration.scope;
const APP_SHELL = new URL("./", APP_SCOPE).href;
const CORE_ASSETS = [
  new URL("manifest.webmanifest", APP_SCOPE).href,
  new URL("icons/icon.svg", APP_SCOPE).href,
  new URL("icons/icon-192.png", APP_SCOPE).href,
  new URL("icons/icon-512.png", APP_SCOPE).href,
  new URL("icons/icon-512-maskable.png", APP_SCOPE).href,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const shellResponse = await fetch(APP_SHELL, { cache: "reload" });
      const shellMarkup = await shellResponse.clone().text();
      const linkedAssets = Array.from(
        shellMarkup.matchAll(/(?:href|src)=["']([^"']+)["']/g),
        (match) => new URL(match[1], APP_SHELL)
      )
        .filter((url) => url.origin === self.location.origin)
        .map((url) => url.href);

      await cache.put(APP_SHELL, shellResponse);
      await cache.addAll([...new Set([...CORE_ASSETS, ...linkedAssets])]);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(APP_SHELL, copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) || caches.match(APP_SHELL))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok || response.type === "opaque") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
    )
  );
});
