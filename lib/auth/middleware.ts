import { type NextRequest, NextResponse } from 'next/server';
import { getUser, type KindeUser } from './kinde';

export function withAuth<T extends any[]>(
  handler: (
    request: NextRequest,
    user: KindeUser,
    ...args: T
  ) => Promise<NextResponse> | NextResponse,
) {
  return async (request: NextRequest, ...args: T): Promise<NextResponse> => {
    try {
      const user = await getUser();

      if (!user) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 },
        );
      }

      // Create a session-like object for backward compatibility
      const session = { user };

      return await handler(request, session, ...args);
    } catch (error) {
      console.error('Auth middleware error:', error);
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 500 },
      );
    }
  };
}

export async function requireAuth(): Promise<KindeUser> {
  const user = await getUser();
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}
