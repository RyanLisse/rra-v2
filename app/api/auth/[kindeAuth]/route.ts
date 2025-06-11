import { handleAuth } from '@kinde-oss/kinde-auth-nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

async function customAuthHandler(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  
  // If there's an error parameter, handle it
  if (error) {
    console.error('OAuth Error:', error);
    return NextResponse.redirect(new URL('/api/auth/login', request.url));
  }
  
  // If this is a callback with state, validate state manually
  if (state && request.nextUrl.pathname.includes('kinde_callback')) {
    const cookieStore = await cookies();
    const storedState = cookieStore.get('kinde-state')?.value;
    
    console.log('State validation:', { received: state, stored: storedState });
    
    // If state validation fails, clear session and retry
    if (!storedState || storedState !== state) {
      console.log('State mismatch detected, clearing session');
      
      const response = NextResponse.redirect(new URL('/api/auth/clear-session', request.url));
      return response;
    }
  }
  
  // Use default Kinde handler
  return handleAuth({
    onError(error: Error, request: NextRequest) {
      console.error('Kinde Auth Error:', error.message);
      
      // Handle state not found error specifically
      if (error.message.includes('State not found')) {
        console.log('State error detected, clearing session and redirecting');
        return NextResponse.redirect(new URL('/api/auth/clear-session', request.url));
      }
      
      // For other errors, redirect to home with error parameter
      const homeUrl = new URL('/', request.url);
      homeUrl.searchParams.set('error', 'auth_error');
      return NextResponse.redirect(homeUrl);
    }
  })(request);
}

export const GET = customAuthHandler;
