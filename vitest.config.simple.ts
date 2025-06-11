import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig(() => {

  return {
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
      'tests/e2e/**',
      'tests/routes/**',
    ],
    setupFiles: ['./tests/config/test-setup.ts'],
    globals: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 30000,

    // Simplified configuration for better debugging
    sequence: {
      concurrent: false, // Run tests sequentially for easier debugging
    },
    isolate: true, // Isolate each test file
    
    coverage: {
      provider: 'v8' as const,
      reporter: ['text'],
      exclude: [
        'node_modules/**',
        '.next/**',
        'tests/**',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
        '**/generated/**',
        'lib/ai/models.mock.ts',
        'lib/testing/**',
      ],
    },

    pool: 'threads',
    poolOptions: {
      threads: {
        minThreads: 1,
        maxThreads: 2,
        useAtomics: true,
        isolate: true,
      },
    },

    // Environment setup
    env: {
      NODE_ENV: 'test' as const,
      // Disable Neon branching for simple tests
      USE_NEON_BRANCHING: 'false',
      // Enable debug logging
      TEST_LOG_LEVEL: 'debug',
      ENABLE_TEST_METRICS: 'false',
    },

    // No retries for simpler debugging
    retry: 0,
    watch: false,
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },

    define: {
      __TEST_ENV__: JSON.stringify('test'),
      __NEON_ENABLED__: JSON.stringify(false),
    },
  };
});