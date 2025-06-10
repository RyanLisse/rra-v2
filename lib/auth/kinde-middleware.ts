import { withAuth } from '@kinde-oss/kinde-auth-nextjs/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import type { KindeUser } from './kinde';

export interface KindeSession {
  user: KindeUser | null;
  isAuthenticated: boolean;
}

/**
 * Kinde authentication middleware wrapper
 */
export function withKindeAuth(
  handler: (
    request: NextRequest,
    context: { params?: any },
    session: KindeSession,
  ) => Promise<Response> | Response,
) {
  return withAuth(async (request: NextRequest, context: { params?: any }) => {
    try {
      // The session is available through Kinde's middleware
      // We'll create a compatible session object
      const session: KindeSession = {
        user: (request as any).kindeAuth?.user || null,
        isAuthenticated: !!(request as any).kindeAuth?.user,
      };

      return await handler(request, context, session);
    } catch (error) {
      console.error('Kinde middleware error:', error);
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      );
    }
  });
}

/**
 * Route protection middleware
 */
export function protectedRoute(
  handler: (
    request: NextRequest,
    context: { params?: any },
  ) => Promise<Response> | Response,
) {
  return withAuth(async (request: NextRequest, context: { params?: any }) => {
    // If we reach here, the user is authenticated
    return await handler(request, context);
  });
}

/**
 * Optional authentication middleware (allows both authenticated and unauthenticated access)
 */
export function optionalAuth(
  handler: (
    request: NextRequest,
    context: { params?: any },
    session: KindeSession | null,
  ) => Promise<Response> | Response,
) {
  return async (request: NextRequest, context: { params?: any }) => {
    try {
      // Try to get session, but don't require it
      const session: KindeSession | null = (request as any).kindeAuth?.user
        ? {
            user: (request as any).kindeAuth.user,
            isAuthenticated: true,
          }
        : null;

      return await handler(request, context, session);
    } catch (error) {
      console.error('Optional auth middleware error:', error);
      // Continue without session if there's an error
      return await handler(request, context, null);
    }
  };
}

/**
 * Permission-based middleware
 */
export function requirePermission(permission: string) {
  return (
    handler: (
      request: NextRequest,
      context: { params?: any },
      session: KindeSession,
    ) => Promise<Response> | Response,
  ) =>
    withKindeAuth(async (request, context, session) => {
      if (!session.isAuthenticated) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 },
        );
      }

      // Note: Permission checking would need to be implemented based on your Kinde setup
      // This is a placeholder implementation
      const hasRequiredPermission = true; // Implement actual permission check

      if (!hasRequiredPermission) {
        return NextResponse.json(
          { error: 'Insufficient permissions' },
          { status: 403 },
        );
      }

      return await handler(request, context, session);
    });
}

/**
 * Admin-only middleware
 */
export function adminOnly(
  handler: (
    request: NextRequest,
    context: { params?: any },
    session: KindeSession,
  ) => Promise<Response> | Response,
) {
  return requirePermission('admin')(handler);
}

/**
 * Rate limiting with authentication context
 */
export function withRateLimit(
  rateLimitKey: string,
  maxRequests = 10,
  windowMs = 60000,
) {
  return (
    handler: (
      request: NextRequest,
      context: { params?: any },
      session: KindeSession,
    ) => Promise<Response> | Response,
  ) =>
    withKindeAuth(async (request, context, session) => {
      // Implement rate limiting logic here
      // This is a placeholder - you'd integrate with your rate limiting solution

      return await handler(request, context, session);
    });
}
