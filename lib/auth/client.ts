'use client';

import { useKindeBrowserClient } from '@kinde-oss/kinde-auth-nextjs';
import type { KindeUser } from './kinde';

export interface Session {
  user: KindeUser;
}

export function useSession() {
  const { user, isAuthenticated, isLoading } = useKindeBrowserClient();
  
  const session: Session | null = user && isAuthenticated ? {
    user: {
      id: user.id,
      email: user.email,
      given_name: user.given_name,
      family_name: user.family_name,
      picture: user.picture,
      type: user.email?.includes('guest') ? 'guest' : 'regular',
    }
  } : null;

  return {
    data: session,
    isPending: isLoading,
  };
}

export function useAuth() {
  const { user, isAuthenticated, isLoading, login, logout } = useKindeBrowserClient();
  
  return {
    user: user ? {
      id: user.id,
      email: user.email,
      given_name: user.given_name,
      family_name: user.family_name,
      picture: user.picture,
      type: user.email?.includes('guest') ? 'guest' : 'regular',
    } : null,
    isAuthenticated,
    isLoading,
    login,
    logout,
  };
}