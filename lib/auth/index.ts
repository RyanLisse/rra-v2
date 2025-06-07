export { auth } from './config';
export * from './client';
export * from './middleware';
export type {
  AuthSession,
  UserType,
  AuthenticatedHandler,
  AuthenticatedRouteHandler,
  BetterAuthSession,
} from './middleware';

// Server-side session helper for compatibility with NextAuth pattern
export async function getServerSession() {
  try {
    const { auth: authInstance } = await import('./config');
    const session = await authInstance.api.getSession({
      headers: new Headers({
        cookie: (await import('next/headers')).cookies().toString(),
      }),
    });

    if (!session?.user?.id) {
      return null;
    }

    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        type: (session.user as any).type || 'regular',
      },
      expiresAt: new Date(session.session.expiresAt),
    };
  } catch (error) {
    console.error('Server session error:', error);
    return null;
  }
}
