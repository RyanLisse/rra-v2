import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Clear all Kinde-related cookies and redirect to login
  const response = NextResponse.redirect(new URL('/api/auth/login', request.url));
  
  // Clear all possible Kinde cookies
  const cookiesToClear = [
    'kinde-access-token',
    'kinde-refresh-token', 
    'kinde-user',
    'kinde-state',
    'kinde-code-verifier',
    'kinde-session',
  ];
  
  cookiesToClear.forEach(cookieName => {
    response.cookies.delete(cookieName);
  });
  
  return response;
}

export async function POST(request: NextRequest) {
  return GET(request);
}