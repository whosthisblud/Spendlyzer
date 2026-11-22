/* Spendlyzer service worker.
 *
 * Registered as /sw.js?v=<build id>&api=<api origin>. A new build id installs a new worker.
 *
 * - Page navigations: network first, then the cached copy, then /offline.
 * - /_next/static/* (content-hashed): cache first.
 * - API GETs: network first; the last good response is kept so the app can show saved data
 *   offline. API caches are partitioned per user (the `sub` claim of the bearer token) so one
 *   account never sees another's data on a shared device, and are deleted on sign-out.
 * - Everything else (API writes, Supabase auth, third parties) is not intercepted.
 */
const params = new URL(self.location.href).searchParams;
const VERSION = params.get("v") || "dev";
const API_ORIGIN = params.get("api") || "";

const SHELL_CACHE = `shell-${VERSION}`;
const PAGES_CACHE = `pages-${VERSION}`;
const STATIC_CACHE = "static";
const API_PREFIX = "api-";

const SHELL = ["/offline", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/favicon-32.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, PAGES_CACHE, STATIC_CACHE]);
      for (const key of await caches.keys()) {
        if (!keep.has(key) && !key.startsWith(API_PREFIX)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

/** Saves a visited page if it is not cached yet. Client-side (in-app) navigations never reach the
 * fetch handler as navigations, so the app reports each route it shows. */
async function savePage(path) {
  const url = new URL(path, self.location.origin);
  if (url.origin !== self.location.origin) return;
  url.search = "";
  const cache = await caches.open(PAGES_CACHE);
  if (await cache.match(url.href)) return;
  try {
    const response = await fetch(url.href, { credentials: "same-origin" });
    if (response.ok && (response.headers.get("Content-Type") || "").includes("text/html")) await cache.put(url.href, response);
  } catch {
    // Offline or server unreachable: nothing to save.
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "CACHE_PAGE" && typeof event.data.path === "string") event.waitUntil(savePage(event.data.path));
});

function userPartition(request) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    const sub = String(payload.sub || "").toLowerCase();
    return /^[a-z0-9-]{1,64}$/.test(sub) ? API_PREFIX + sub : null;
  } catch {
    return null;
  }
}

// Cache writes are passed to event.waitUntil so the browser cannot stop the worker before
// they finish; otherwise visited pages may silently be missing offline.
async function networkFirstPage(event) {
  const { request } = event;
  const cache = await caches.open(PAGES_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) event.waitUntil(cache.put(request, response.clone()));
    return response;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) || (await caches.match("/offline")) || Response.error();
  }
}

async function cacheFirstStatic(event) {
  const { request } = event;
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) event.waitUntil(cache.put(request, response.clone()));
  return response;
}

async function networkFirstApi(request, partition) {
  const cache = await caches.open(partition);
  try {
    const response = await fetch(request);
    if (response.ok) {
      const headers = new Headers(response.headers);
      headers.set("X-Spendlyzer-Cached-At", new Date().toISOString());
      const body = await response.clone().arrayBuffer();
      await cache.put(request.url, new Response(body, { status: response.status, statusText: response.statusText, headers }));
    }
    return response;
  } catch (err) {
    const hit = await cache.match(request.url);
    if (!hit) throw err;
    const headers = new Headers(hit.headers);
    headers.set("X-Spendlyzer-Offline", "1");
    return new Response(await hit.arrayBuffer(), { status: hit.status, statusText: hit.statusText, headers });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(networkFirstPage(event));
  } else if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirstStatic(event));
  } else if (API_ORIGIN && url.origin === API_ORIGIN && url.pathname.startsWith("/api/")) {
    const partition = userPartition(request);
    if (partition) event.respondWith(networkFirstApi(request, partition));
  }
});
