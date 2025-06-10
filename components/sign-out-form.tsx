'use client';

import { LogoutLink } from '@kinde-oss/kinde-auth-nextjs/components';

export const SignOutForm = () => {
  return (
    <LogoutLink className="w-full text-left px-1 py-0.5 text-red-500">
      Sign out
    </LogoutLink>
  );
};
