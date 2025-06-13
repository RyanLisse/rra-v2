import { type NextRequest, NextResponse } from 'next/server';
import { getUser, type KindeUser } from './kinde';

// For routes using NextRequest/NextResponse
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

      return await handler(request, user, ...args);
    } catch (error) {
      console.error('Auth middleware error:', error);
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 500 },
      );
    }
  };
}

// For routes using generic Request/Response
export function withAuthRequest<T extends any[]>(
  handler: (
    request: Request,
    user: KindeUser,
    ...args: T
  ) => Promise<Response> | Response,
) {
  return async (request: Request, ...args: T): Promise<Response> => {
    try {
      const user = await getUser();

      if (!user) {
        return Response.json(
          { error: 'Authentication required' },
          { status: 401 },
        );
      }

      return await handler(request, user, ...args);
    } catch (error) {
      console.error('Auth middleware error:', error);
      return Response.json({ error: 'Authentication failed' }, { status: 500 });
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
