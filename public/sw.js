// ExpenseOne Service Worker — NetworkFirst HTML + CacheFirst static + Web Push
// mry975xe is replaced at build time by next.config.ts
const CACHE_NAME = "expenseone-mry975xe";

const APP_SHELL = ["/offline.html", "/splash-shell.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  // Activate immediately. A previously-deployed SW could trap users on the
  // splash screen (see fetch handler note); waiting for the user to tap an
  // update prompt is impossible when they're stuck on a loading splash, so a
  // fixed SW must be able to replace a broken one on its own.
  self.skipWaiting();
});

// When the client sends SKIP_WAITING, activate the new SW immediately
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, API calls, Supabase, auth routes, login, and build-info
  if (
    request.method !== "GET" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname === "/login" ||
    url.pathname === "/build-info.json" ||
    url.hostname.includes("supabase")
  ) {
    return;
  }

  // CacheFirst for immutable static assets (_next/static has content hash)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  // CacheFirst for other static files (images, fonts, icons)
  if (url.pathname.match(/\.(woff2?|png|jpg|jpeg|svg|ico|webp)$/)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  // NOTE: We intentionally do NOT intercept navigations with an iframe-based
  // "splash shell" anymore. That mechanism served a cached splash-shell.html
  // that revealed the real page only when a hidden iframe fired `load`, and its
  // only escape hatch (a 10s window.location.replace WITHOUT _nosplash) just
  // re-triggered this SW to serve the shell again — an infinite splash loop
  // whenever the iframe was slow to load. Navigations now go NetworkFirst to the
  // real page, which renders its own inline splash (app/layout.tsx) with a
  // guaranteed 3s dismiss. Simpler and impossible to get stuck on.

  // NetworkFirst for HTML pages — always
  // try the network first to avoid serving stale HTML after a new deployment.
  if (request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only cache a genuine, same-URL page. Do NOT cache redirected
          // responses (e.g. an auth 307 landing on /login): a cached redirected
          // response, when later served for a navigation on a network blip, is
          // rejected by the browser ("redirected flag set") and the page renders
          // blank. Caching only clean 200s keeps the offline fallback safe.
          if (response.ok && !response.redirected) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match("/offline.html"))
        )
    );
    return;
  }

  // NetworkFirst for JS/CSS files not under _next/static (e.g. _next/data)
  // These can change between deployments and must not serve stale versions
  if (url.pathname.match(/\.(js|css)$/) || url.pathname.startsWith("/_next/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }
});

// ---------------------------------------------------------------------------
// Web Push Notifications
// ---------------------------------------------------------------------------
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  // Always show notification — even when app is in foreground
  // (Service Worker push events always fire regardless of app state)
  event.waitUntil(
    self.registration.showNotification(data.title || "ExpenseOne", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || `push-${Date.now()}`,
      renotify: true,
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let targetUrl = event.notification.data?.url || "/";

  // Convert absolute URL to path for matching
  try {
    const parsed = new URL(targetUrl);
    if (parsed.origin === self.location.origin) {
      targetUrl = parsed.pathname + parsed.search;
    }
  } catch {
    // Already a relative path
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Try to find an existing window and navigate it
      for (const client of windowClients) {
        if ("focus" in client) {
          return client.focus().then(() => {
            if ("navigate" in client) {
              return client.navigate(targetUrl);
            }
          });
        }
      }
      // No existing window — open a new one
      return clients.openWindow(targetUrl);
    })
  );
});
