import { withAuth } from '@kinde-oss/kinde-auth-nextjs/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { guestRegex } from './lib/constants';

export default withAuth(
  async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    /*
     * Playwright starts the dev server and requires a 200 status to
     * begin the tests, so this ensures that the tests can start
     */
    if (pathname.startsWith('/ping')) {
      return new Response('pong', { status: 200 });
    }

    // Allow Kinde auth routes
    if (pathname.startsWith('/api/auth')) {
      return NextResponse.next();
    }

    // For authenticated users, handle redirects
    const kindeUser = request.kindeAuth?.user;
    
    if (kindeUser) {
      const isGuest = guestRegex.test(kindeUser.email ?? '');
      
      if (!isGuest && ['/login', '/register'].includes(pathname)) {
        return NextResponse.redirect(new URL('/', request.url));
      }
    }

    return NextResponse.next();
  },
  {
    isReturnToCurrentPage: true,
    loginPage: '/api/auth/login',
    isAuthorized: ({ token }) => {
      // Allow access for all authenticated users
      return !!token;
    },
  }
);

export const config = {
  matcher: [
    /*
     * Match specific routes that need authentication handling:
     * - Root page
     * - Chat pages
     * - API routes
     * - Auth pages
     * - Documents page
     * - Ping endpoint for health checks
     */
    '/',
    '/ping',
    '/chat/:path*',
    '/api/:path*',
    '/login',
    '/register',
    '/documents',
  ],
};
