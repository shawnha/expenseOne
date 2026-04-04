import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Routes that do not require authentication
const PUBLIC_ROUTES = ['/login', '/auth'];

// Route prefixes that should be completely skipped by middleware
const SKIP_PREFIXES = ['/_next', '/api/auth', '/api/debug-db', '/favicon.ico', '/sw.js', '/manifest.json', '/splash-shell.html'];

// Supabase auth cookie prefix
const SUPABASE_AUTH_COOKIE_PREFIX = 'sb-';

// Refresh buffer: call updateSession only when token expires within this window
const REFRESH_BUFFER_SEC = 120;

/**
 * Fast check: does the request carry a Supabase auth cookie?
 */
function hasAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some(
    (c) => c.name.startsWith(SUPABASE_AUTH_COOKIE_PREFIX) && c.name.includes('-auth-token')
  );
}

/**
 * Decode JWT expiry from the auth cookie without network call.
 * Supabase stores a chunked or single base64url-encoded JWT.
 * Returns seconds until expiry, or -1 if unreadable.
 */
function getTokenExpiryInSec(request: NextRequest): number {
  try {
    // Supabase stores token in sb-<ref>-auth-token (single) or sb-<ref>-auth-token.0, .1 etc. (chunked)
    const cookies = request.cookies.getAll();
    const tokenCookies = cookies
      .filter((c) => c.name.startsWith(SUPABASE_AUTH_COOKIE_PREFIX) && c.name.includes('-auth-token'))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (tokenCookies.length === 0) return -1;

    // Reassemble the value (chunked cookies are joined in order)
    let raw = tokenCookies.map((c) => c.value).join('');

    // Supabase wraps the token value in base64 JSON: decode outer layer
    // The cookie value is a base64url-encoded JSON array: [access_token, refresh_token, ...]
    // or just the raw JWT. Try parsing as JSON first.
    try {
      const decoded = JSON.parse(raw);
      // Could be an array or object
      const accessToken = Array.isArray(decoded) ? decoded[0] : decoded.access_token;
      if (accessToken) raw = accessToken;
    } catch {
      // raw might be the JWT itself or base64-encoded
      const base64Decoded = atob(raw.replace(/-/g, '+').replace(/_/g, '/'));
      try {
        const parsed = JSON.parse(base64Decoded);
        const accessToken = Array.isArray(parsed) ? parsed[0] : parsed.access_token;
        if (accessToken) raw = accessToken;
      } catch {
        // Not JSON, might be JWT directly
      }
    }

    // Now raw should be a JWT (header.payload.signature)
    const parts = raw.split('.');
    if (parts.length !== 3) return -1;

    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.exp) return -1;

    return payload.exp - Math.floor(Date.now() / 1000);
  } catch {
    return -1;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static assets and Next.js internals
  if (SKIP_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // DEV ONLY: Bypass auth for frontend preview (never in production)
  if (process.env.BYPASS_AUTH === 'true' && process.env.NODE_ENV === 'development') {
    return NextResponse.next();
  }

  // Allow public routes — run updateSession only if token needs refresh
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    if (hasAuthCookie(request)) {
      const ttl = getTokenExpiryInSec(request);
      if (ttl >= 0 && ttl > REFRESH_BUFFER_SEC) {
        return NextResponse.next();
      }
      const { supabaseResponse } = await updateSession(request);
      return supabaseResponse;
    }
    return NextResponse.next();
  }

  // No auth cookie → redirect immediately (no network call)
  if (!hasAuthCookie(request)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  // Auth cookie exists → check JWT expiry locally
  const ttl = getTokenExpiryInSec(request);

  if (ttl >= 0 && ttl > REFRESH_BUFFER_SEC) {
    // Token still valid and not near expiry → pass through immediately (no network call)
    return NextResponse.next();
  }

  // Token expired, near expiry, or unreadable → call updateSession for refresh
  const { user, supabaseResponse } = await updateSession(request);

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|splash-shell\\.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
