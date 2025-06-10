import { NextResponse, type NextRequest } from 'next/server';
import { withAuth } from '@kinde-oss/kinde-auth-nextjs/middleware';
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
    '/',
    '/chat/:id',
    '/api/:path*',
    '/login',
    '/register',

    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
