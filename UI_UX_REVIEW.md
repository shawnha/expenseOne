# ExpenseOne UI/UX Review Report
**Date**: 2026-03-30
**Reviewers**: UX Architect, UI Designer, Accessibility Auditor (3 agents, 2 rounds)

## Critical (P0)

### C-01. Dark Mode Toggle Destroys Session
- **Where**: All pages
- **Issue**: Toggling dark mode kicks user to login page. Session/cookie lost.
- **Fix**: Theme toggle must use client-side class swap only, never trigger route change or cookie clear.

### C-02. Admin Routes 404 / Silent Redirect
- **Where**: `/admin/dashboard` (404), `/admin/users`, `/admin/reports` (redirect to home)
- **Issue**: Admin pages non-functional. 404 page is raw Next.js, no branding.
- **Fix**: Create missing admin routes, build custom not-found.tsx, show permission error instead of silent redirect.

### C-03. Pinch-to-Zoom Disabled (maximumScale: 1)
- **Where**: `src/app/layout.tsx` line 16
- **Issue**: Low-vision users cannot zoom. WCAG 1.4.4 violation.
- **Fix**: Remove `maximumScale: 1` from viewport config.

---

## High (P1)

### H-01. Desktop Sidebar Only 2 Nav Items
- **Where**: Desktop sidebar
- **Issue**: Only "Home" and "Expense Management". No Notifications, Settings, Admin links.
- **Fix**: Add nav items or collapse to icon rail.

### H-02. Push Banner Touch Targets Below 44px
- **Where**: `src/components/layout/push-prompt.tsx`
- **Issue**: "Close" button ~20px height. Below Apple HIG 44px minimum.
- **Fix**: Increase padding to min-h-[44px].

### H-03. Push Banner on Every Page Including Forms
- **Where**: Dashboard layout
- **Issue**: Banner shows on form pages (distraction) and notifications page (redundant). Uses sessionStorage so reappears every session.
- **Fix**: Restrict to home only, use localStorage with backoff.

### H-04. Mobile Form Obscured by Tab Bar + Banner (~130px)
- **Where**: Corporate card form, deposit request form (mobile)
- **Issue**: Bottom content hidden behind stacked tab bar + push banner.
- **Fix**: Add padding-bottom calc for safe area + chrome height. Consider sticky submit button.

### H-05. Font Sizes 9-10px Throughout
- **Where**: Bottom tab labels (10px), badge counts (9px), timestamps (11px)
- **Issue**: Below readability threshold for Korean characters, especially 40+ age users.
- **Fix**: Tab labels 11px min, badges 10px min, timestamps 12px min.

### H-06. Glass Ambient Orbs Not Visible
- **Where**: Dashboard layout
- **Issue**: Orbs clipped or opacity too low. Cards appear as opaque white, not frosted glass.
- **Fix**: Increase orb opacity/size, ensure z-index and overflow don't clip them.

### H-07. Accessibility: FAB aria-label Missing, Focus Indicators Removed
- **Where**: `src/app/(dashboard)/page.tsx` (FAB), `src/components/layout/sidebar.tsx` (menu button)
- **Issue**: Screen readers say "link" with no description. Menu button has all focus styles suppressed.
- **Fix**: Add `aria-label="새 비용 제출"`, restore focus-visible ring.

### H-08. Settings Page Lacks Visual Hierarchy
- **Where**: Settings page (desktop + mobile)
- **Issue**: No card grouping, flat layout, empty "Role Settings" panel, no cancel button.
- **Fix**: Group into card sections, hero profile header, remove empty role panel.

### H-09. Form Missing Required Field Indicators
- **Where**: Corporate card form, deposit request form
- **Issue**: No asterisks on required fields. Category pill selected state unclear.
- **Fix**: Add red asterisk to required labels, show filled state on selected pills.

### H-10. Notification Badge Count Not Exposed to Screen Readers
- **Where**: `src/components/layout/header.tsx`, bottom-tab-bar.tsx
- **Issue**: No aria-live region for realtime updates. Badge is visual only.
- **Fix**: Dynamic aria-label with count, role="status" live region.

### H-11. Typography Classes Defined But Unused
- **Where**: `globals.css` defines .text-title1 through .text-caption2
- **Issue**: Pages use inline Tailwind (text-[22px], text-lg) instead of semantic classes.
- **Fix**: Replace inline with semantic classes for consistent typography.

---

## Medium (P2) - 14 items

| # | Issue |
|---|-------|
| M-01 | Notification card excessive whitespace, no empty state illustration |
| M-02 | Dashboard stat cards inconsistent icon/value sizing |
| M-03 | Form pages no breadcrumb or labeled back button |
| M-04 | Form submit buttons low-contrast and generic |
| M-05 | Dashboard empty state text only, no CTA |
| M-06 | Theme toggle small touch target + mobile header space waste |
| M-07 | Dashboard action buttons lack explanatory descriptions |
| M-08 | Page-level spacing inconsistent (gap-4/5/6 mixed) |
| M-09 | Timestamp color #c7c7cc contrast ratio 1.9:1 (WCAG fail) |
| M-10 | Dark mode secondary-label contrast 3.8:1 (needs 4.5:1) |
| M-11 | Dark mode login card button low contrast |
| M-12 | Card vs glass-card dual styling system |
| M-13 | No prefers-reduced-motion media query |
| M-14 | Notification badge style inconsistent between desktop/mobile |

---

## Low (P3) - 4 items

| # | Issue |
|---|-------|
| L-01 | Settings save button no disabled state when unchanged |
| L-02 | Bottom tab "Submit" label ambiguous |
| L-03 | Login page decorative SVGs missing aria-hidden |
| L-04 | Login button loading state no screen reader announcement |

---

## What's Working Well

- Mobile bottom tab bar: Well-structured, safe area respected, center FAB prominent
- Glass CSS system: 3-tier hierarchy (glass, glass-strong, glass-subtle) is well-designed
- Apple system color tokens: Exact iOS colors with dark mode variants
- Theme toggle ARIA: Proper role="switch" with aria-checked
- lang="ko" correctly set
- Skeleton loading UI well-implemented
- Expense filters: role="search" with aria-label
- Push banner design aesthetics (when properly sized)
- Stat card color coding (blue/green/yellow/orange)
- Korean formatting (yyyy.mm.dd, 1,000원) consistent

---

## Recommended Fix Priority

```
Phase 1 (Critical):  C-01 Dark mode session → C-02 Admin routes → C-03 Pinch zoom
Phase 2 (High UX):   H-02~03 Push banner → H-04 Mobile form padding → H-01 Sidebar
Phase 3 (High UI):   H-06 Glass effect → H-08~09 Settings/form → H-05 Font sizes
Phase 4 (A11y):      H-07 ARIA → H-10 Notifications → Remaining a11y
Phase 5 (Polish):    Medium items in batch
```
