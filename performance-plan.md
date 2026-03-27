# ExpenseOne Performance Plan

Generated: 2026-03-27
Based on: Backend Architect performance audit + plan-eng-review

---

## Current Problem

모바일 PWA(홈화면 추가)에서 페이지 이동마다 체감 느림.
매 네비게이션마다 Supabase Auth + DB 쿼리가 캐시 없이 반복 실행되고,
일부 페이지가 Server Component 대신 Client-side fetch 패턴을 사용하여 이중 왕복 발생.

---

## Current Data Flow (per navigation)

```
Middleware (Edge) ──getUser()──→ Supabase Auth (~80ms)
    │
Layout (Node) ──getUser()──→ Supabase Auth (dedupe via cache())
    │         ──from("users").select("*")──→ DB (~40ms)  ← 프로필 쿼리 #1
    │         ──from("notifications").count──→ DB (~30ms)
    │
Page (Node)  ──getCachedCurrentUser()──→ DB (~40ms)      ← 프로필 쿼리 #2 (중복!)
             ──5x dashboard queries──→ DB (~100ms, parallel)

Total: ~290ms server time (no caching across navigations)
+ Splash minimum 1000ms forced delay
+ Client-side pages add another 300-500ms round-trip
```

## Target Data Flow (after optimization)

```
Middleware ──getUser()──→ Auth (~80ms)
    │
Layout ──getCachedCurrentUser()──→ unstable_cache hit (0ms on repeat)
    │
Page   ──<Suspense> streaming──→ shell renders immediately, data async
    │
SW     ──app shell precached──→ HTML/CSS/JS instant on repeat visits (0ms)

Total: ~80ms + streaming (perceived instant)
```

---

## P0 — Immediate Fixes (est. 1,130~1,750ms savings)

### P0-1. Remove splash screen minimum delay
- **File**: `src/app/layout.tsx:103`
- **Current**: `window.__splashMinMs=1000` — forces 1 second wait even if content is ready
- **Fix**: Change to `__splashMinMs=0` or remove minimum entirely
- **Impact**: -600~800ms perceived load time
- **Risk**: Low (cosmetic only)

### P0-2. Convert admin/pending to Server Component
- **File**: `src/app/(dashboard)/admin/pending/page.tsx`
- **Current**: `"use client"` page → useEffect → fetch("/api/expenses") → render
- **Fix**: Server Component that calls `getExpenses()` directly, client component only for approve/reject UI
- **Impact**: -300~500ms TTFB (eliminates client→server→client round-trip)
- **Risk**: Medium (refactor needed, keep approve/reject as client islands)

### P0-3. Convert notifications page to Server Component
- **File**: `src/app/(dashboard)/notifications/page.tsx`
- **Current**: Same client-side fetch pattern as pending
- **Fix**: Server Component with data passed to client component for mark-read interactions
- **Impact**: -200~400ms TTFB
- **Risk**: Medium (similar refactor to P0-2)

### P0-4. Eliminate duplicate user profile query
- **File**: `src/app/(dashboard)/layout.tsx:70`, `src/lib/supabase/cached.ts:29`
- **Current**: Layout queries user via Supabase REST, Page queries again via Drizzle ORM
- **Fix**: Unify to single `getCachedCurrentUser()` in layout, pass user data down via props or context
- **Impact**: -30~50ms per navigation
- **Risk**: Low (straightforward refactor)

---

## P1 — This Sprint (repeat visit speed)

### P1-1. Add cross-request caching with unstable_cache
- **File**: `src/lib/supabase/cached.ts`
- **Current**: `cache()` only deduplicates within a single request
- **Fix**: Wrap `getCachedCurrentUser` with `unstable_cache(fn, [userId], { revalidate: 60 })`
- **Impact**: -30~50ms per navigation (after first visit)
- **Depends on**: P0-4 (unified profile query)

### P1-2. Dashboard amount sum — move to DB aggregate
- **File**: `src/app/(dashboard)/page.tsx:66-72, 120-123`
- **Current**: Fetches ALL approved expense rows, sums in JS
- **Fix**: Use `.select("amount.sum()")` or Supabase aggregate
- **Impact**: -20~50ms + reduced payload (100 rows → 1 row)

### P1-3. Add Suspense streaming to dashboard
- **File**: `src/app/(dashboard)/page.tsx`
- **Current**: Awaits all 5 queries before rendering anything
- **Fix**: Wrap data section in `<Suspense fallback={<Skeleton />}>`, stream shell immediately
- **Impact**: Faster perceived TTFB (header + cards visible while data loads)

### P1-4. Service Worker app shell precaching
- **File**: `public/sw.js`
- **Current**: `install` event only calls `skipWaiting()`, no precaching
- **Fix**: Precache root HTML, main CSS/JS bundles during install
- **Impact**: -200~400ms on repeat visits (app shell from cache)

### P1-5. Add offline fallback page
- **File**: `public/sw.js`, `public/offline.html` (new)
- **Current**: Falls back to `caches.match("/")` which may not exist
- **Fix**: Create offline.html, precache it during install
- **Impact**: Reliability (no blank screen when offline)

### P1-6. Add revalidation on mutations
- **Files**: `src/services/expense.service.ts`, `src/app/api/expenses/*/route.ts`
- **Current**: No `revalidatePath` or `revalidateTag` after mutations
- **Fix**: Call `revalidatePath("/")` after approve/reject/submit/delete
- **Depends on**: P1-1 (cache must exist to be invalidated)

---

## P2 — Backlog

### P2-1. Split globals.css (1,441 lines)
- Extract splash, ambient orbs, glass effects into separate CSS modules
- Impact: -10~20KB initial CSS payload

### P2-2. PWA manifest improvements
- Add `scope`, `id`, maskable icon, screenshots array
- Impact: Better install UX on mobile

### P2-3. Reduce router.refresh() usage (15 occurrences)
- Each call re-runs ALL server component queries
- Replace with targeted `revalidatePath` or SWR-style client cache updates
- Impact: Avoids unnecessary full-page re-fetches

### P2-4. Singleton browser Supabase client
- **File**: `src/lib/supabase/client.ts`
- Current: `createClient()` creates new instance per call
- Fix: Memoize as module-level singleton
- Impact: Minor (SSR deduplication exists, but avoids re-init overhead)

---

## Implementation Order

```
Phase 1 (P0) — ~30min CC time
├── P0-1  Splash delay removal (5min)
├── P0-4  Unify user profile query (10min)
├── P0-2  admin/pending → Server Component (10min)
└── P0-3  notifications → Server Component (10min)

Phase 2 (P1) — ~45min CC time
├── P1-1  unstable_cache (depends on P0-4)
├── P1-2  Dashboard DB aggregate
├── P1-3  Suspense streaming
├── P1-4  SW precaching
├── P1-5  Offline fallback
└── P1-6  Revalidation on mutations

Phase 3 (P2) — ~30min CC time
├── P2-1  CSS splitting
├── P2-2  PWA manifest
├── P2-3  router.refresh reduction
└── P2-4  Client singleton
```

---

## Success Metrics

| Metric | Before (est.) | After P0 | After P1 |
|--------|---------------|----------|----------|
| Dashboard TTFB | ~1,300ms | ~400ms | ~200ms |
| Admin Pending TTFB | ~800ms | ~300ms | ~200ms |
| Notifications TTFB | ~700ms | ~300ms | ~200ms |
| Repeat visit load | ~1,000ms | ~400ms | ~100ms (SW cache) |
| Perceived splash | 1,000ms min | 0ms (instant) | 0ms |

---

## NOT in Scope

- Full offline mode (read/write while offline) — requires significant sync architecture
- ISR/SSG for dashboard pages — data is user-specific, cannot be statically generated
- Edge Runtime migration — current Node.js runtime is fine for this scale
- CDN caching of HTML — pages are authenticated, not cacheable at CDN layer
- Database connection pooling changes — current `max: 1` is correct for serverless
