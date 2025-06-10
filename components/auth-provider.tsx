'use client';

import { KindeProvider } from '@kinde-oss/kinde-auth-nextjs';
import { useSession } from '@/lib/auth/client';
import { useEffect } from 'react';

function AuthSessionDebug({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();

  useEffect(() => {
    // Debug session state
    console.log('🔐 Auth Provider - Session state:', {
      session: session?.user ? 'Present' : 'Missing',
      isPending,
      userId: session?.user?.id,
    });
  }, [session, isPending]);

  return <>{children}</>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <KindeProvider>
      <AuthSessionDebug>{children}</AuthSessionDebug>
    </KindeProvider>
  );
}
