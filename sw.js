
const CACHE_PREFIX = "clp-brl-";
const CACHE = `${CACHE_PREFIX}v43`;
const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=43",
  "./app.js?v=43",
  "./js/money.js",
  "./js/location.js",
  "./js/rates.js",
  "./js/session-store.js",
  "./js/snow-motion.js",
  "./js/weather.js",
  "./manifest.json",
  "./favicon.ico",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-180.png"
];
const ASSET_PATHS = new Set(ASSETS.map(asset => new URL(asset, self.location.href).pathname));
const OFFLINE_DOCUMENT = new URL("./index.html", self.location.href).href;

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function cacheSuccessfulResponse(request, response) {
  if (!response.ok) return;

  const url = new URL(request.url);
  if (request.mode !== "navigate" && !ASSET_PATHS.has(url.pathname)) return;

  try {
    const cache = await caches.open(CACHE);
    const cacheKey = request.mode === "navigate" ? OFFLINE_DOCUMENT : request;
    await cache.put(cacheKey, response.clone());
  } catch {
    // Falhas de quota do cache não devem invalidar uma resposta de rede utilizável.
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    await cacheSuccessfulResponse(request, response);
    return response;
  } catch {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;

    if (request.mode === "navigate") {
      const offlineDocument = await caches.match(OFFLINE_DOCUMENT);
      if (offlineDocument) return offlineDocument;
    }

    return new Response("Recurso indisponível sem conexão.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  if (new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(networkFirst(event.request));
});
