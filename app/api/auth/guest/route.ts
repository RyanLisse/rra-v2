import { type NextRequest, NextResponse } from 'next/server';

// Guest route is now deprecated as we allow unauthenticated access to the homepage
// Redirect to homepage for backward compatibility
export async function GET(request: NextRequest) {
  const redirectUrl = request.nextUrl.searchParams.get('redirectUrl') || '/';

  // Redirect to the requested URL (default to homepage)
  return NextResponse.redirect(new URL(redirectUrl, request.url));
}

export async function POST(request: NextRequest) {
  return GET(request);
}
