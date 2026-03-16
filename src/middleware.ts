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

  // ⚠️ DEV ONLY: Bypass auth for frontend preview (never in production)
  if (process.env.BYPASS_AUTH === 'true' && process.env.NODE_ENV === 'development') {
    return NextResponse.next();
  }

  // Allow public routes without session refresh
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  try {
    // Refresh session and get user
    const { user, supabaseResponse } = await updateSession(request);

    // Redirect unauthenticated users to login
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(url);
    }

    // NOTE: Onboarding check and admin route protection are handled
    // in server components and API routes (not middleware) to avoid
    // Edge Runtime DB query issues.

    return supabaseResponse;
  } catch (e) {
    // If session refresh fails, redirect to login for page routes
    // API routes get a pass so they can return proper error responses
    console.error('Middleware error:', e);
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Session error' } },
        { status: 401 },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
