import { type NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/kinde';

export async function GET(request: NextRequest) {
  try {
    // Check if user already has a session
    const existingUser = await getUser();

    if (existingUser) {
      // If user already has a session (guest or regular), redirect to the requested URL
      const redirectUrl =
        request.nextUrl.searchParams.get('redirectUrl') || '/';
      return NextResponse.redirect(new URL(redirectUrl, request.url));
    }

    // For guest users, redirect to Kinde login which will handle guest flow
    // Or create a temporary guest session
    const redirectUrl = request.nextUrl.searchParams.get('redirectUrl') || '/';

    // Redirect to login page with guest option
    return NextResponse.redirect(new URL('/login', request.url));
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
