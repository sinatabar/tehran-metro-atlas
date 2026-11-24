// Registered only after a reader explicitly asks to save the atlas offline.
const key = "__CACHE_KEY__";
// The build prepends the asset manifest for this release.
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(key)
      .then((cache) => cache.addAll(assets))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      for (const old of await caches.keys())
        if (old.startsWith("atlas-") && old !== key) await caches.delete(old);
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== location.origin ||
    !url.href.startsWith(self.registration.scope)
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(key);
      if (event.request.mode === "navigate") {
        try {
          const response = await fetch(event.request);
          return response;
        } catch {
          /* Try the cached application shell. */
        }
        return (
          (await cache.match(new URL(url.pathname, self.registration.scope))) ||
          (await cache.match(new URL("./", self.registration.scope))) ||
          Response.error()
        );
      }
      const cached = await cache.match(event.request, { ignoreVary: true });
      return cached || fetch(event.request);
    })(),
  );
});
