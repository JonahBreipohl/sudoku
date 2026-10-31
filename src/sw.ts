// Hand-written service worker, compiled and stamped with the build's file list by
// scripts/pwa-plugin.ts (vite.config.ts). Update model: a new worker installs into its own cache and
// waits; it activates once no tab uses the old one. Online navigations go to the network first, so a
// reload picks up the new HTML, and any asset the active worker lacks is fetched and cached on demand.
// Game state lives in localStorage, so a version change never touches a game in progress.

// The tsconfig lib has both DOM and WebWorker, so `self` stays Window-typed; narrow it once here.
const sw = self as unknown as ServiceWorkerGlobalScope;

// Replaced at build time; relative to the worker's scope so a sub-path deploy works.
const PRECACHE: string[] = JSON.parse("__PRECACHE_JSON__");
const CACHE = "sudoku-__VERSION__";
const PREFIX = "sudoku-";

const scoped = (path: string): string => new URL(path, sw.registration.scope).href;

sw.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map(scoped))));
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
      }
      await sw.clients.claim();
    })(),
  );
});

async function remember(request: Request, response: Response): Promise<void> {
  if (!response.ok || response.type !== "basic") return;
  const cache = await caches.open(CACHE);
  await cache.put(request, response);
}

// The shell belongs to the scope root alone: on a shared domain, other pages must neither be stored as
// the shell nor be answered with the game when offline.
const scopePath = (): string => new URL(sw.registration.scope).pathname;
const inScope = (url: URL): boolean => url.pathname.startsWith(scopePath());

async function navigate(request: Request): Promise<Response> {
  if (new URL(request.url).pathname !== scopePath()) return fetch(request);
  try {
    const response = await fetch(request);
    void remember(new Request(scoped("./")), response.clone());
    return response;
  } catch {
    const cached = await caches.match(scoped("./"), { ignoreSearch: true, ignoreVary: true });
    if (cached) return cached;
    throw new Error("offline and shell not cached");
  }
}

async function assetOrNetwork(request: Request): Promise<Response> {
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  void remember(request, response.clone());
  return response;
}

sw.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== sw.location.origin || !inScope(url)) return;
  if (request.mode === "navigate" && url.pathname !== scopePath()) return;
  event.respondWith(request.mode === "navigate" ? navigate(request) : assetOrNetwork(request));
});
