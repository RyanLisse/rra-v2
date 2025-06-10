// Kinde Authentication Exports
export * from './kinde';
export * from './kinde-middleware';

// Re-export types for compatibility
export type {
  AuthSession,
  UserType,
  AuthenticatedHandler,
  AuthenticatedRouteHandler,
  KindeSession,
} from './kinde';

// Export main session function
export { getServerSession, isAuthenticated, getUser } from './kinde';

// Legacy Better Auth exports (commented out for migration)
// export { auth } from './config';
// export * from './client';
// export * from './middleware';
