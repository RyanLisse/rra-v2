// Extends Vitest's expect method with methods from react-testing-library
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Automatically unmount and cleanup DOM after each test
afterEach(() => {
  cleanup();
});
