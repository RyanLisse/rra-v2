import { withAuth } from '@kinde-oss/kinde-auth-nextjs/middleware';
import { NextResponse, type NextRequest } from 'next/server';

// Optimized static asset patterns
const STATIC_PATTERNS = [
  '/_next/',
  '/api/auth/',
  '/favicon',
  '/manifest.json',
  '/sw.js',
  '/robots.txt',
  '/sitemap.xml',
];

// Optimized file extension check
const FILE_EXTENSIONS =
  /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map)$/;

function handleMiddleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Health check for testing
  if (pathname === '/ping') {
    return new Response('pong', { status: 200 });
  }

  // Allow ping endpoint without authentication
  if (pathname === '/api/ping') {
    return NextResponse.next();
  }

  // Optimized static asset check
  if (
    STATIC_PATTERNS.some((pattern) => pathname.startsWith(pattern)) ||
    FILE_EXTENSIONS.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Allow access to auth pages without authentication
  if (pathname === '/login' || pathname === '/register') {
    return NextResponse.next();
  }

  // Continue with Kinde auth middleware
  return NextResponse.next();
}

// Use Kinde's auth middleware but wrap it with our custom logic
export function middleware(request: NextRequest) {
  // Run our custom middleware first
  const customResponse = handleMiddleware(request);
  
  // If custom middleware wants to handle the request, let it
  if (customResponse.status !== 200 || customResponse.headers.get('location')) {
    return customResponse;
  }

  // For protected routes, delegate to Kinde
  return withAuth(request);
}

function handleUnauthenticated(pathname: string, request: NextRequest) {
  // For API routes (except auth), return 401
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // For other pages, redirect to login
  return NextResponse.redirect(new URL('/login', request.url));
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
