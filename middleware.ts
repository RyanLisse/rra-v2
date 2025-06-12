import { withAuth } from '@kinde-oss/kinde-auth-nextjs/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { guestRegex } from './lib/constants';

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /*
   * Playwright starts the dev server and requires a 200 status to
   * begin the tests, so this ensures that the tests can start
   */
  if (pathname.startsWith('/ping') || pathname.startsWith('/api/ping')) {
    return new Response('pong', { status: 200 });
  }

  // Public routes that don't require authentication
  const publicRoutes = [
    '/',
    '/login',
    '/register',
    '/api/health',
    '/api/ping',
    '/api/auth/status',
  ];

  const isPublicRoute = publicRoutes.includes(pathname) || 
    pathname.startsWith('/api/auth/');

  // For public routes, skip authentication entirely
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // For protected routes, use withAuth
  return withAuth(
    async function middleware(request: NextRequest) {
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
      isAuthorized: ({ token }: { token: any }) => {
        // All routes that reach this point require authentication
        return !!token;
      },
      onError: (error: Error, request: NextRequest) => {
        console.error('Kinde Middleware Error:', error.message);
        
        // For state errors or JWKS errors, clear session and redirect
        if (error.message.includes('State not found') || 
            error.message.includes('JWKS') || 
            error.message.includes('AbortError') ||
            error.message.includes('fetch failed')) {
          console.log('Auth session error, clearing cookies and redirecting');
          const clearUrl = new URL('/api/auth/clear-session', request.url);
          
          // Add retry flag for network-related errors
          if (error.message.includes('JWKS') || error.message.includes('fetch')) {
            clearUrl.searchParams.set('retry', 'true');
          }
          
          const response = NextResponse.redirect(clearUrl);
          
          // Clear cookies directly in middleware as well
          const cookiesToClear = [
            'kinde-access-token',
            'kinde-refresh-token', 
            'kinde-user',
            'kinde-id-token',
            'ac-state-key',
            'kinde-state',
            'kinde-pkce-verifier'
          ];
          
          cookiesToClear.forEach(cookieName => {
            response.cookies.delete(cookieName);
          });
          
          return response;
        }
        
        // For other auth errors, redirect to login
        if (error.message.includes('Authentication') || error.message.includes('Unauthorized')) {
          return NextResponse.redirect(new URL('/api/auth/login', request.url));
        }
        
        // Default error handling with better logging
        console.error('Unhandled middleware error:', {
          message: error.message,
          stack: error.stack,
          url: request.url,
        });
        
        return NextResponse.redirect(new URL('/?error=auth_error', request.url));
      },
    }
  )(request);
}

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
