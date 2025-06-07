import { createAuthClient } from 'better-auth/react';
import { anonymousClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  plugins: [anonymousClient()],
});

export const { signIn, signOut, signUp, useSession, getSession } = authClient;
export const { signInAnonymous } = authClient.anonymous;
