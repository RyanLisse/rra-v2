import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  
  const kindeRelatedCookies = allCookies.filter(cookie => 
    cookie.name.toLowerCase().includes('kinde') ||
    cookie.name.toLowerCase().includes('state') ||
    cookie.name.toLowerCase().includes('session')
  );
  
  const searchParams = request.nextUrl.searchParams;
  const state = searchParams.get('state');
  const code = searchParams.get('code');
  
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    cookies: kindeRelatedCookies,
    searchParams: {
      state,
      code: code ? `${code.substring(0, 20)}...` : null,
      scope: searchParams.get('scope'),
    },
    headers: Object.fromEntries(request.headers.entries()),
  });
}