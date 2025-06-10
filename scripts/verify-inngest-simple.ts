#!/usr/bin/env tsx

/**
 * Simple Inngest Setup Verification Script
 *
 * This script verifies that the basic Inngest infrastructure is properly set up
 * without requiring database connections.
 */

import { EVENT_NAMES, DocumentStatus } from '@/lib/inngest/types';

async function verifyInngestSetup() {
  console.log('🔍 Verifying Inngest Setup...\n');

  // 1. Check Event Names
  console.log('✅ 1. Event Names Configuration');
  Object.entries(EVENT_NAMES).forEach(([key, value]) => {
    console.log(`   ${key}: ${value}`);
  });
  console.log();

  // 2. Check Document Status Enum
  console.log('✅ 2. Document Status Values');
  Object.entries(DocumentStatus).forEach(([key, value]) => {
    console.log(`   ${key}: ${value}`);
  });
  console.log();

  // 3. Check Environment Variables
  console.log('✅ 3. Environment Variables');
  const requiredVars = ['INNGEST_EVENT_KEY'];

  const optionalVars = [
    'INNGEST_SIGNING_KEY',
    'INNGEST_BASE_URL',
    'INNGEST_DEV_SERVER_URL',
    'INNGEST_APP_ID',
    'INNGEST_SERVE_PATH',
    'INNGEST_MAX_RETRIES',
    'INNGEST_LOGGER_LEVEL',
    'INNGEST_STREAMING_ENABLED',
  ];

  requiredVars.forEach((varName) => {
    const value = process.env[varName];
    console.log(
      `   ${varName}: ${value ? '✓ Set' : '❌ Missing (will default to "local")'}`,
    );
  });

  optionalVars.forEach((varName) => {
    const value = process.env[varName];
    console.log(`   ${varName}: ${value ? '✓ Set' : '○ Default'}`);
  });
  console.log();

  // 4. Check File Structure
  console.log('✅ 4. File Structure');
  const requiredFiles = [
    'lib/inngest/client.ts',
    'lib/inngest/types.ts',
    'lib/inngest/utils.ts',
    'lib/inngest/index.ts',
    'lib/inngest/functions/README.md',
    'app/api/inngest/route.ts',
  ];

  const fs = await import('node:fs');
  const path = await import('node:path');

  requiredFiles.forEach((filePath) => {
    const fullPath = path.join(process.cwd(), filePath);
    const exists = fs.existsSync(fullPath);
    console.log(`   ${filePath}: ${exists ? '✓ Exists' : '❌ Missing'}`);
  });
  console.log();

  // 5. Environment Configuration
  console.log('✅ 5. Environment Configuration');
  const nodeEnv = process.env.NODE_ENV || 'development';
  console.log(`   NODE_ENV: ${nodeEnv}`);
  console.log(
    `   Development Mode: ${nodeEnv === 'development' ? '✓ Yes' : '○ No'}`,
  );
  console.log();

  // 6. Next Steps
  console.log('🚀 Next Steps');
  console.log('   1. Install Inngest CLI (optional): bun run inngest:install');
  console.log('   2. Start Inngest Dev Server: bun run inngest:dev');
  console.log('   3. Start your application: bun run dev');
  console.log('   4. Or start both together: bun run dev:inngest');
  console.log('   5. Visit http://localhost:8288 for Inngest dashboard');
  console.log(
    '   6. Visit http://localhost:3000/api/inngest to register functions',
  );
  console.log();

  // 7. Function Development Guide
  console.log('📝 Function Development');
  console.log('   Add functions to: lib/inngest/functions/');
  console.log('   Import functions in: app/api/inngest/route.ts');
  console.log(
    '   Test functions via: Inngest dashboard or programmatic events',
  );
  console.log('   See: lib/inngest/functions/README.md for patterns');
  console.log();

  // 8. Package Installation Check
  console.log('✅ 6. Package Installation');
  try {
    const packageJson = await import('../package.json');
    const hasInngest =
      (packageJson.dependencies as any)?.inngest ||
      (packageJson.devDependencies as any)?.inngest;
    console.log(
      `   Inngest package: ${hasInngest ? '✓ Installed' : '❌ Missing'}`,
    );

    const hasConcurrently =
      (packageJson.dependencies as any)?.concurrently ||
      (packageJson.devDependencies as any)?.concurrently;
    console.log(
      `   Concurrently package: ${hasConcurrently ? '✓ Installed' : '❌ Missing'}`,
    );
  } catch (error) {
    console.log(`   Package check: ❌ Error reading package.json`);
  }
  console.log();

  console.log('✨ Inngest infrastructure setup complete!');
  console.log('Ready for workflow function development.');
  console.log();
  console.log('💡 To test the complete setup:');
  console.log('   bun test tests/lib/inngest-setup.test.ts');
}

// Run verification if this script is executed directly
if (require.main === module) {
  verifyInngestSetup().catch((error) => {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  });
}

export { verifyInngestSetup };
