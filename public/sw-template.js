// ExpenseOne Service Worker — NetworkFirst HTML + CacheFirst static + Web Push
// __BUILD_TIMESTAMP__ is replaced at build time by next.config.ts
const CACHE_NAME = "expenseone-__BUILD_TIMESTAMP__";

const APP_SHELL = ["/offline.html", "/splash-shell.html"];

/** 이 캐시 세대가 만들어진 시각. activate에서 세대 순서를 알기 위해 남긴다. */
const STAMP_URL = "/__cache-created";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all([
        cache.addAll(APP_SHELL),
        cache.put(STAMP_URL, new Response(String(Date.now()))),
      ])
    )
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

// 옛 캐시를 **한 세대는 남긴다.**
//
// 예전엔 CACHE_NAME이 아닌 캐시를 전부 지웠다. 그런데 이 SW는 skipWaiting +
// clients.claim으로 **이미 열려 있는 페이지를 곧바로 넘겨받는다.** 그 페이지는
// 옛 빌드의 /_next/static 청크 주소를 들고 있는데, Vercel은 원자적 배포라
// 그 주소가 서버에서 404다. 캐시까지 지워버리면 마지막 사본마저 사라져서,
// 사용자가 링크를 누르는 순간 청크를 못 받아 로딩 스켈레톤에 갇힌다.
// PWA는 창을 며칠씩 열어두므로 이 상황을 정면으로 맞는다.
//
// 직전 세대를 남겨두면 caches.match(전체 캐시 검색)가 옛 청크를 찾아낸다.
// 세대 순서는 install 때 심은 타임스탬프로 판단한다. 스탬프가 없는 아주 옛
// 캐시는 0으로 취급돼 먼저 지워진다.
const KEEP_GENERATIONS = 2;

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      const mine = keys.filter((k) => k.startsWith("expenseone-"));
      const stamped = await Promise.all(
        mine.map(async (name) => {
          if (name === CACHE_NAME) return { name, at: Infinity };
          try {
            const cache = await caches.open(name);
            const res = await cache.match(STAMP_URL);
            return { name, at: res ? Number(await res.text()) || 0 : 0 };
          } catch {
            return { name, at: 0 };
          }
        })
      );
      stamped.sort((a, b) => b.at - a.at);
      const doomed = stamped
        .slice(KEEP_GENERATIONS)
        .map((c) => c.name)
        // 옛 이름 규칙으로 남은 캐시(같은 오리진)는 세대 판단이 불가능하니 정리한다.
        .concat(keys.filter((k) => !k.startsWith("expenseone-")));
      return Promise.all(doomed.map((k) => caches.delete(k)));
    })
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
