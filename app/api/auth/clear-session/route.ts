import { type NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const retry = request.nextUrl.searchParams.get('retry');
  const error = request.nextUrl.searchParams.get('error');
  const loopCount = Number.parseInt(request.nextUrl.searchParams.get('loop') || '0');
  
  console.log('Clearing auth session', { retry, error, loopCount });
  
  // Break redirect loops
  if (loopCount > 2 || error === 'top_level_destructure') {
    console.log('Breaking redirect loop, returning error page');
    const homeUrl = new URL('/', request.url);
    homeUrl.searchParams.set('error', 'auth_configuration_error');
    homeUrl.searchParams.set('message', 'Please check Kinde configuration');
    const response = NextResponse.redirect(homeUrl);
    
    // Clear cookies and return
    clearAllAuthCookies(response);
    return response;
  }
  
  // Determine redirect URL - avoid going back to login if we're in a loop
  const redirectUrl = retry === 'true' && loopCount === 0
    ? new URL('/api/auth/login', request.url)
    : new URL('/', request.url);
    
  // Add loop counter to prevent infinite redirects
  if (retry === 'true') {
    redirectUrl.searchParams.set('loop', (loopCount + 1).toString());
  }
  
  const response = NextResponse.redirect(redirectUrl);
  
  // Clear all auth cookies
  clearAllAuthCookies(response);
  
  return response;
}

function clearAllAuthCookies(response: NextResponse) {
  const cookiesToClear = [
    'kinde-access-token',
    'kinde-refresh-token', 
    'kinde-user',
    'kinde-id-token',
    'ac-state-key',
    'kinde-state',
    'kinde-pkce-verifier',
    'kinde-session',
    'kinde-nonce',
    'kinde-code-verifier'
  ];
  
  cookiesToClear.forEach(cookieName => {
    // Clear with multiple path variations to ensure complete removal
    response.cookies.delete({
      name: cookieName,
      path: '/',
    });
    response.cookies.delete({
      name: cookieName,
      path: '/api',
    });
    response.cookies.delete({
      name: cookieName,
      path: '/api/auth',
    });
  });
  
  // Add cache control headers to prevent browser caching
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
}

export const POST = GET;