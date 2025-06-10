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
    if (pathname.startsWith('/ping') || pathname.startsWith('/api/ping')) {
      return new Response('pong', { status: 200 });
    }

    // Allow Kinde auth routes and health endpoints
    if (
      pathname.startsWith('/api/auth') ||
      pathname.startsWith('/api/health')
    ) {
      return NextResponse.next();
    }

    // For authenticated users, handle redirects
    const kindeUser = (request as any).kindeAuth?.user;

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
    isAuthorized: ({
      token,
      request,
    }: { token: any; request: NextRequest }) => {
      const pathname = request?.nextUrl?.pathname;

      // Allow health check endpoints without authentication
      if (
        pathname?.startsWith('/api/ping') ||
        pathname?.startsWith('/api/health') ||
        pathname?.startsWith('/ping')
      ) {
        return true;
      }

      // Allow access for all authenticated users
      return !!token;
    },
  },
);

export const config = {
  matcher: [
    /*
     * Match specific routes that need authentication handling:
     * - Root page
     * - Chat pages
     * - API routes (except health endpoints)
     * - Auth pages
     * - Documents page
     */
    '/',
    '/chat/:path*',
    '/api/((?!ping|health).*)', // Exclude ping and health from auth
    '/login',
    '/register',
    '/documents',
  ],
};
