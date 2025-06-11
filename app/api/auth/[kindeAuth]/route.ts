import { handleAuth } from '@kinde-oss/kinde-auth-nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

export const GET = handleAuth({
  onError(error: Error, request: NextRequest) {
    console.error('Kinde Auth Error:', error.message);
    
    // Handle state not found error specifically
    if (error.message.includes('State not found')) {
      console.log('State error detected, redirecting to login');
      return NextResponse.redirect(new URL('/api/auth/login', request.url));
    }
    
    // For other errors, redirect to home with error parameter
    const homeUrl = new URL('/', request.url);
    homeUrl.searchParams.set('error', 'auth_error');
    return NextResponse.redirect(homeUrl);
  }
});
