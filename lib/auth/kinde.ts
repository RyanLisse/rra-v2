import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';

export type UserType = 'guest' | 'regular';

export interface KindeUser {
  id: string;
  email: string | null;
  given_name: string | null;
  family_name: string | null;
  picture: string | null;
  type: UserType;
}

export async function getUser(): Promise<KindeUser | null> {
  const { getUser: getKindeUser, isAuthenticated } = getKindeServerSession();
  
  if (!isAuthenticated()) {
    return null;
  }

  const user = await getKindeUser();
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    given_name: user.given_name,
    family_name: user.family_name,
    picture: user.picture,
    type: user.email?.includes('guest') ? 'guest' : 'regular',
  };
}

export async function requireAuth(): Promise<KindeUser> {
  const user = await getUser();
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}

export async function isAuthenticated(): Promise<boolean> {
  const { isAuthenticated: kindeIsAuthenticated } = getKindeServerSession();
  return kindeIsAuthenticated();
}

export async function createGuestUser(): Promise<KindeUser> {
  // For guest users, we'll create a temporary session
  // This would typically integrate with your database
  const guestId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  return {
    id: guestId,
    email: `${guestId}@guest.local`,
    given_name: 'Guest',
    family_name: 'User',
    picture: null,
    type: 'guest',
  };
}