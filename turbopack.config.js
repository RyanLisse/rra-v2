/**
 * Turbopack Configuration
 *
 * This file provides an alternative configuration approach for Turbopack
 * if there are issues with the inline configuration in next.config.ts
 *
 * To use this configuration, you can import it in next.config.ts:
 * import turbopackConfig from './turbopack.config.js';
 *
 * Then apply it to experimental.turbo in your Next.js config.
 */

module.exports = {
  // Resolve aliases for module resolution
  resolveAlias: {
    // Tree-shake lodash
    lodash: 'lodash-es',
  },

  // Module ID generation strategy
  // Use 'named' for better debugging, 'deterministic' for consistent builds
  moduleIds: 'named',

  // Tree shaking configuration
  // Note: This is experimental and may not work in all scenarios
  treeShaking: process.env.NODE_ENV === 'production',

  // Resolve extensions in order of preference
  resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],

  // Memory limit for Turbopack (in bytes)
  // Increase if you encounter out-of-memory errors
  memoryLimit: 8 * 1024 * 1024 * 1024, // 8GB
};
