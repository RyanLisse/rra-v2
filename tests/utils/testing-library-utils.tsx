import React, { type ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionProvider } from 'next-auth/react';

// Create a custom render method that includes providers
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  session?: {
    expires: string;
    user: {
      id: string;
      name?: string;
      email?: string;
      image?: string;
    };
  } | null;
}

function customRender(
  ui: ReactElement,
  { session = null, ...renderOptions }: CustomRenderOptions = {},
) {
  return {
    user: userEvent.setup(),
    ...render(ui, {
      wrapper: ({ children }) => (
        <SessionProvider session={session}>{children}</SessionProvider>
      ),
      ...renderOptions,
    }),
  };
}

// Re-export everything from testing-library
export * from '@testing-library/react';

// Override render method with custom version
export { customRender as render };
