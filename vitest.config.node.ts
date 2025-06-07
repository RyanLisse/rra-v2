import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'tests/lib/**/*.{test,spec}.{js,jsx,ts,tsx}',
      'tests/server-actions/**/*.{test,spec}.{js,jsx,ts,tsx}',
      'tests/utils/**/*.{test,spec}.{js,jsx,ts,tsx}',
    ],
    exclude: [
      'node_modules/**',
      '.next/**',
      'tests/e2e/**',
      'tests/routes/**',
      'tests/components/**',
      'tests/api/**',
      'tests/integration/**',
      'tests/performance/**',
    ],
    setupFiles: ['./tests/config/test-setup.ts'],
    globals: true,
    testTimeout: 60000,
    hookTimeout: 60000,
    teardownTimeout: 30000,
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
      ],
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
