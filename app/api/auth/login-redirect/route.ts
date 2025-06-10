import { type NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/kinde';

export async function GET(request: NextRequest) {
  try {
    console.log('🔄 Login redirect route called');

    // Check if user already has a valid session
    const user = await getUser();

    console.log(
      '🔐 Session check in redirect:',
      user ? 'Valid session found' : 'No session',
    );

    if (user) {
      console.log(
        '✅ User authenticated, redirecting to homepage with session',
      );

      // Create response with redirect to homepage
      const response = NextResponse.redirect(new URL('/', request.url));

      console.log('🏠 Redirecting to homepage');
      return response;
    }

    console.log('❌ No valid session found, redirecting back to login');
    return NextResponse.redirect(new URL('/login', request.url));
  } catch (error) {
    console.error('❌ Login redirect error:', error);
    return NextResponse.redirect(new URL('/login', request.url));
  }
}
