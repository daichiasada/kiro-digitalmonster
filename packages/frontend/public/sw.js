/*
 * Hand-rolled Service Worker for the AI Monster PWA.
 *
 * ZERO dependencies: plain JS, no imports, no Workbox. Served verbatim from the
 * site root (Vite copies packages/frontend/public/ into dist/ with base "./",
 * and CloudFront serves dist/ at the root).
 *
 * ============================================================================
 * WHY THIS UPDATES CORRECTLY UNDER CLOUDFRONT (CACHING_OPTIMIZED + /* invalidate)
 * ============================================================================
 * The deploy target is S3 + CloudFront. CloudFront caches aggressively and the
 * CDK BucketDeployment invalidates /* on every deploy. The SW must never strand
 * a user on stale HTML or, worse, a stale runtime API URL. The strategy:
 *
 *   1. CONTENT-HASHED ASSETS => NEW URLS ON DEPLOY.
 *      Vite emits JS/CSS under /assets/ with a content hash in the filename, so
 *      any changed asset has a brand-new URL. That makes stale-while-revalidate
 *      safe for them: a cached entry can only ever satisfy the exact same bytes,
 *      and a new build simply requests a different URL that misses the cache.
 *
 *   2. NETWORK-FIRST HTML / NAVIGATIONS => NEW index.html ON NEXT ONLINE LOAD.
 *      index.html is NOT hashed (its URL is stable) and it is what references
 *      the hashed asset URLs. If we served it cache-first we could pin users to
 *      an old index.html that points at asset URLs purged by the /* invalidation
 *      (=> broken app). So navigations/HTML go to the network first; we only
 *      fall back to the cached copy when offline. On the next online load after
 *      a deploy the fresh index.html is fetched and it references the new hashed
 *      assets.
 *
 *   3. config.json IS BYPASSED ENTIRELY => NEVER A STALE API URL.
 *      The app fetches /config.json at startup (with cache:"no-store") to learn
 *      the runtime apiBaseUrl, which the CDK deploy writes into the bucket. If
 *      the SW ever cached and replayed config.json, a user could be pinned to an
 *      OLD API endpoint after an infra change. Any request whose path ends with
 *      "/config.json" is therefore answered with a plain network fetch — no
 *      cache.match, no cache.put, ever.
 *
 *   4. BUMPABLE CACHE_VERSION + activate CLEANUP => OLD CACHES PURGED.
 *      All entries live in a single cache named from CACHE_VERSION. Bumping the
 *      version (e.g. "ddm-v1" -> "ddm-v2") on a release that needs a hard reset
 *      starts a fresh cache, and the activate handler deletes every cache whose
 *      name is not the current one.
 *
 *   5. skipWaiting() + clients.claim() => NEW SW ACTIVATES WITHOUT CLOSING TABS.
 *      install calls skipWaiting() so a newly installed SW does not wait behind
 *      the old one; activate calls clients.claim() so it controls open pages
 *      immediately. CAVEAT: on the VERY FIRST install the page that triggered
 *      registration is already loaded uncontrolled, so SW caching only begins on
 *      the next load — expected, and harmless (the first load went to network).
 */

const CACHE_VERSION = "ddm-v1";
const CACHE_NAME = `cache-${CACHE_VERSION}`;

self.addEventListener("install", () => {
  // Take over as soon as possible rather than waiting behind an old SW.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        );
      } catch {
        // A failed cleanup must never block activation.
      }
      try {
        await self.clients.claim();
      } catch {
        // Ignore: claiming is best-effort.
      }
    })(),
  );
});

/** Network-first: try the network, cache a copy on success, fall back to cache offline. */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    } catch {
      // A failed cache write must not break the response.
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request).catch(() => undefined);
    if (cached) {
      return cached;
    }
    throw err;
  }
}

/** Stale-while-revalidate: serve cache if present, refresh the cache in the background. */
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request).catch(() => undefined);
  const network = fetch(request)
    .then(async (response) => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      } catch {
        // Ignore cache write failures.
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    // Kick off the revalidation but return the cached copy immediately.
    return cached;
  }
  const response = await network;
  if (response) {
    return response;
  }
  // Nothing cached and the network failed: let it surface as a normal fetch.
  return fetch(request);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // (a) Only handle same-origin GET requests; let everything else (POST, API
  //     calls, cross-origin, etc.) fall through to the network untouched.
  if (request.method !== "GET") {
    return;
  }
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) {
    return;
  }

  // (b) config.json: ALWAYS a plain network fetch — never cached, never served
  //     from cache — so the runtime apiBaseUrl is always fresh. See the header
  //     comment: caching this could strand users on an old API URL.
  if (url.pathname.endsWith("/config.json")) {
    event.respondWith(fetch(request));
    return;
  }

  // (c) Navigations / HTML: network-first so a new deploy's index.html (and the
  //     new content-hashed asset URLs it references) is picked up when online.
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(networkFirst(request));
    return;
  }

  // (d) Other same-origin static assets (hashed JS/CSS, icons, manifest):
  //     stale-while-revalidate — safe because hashed filenames change on change.
  event.respondWith(staleWhileRevalidate(request));
});
