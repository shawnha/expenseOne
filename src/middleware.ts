import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Routes that do not require authentication
const PUBLIC_ROUTES = ['/login', '/auth'];

// Route prefixes that should be completely skipped by middleware
const SKIP_PREFIXES = ['/_next', '/api/auth', '/favicon.ico', '/sw.js', '/manifest.json'];

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

  // Allow public routes — still run updateSession to handle PKCE cookie forwarding
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    const { supabaseResponse } = await updateSession(request);
    return supabaseResponse;
  }

  // Run updateSession to refresh auth tokens and forward cookies (including PKCE verifier)
  const { user, supabaseResponse } = await updateSession(request);

  if (!user) {
    // No valid session — redirect to login
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
