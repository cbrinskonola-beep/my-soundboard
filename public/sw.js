const CACHE = "soundspace-v1";
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const response = await fetch("./index.html", { cache: "reload" });
      if (!response.ok) throw Error("App shell unavailable");
      const html = await response.text();
      const paths = [
        ...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g),
      ].map((m) => new URL(m[1], self.registration.scope).href);
      await cache.put(
        "./index.html",
        new Response(html, { headers: { "Content-Type": "text/html" } }),
      );
      await cache.addAll([
        "./",
        "./manifest.webmanifest",
        "./icon.svg",
        "./icon-192.png",
        "./icon-512.png",
        ...paths,
      ]);
    })(),
  );
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    new URL(event.request.url).origin !== self.location.origin
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(event.request, { ignoreVary: true });
      if (hit) return hit;
      try {
        const r = await fetch(event.request);
        if (
          r.ok &&
          ["script", "style", "image"].includes(event.request.destination)
        )
          await cache.put(event.request, r.clone());
        return r;
      } catch (e) {
        if (event.request.mode === "navigate")
          return await cache.match("./index.html");
        throw e;
      }
    })(),
  );
});
