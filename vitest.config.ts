import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: [
      'tests/**/*.{test,spec}.{js,jsx,ts,tsx}',
      '!tests/e2e/**',
      '!tests/routes/**',
    ],
    exclude: [
      'node_modules/**',
      '.next/**',
      'lib/ai/models.mock.ts',
      'tests/e2e/**',
      'tests/routes/**',
    ],
    setupFiles: ['./tests/config/test-setup.ts'],
    globals: true,
    testTimeout: 30000, // Increased for performance tests
    hookTimeout: 30000,
    teardownTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        '.next/**',
        'tests/**',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
        '**/generated/**',
        'lib/ai/models.mock.ts',
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
    pool: 'threads',
    poolOptions: {
      threads: {
        minThreads: 1,
        maxThreads: 4,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
