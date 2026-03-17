import { type NextRequest, NextResponse } from 'next/server';

// Routes that do not require authentication
const PUBLIC_ROUTES = ['/login', '/auth'];

// Route prefixes that should be completely skipped by middleware
const SKIP_PREFIXES = ['/_next', '/api/auth', '/favicon.ico', '/sw.js', '/manifest.json'];

// Supabase auth cookie name pattern
const AUTH_COOKIE_PATTERN = /^sb-.*-auth-token/;

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

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Lightweight auth check: verify Supabase auth cookie exists
  // Actual token validation happens in layout via getAuthUser()
  const hasAuthCookie = request.cookies.getAll().some(
    (cookie) => AUTH_COOKIE_PATTERN.test(cookie.name) && cookie.value.length > 0
  );

  if (!hasAuthCookie) {
    // No auth cookie — redirect to login
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  // API routes: pass through (API handlers do their own auth via requireAuth())
  // Page routes: pass through (layout does getAuthUser() for real validation)
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
