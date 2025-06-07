import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth/config';
import { guestRegex } from './lib/constants';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /*
   * Playwright starts the dev server and requires a 200 status to
   * begin the tests, so this ensures that the tests can start
   */
  if (pathname.startsWith('/ping')) {
    return new Response('pong', { status: 200 });
  }

  // Skip middleware for static assets and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname.includes('.') // Skip files with extensions (images, etc.)
  ) {
    return NextResponse.next();
  }

  // Allow access to login/register pages without authentication
  if (pathname === '/login' || pathname === '/register') {
    // Check if user is already authenticated
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    
    if (session?.user) {
      const isGuest =
        (session.user as any)?.type === 'guest' ||
        guestRegex.test(session.user?.email ?? '');
      
      // Redirect authenticated non-guest users away from auth pages
      if (!isGuest) {
        return NextResponse.redirect(new URL('/', request.url));
      }
    }
    
    return NextResponse.next();
  }

  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    // For API routes (except auth), return 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // For the homepage, redirect to guest auth endpoint
    if (pathname === '/') {
      const guestAuthUrl = new URL('/api/auth/guest', request.url);
      guestAuthUrl.searchParams.set('redirectUrl', request.url.toString());
      return NextResponse.redirect(guestAuthUrl);
    }

    // For other pages, redirect to login
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match specific routes that need authentication handling:
     * - Root page
     * - Chat pages
     * - API routes
     * - Auth pages
     * - Documents page
     */
    '/',
    '/chat/:path*',
    '/api/:path*',
    '/login',
    '/register',
    '/documents',
  ],
};
