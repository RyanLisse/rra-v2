import { type NextRequest, NextResponse } from 'next/server';
import { auth } from './config';
import type { Session } from 'better-auth';

export type BetterAuthSession = {
  session: Session;
  user: { id: string; type: 'guest' | 'regular'; email: string; name: string };
};

export type AuthenticatedHandler = (
  req: NextRequest,
  session: BetterAuthSession,
) => Promise<NextResponse> | NextResponse;

export type AuthenticatedRouteHandler = (
  req: Request,
  session: BetterAuthSession,
) => Promise<Response> | Response;

export type UserType = 'guest' | 'regular';

export interface AuthSession {
  id: string;
  user: {
    id: string;
    email?: string;
    type: UserType;
  };
  expiresAt: Date;
}

export async function validateSession(
  sessionToken: string,
): Promise<AuthSession | null> {
  try {
    const session = await auth.api.getSession({
      headers: new Headers({
        authorization: `Bearer ${sessionToken}`,
      }),
    });

    if (!session) {
      return null;
    }

    // Check if session is expired
    if (
      session.session.expiresAt &&
      new Date() > new Date(session.session.expiresAt)
    ) {
      return null;
    }

    return {
      id: session.session.id,
      user: {
        id: session.user.id,
        email: session.user.email,
        type: (session.user as any).type || 'regular',
      },
      expiresAt: new Date(session.session.expiresAt),
    };
  } catch (error) {
    console.error('Session validation error:', error);
    return null;
  }
}

export async function authenticateUser(
  email: string,
  password: string,
): Promise<AuthSession | null> {
  try {
    const result = await auth.api.signInEmail({
      body: {
        email,
        password,
      },
    });

    if (!result) {
      return null;
    }

    return {
      id: result.token, // Use token as session ID for now
      user: {
        id: result.user.id,
        email: result.user.email,
        type: (result.user as any).type || 'regular',
      },
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    };
  } catch (error) {
    console.error('Authentication error:', error);
    return null;
  }
}

export async function createGuestUser(): Promise<AuthSession> {
  try {
    // Use better-auth anonymous plugin for guest users
    const result = await auth.api.signInAnonymous();

    if (!result) {
      throw new Error('Failed to create anonymous session');
    }

    return {
      id: result.token, // Use token as session ID for now
      user: {
        id: result.user.id,
        email: result.user.email,
        type: 'guest',
      },
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    };
  } catch (error) {
    console.error('Guest user creation error:', error);
    throw new Error('Failed to create guest user');
  }
}

export function withAuth(
  handler: AuthenticatedHandler | AuthenticatedRouteHandler,
) {
  return async (req: NextRequest | Request) => {
    try {
      const session = await auth.api.getSession({
        headers: req.headers,
      });

      if (!session?.user?.id) {
        if (req instanceof Request) {
          return Response.json(
            { error: 'Unauthorized', message: 'Valid session required' },
            { status: 401 },
          );
        } else {
          return NextResponse.json(
            { error: 'Unauthorized', message: 'Valid session required' },
            { status: 401 },
          );
        }
      }

      // Ensure the session has the expected structure
      const authSession = {
        ...session,
        user: {
          ...session.user,
          type: (session.user as any).type || 'regular',
        },
      };

      return handler(req as any, authSession);
    } catch (error) {
      console.error('Auth middleware error:', error);
      if (req instanceof Request) {
        return Response.json(
          {
            error: 'Authentication failed',
            message: 'Session validation failed',
          },
          { status: 401 },
        );
      } else {
        return NextResponse.json(
          {
            error: 'Authentication failed',
            message: 'Session validation failed',
          },
          { status: 401 },
        );
      }
    }
  };
}
