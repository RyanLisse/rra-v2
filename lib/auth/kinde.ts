import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';
import type { KindeUser } from '@kinde-oss/kinde-auth-nextjs/types';

export interface KindeSession {
  user: {
    id: string;
    email: string;
    name?: string;
    picture?: string;
    type: 'regular' | 'premium' | 'admin';
  } | null;
  isAuthenticated: boolean;
}

/**
 * Get the current server session using Kinde
 */
export async function getServerSession(): Promise<KindeSession | null> {
  try {
    const { getUser, isAuthenticated } = getKindeServerSession();
    
    if (!isAuthenticated()) {
      return {
        user: null,
        isAuthenticated: false,
      };
    }

    const user = await getUser();
    
    if (!user) {
      return {
        user: null,
        isAuthenticated: false,
      };
    }

    return {
      user: {
        id: user.id,
        email: user.email || '',
        name: user.given_name && user.family_name 
          ? `${user.given_name} ${user.family_name}` 
          : user.given_name || user.email || '',
        picture: user.picture || undefined,
        type: 'regular', // Default type, can be enhanced with Kinde roles/permissions
      },
      isAuthenticated: true,
    };
  } catch (error) {
    console.error('Kinde session error:', error);
    return {
      user: null,
      isAuthenticated: false,
    };
  }
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const { isAuthenticated: checkAuth } = getKindeServerSession();
    return checkAuth();
  } catch (error) {
    console.error('Kinde auth check error:', error);
    return false;
  }
}

/**
 * Get user information
 */
export async function getUser(): Promise<KindeUser | null> {
  try {
    const { getUser, isAuthenticated } = getKindeServerSession();
    
    if (!isAuthenticated()) {
      return null;
    }

    return await getUser();
  } catch (error) {
    console.error('Kinde get user error:', error);
    return null;
  }
}

/**
 * Get user permissions
 */
export async function getUserPermissions(): Promise<string[]> {
  try {
    const { getPermissions, isAuthenticated } = getKindeServerSession();
    
    if (!isAuthenticated()) {
      return [];
    }

    const permissions = await getPermissions();
    return permissions?.permissions || [];
  } catch (error) {
    console.error('Kinde permissions error:', error);
    return [];
  }
}

/**
 * Check if user has specific permission
 */
export async function hasPermission(permission: string): Promise<boolean> {
  const permissions = await getUserPermissions();
  return permissions.includes(permission);
}

/**
 * Get user roles
 */
export async function getUserRoles(): Promise<string[]> {
  try {
    const { getPermission, isAuthenticated } = getKindeServerSession();
    
    if (!isAuthenticated()) {
      return [];
    }

    // Note: This would need to be customized based on your Kinde setup
    // You might want to use custom claims or organization roles
    return [];
  } catch (error) {
    console.error('Kinde roles error:', error);
    return [];
  }
}

/**
 * Authentication route helpers
 */
export const AuthRoutes = {
  login: '/api/auth/login',
  logout: '/api/auth/logout',
  register: '/api/auth/register',
  callback: '/api/auth/kinde_callback',
} as const;

/**
 * Type definitions for compatibility
 */
export type AuthSession = KindeSession;
export type UserType = 'regular' | 'premium' | 'admin';
export type AuthenticatedHandler<T = any> = (session: NonNullable<KindeSession>) => Promise<T>;
export type AuthenticatedRouteHandler = (session: NonNullable<KindeSession>) => Promise<Response>;