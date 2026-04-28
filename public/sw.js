// ExpenseOne Service Worker — Instant splash shell + NetworkFirst HTML + CacheFirst static + Web Push
// mogllb2r is replaced at build time by next.config.ts
const CACHE_NAME = "expenseone-mogllb2r";

const APP_SHELL = ["/offline.html", "/splash-shell.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  // Don't skipWaiting automatically — wait for user to accept the update
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

  // Instant splash shell — for HTML navigation requests, return cached splash
  // shell immediately so the user sees the splash animation with zero delay.
  // The shell loads the real page in a hidden iframe, then fades in when ready.
  // Skip if _nosplash param is present (request from the shell's iframe).
  if (
    request.mode === "navigate" &&
    request.headers.get("accept")?.includes("text/html") &&
    !url.searchParams.has("_nosplash") &&
    url.pathname !== "/splash-shell.html" &&
    url.pathname !== "/shell-test.html" &&
    url.pathname !== "/offline.html"
  ) {
    event.respondWith(
      caches.match("/splash-shell.html").then((cached) => {
        if (cached) {
          // Clone the cached response and inject the original URL as a header
          // so splash-shell.html can read it. We use a custom response
          // with the same body but add a header for the target URL.
          const originalPath = url.pathname + url.search;
          const headers = new Headers(cached.headers);
          headers.set("X-Original-URL", originalPath);
          return cached.clone().text().then((body) => {
            // Inject the target URL into the HTML
            const injected = body.replace(
              "var targetUrl = location.hash.slice(1) || '/';",
              "var targetUrl = '" + originalPath.replace(/'/g, "\\'") + "';"
            );
            return new Response(injected, {
              status: 200,
              statusText: "OK",
              headers: { "Content-Type": "text/html; charset=utf-8" },
            });
          });
        }
        // No cached shell — fall through to normal fetch
        return fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() =>
            caches.match(request).then((c) => c || caches.match("/offline.html"))
          );
      })
    );
    return;
  }

  // NetworkFirst for HTML pages (including _nosplash iframe requests) — always
  // try the network first to avoid serving stale HTML after a new deployment.
  if (request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
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
