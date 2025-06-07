import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';

export async function GET(request: NextRequest) {
  try {
    // Check if user already has a session
    const existingSession = await auth.api.getSession({
      headers: request.headers,
    });

    if (existingSession?.user) {
      // If user already has a session (guest or regular), redirect to the requested URL
      const redirectUrl =
        request.nextUrl.searchParams.get('redirectUrl') || '/';
      return NextResponse.redirect(redirectUrl);
    }

    // Create anonymous session using better-auth
    const response = await auth.api.signInAnonymous({
      headers: request.headers,
    });

    if (!response) {
      throw new Error('Failed to create anonymous session');
    }

    // Get redirect URL from query params
    const redirectUrl = request.nextUrl.searchParams.get('redirectUrl') || '/';

    // Create redirect response
    const redirectResponse = NextResponse.redirect(redirectUrl);

    // Copy over the session cookies from the auth response
    const authCookies = response.headers.get('set-cookie');
    if (authCookies) {
      redirectResponse.headers.set('set-cookie', authCookies);
    }

    return redirectResponse;
  } catch (error) {
    console.error('Guest auth error:', error);
    return NextResponse.json(
      { error: 'Failed to create guest session' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  // POST method also supports guest creation
  return GET(request);
}
