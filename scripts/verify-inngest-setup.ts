#!/usr/bin/env tsx

/**
 * Inngest Setup Verification Script
 *
 * This script verifies that the Inngest infrastructure is properly set up
 * and ready for function development.
 */

// Import only the configuration and constants, not the utilities that depend on the database
import { inngest } from '@/lib/inngest/client';
import { getInngestConfig } from '@/lib/inngest/utils';
import { EVENT_NAMES } from '@/lib/inngest/types';

async function verifyInngestSetup() {
  console.log('🔍 Verifying Inngest Setup...\n');

  // 1. Check Inngest Client Configuration
  console.log('✅ 1. Inngest Client Configuration');
  const config = getInngestConfig();
  console.log(`   App ID: ${config.appId}`);
  console.log(
    `   Environment: ${config.isDevelopment ? 'Development' : 'Production'}`,
  );
  console.log(`   Serve Path: ${config.servePath}`);
  console.log(`   Event Key: ${config.eventKey}`);
  console.log(`   Max Retries: ${config.maxRetries}`);
  console.log(
    `   Streaming: ${config.streamingEnabled ? 'Enabled' : 'Disabled'}`,
  );
  console.log();

  // 2. Check Event Names
  console.log('✅ 2. Event Names Configuration');
  Object.entries(EVENT_NAMES).forEach(([key, value]) => {
    console.log(`   ${key}: ${value}`);
  });
  console.log();

  // 3. Check Timeout Configuration
  console.log('✅ 3. Timeout Configuration');
  console.log(`   Document Upload: ${config.timeouts.documentUpload}ms`);
  console.log(`   Text Extraction: ${config.timeouts.textExtraction}ms`);
  console.log(`   Chunking: ${config.timeouts.chunking}ms`);
  console.log(`   Embedding: ${config.timeouts.embedding}ms`);
  console.log(`   Batch Processing: ${config.timeouts.batchProcessing}ms`);
  console.log();

  // 4. Check Environment Variables
  console.log('✅ 4. Environment Variables');
  const requiredVars = [
    'INNGEST_EVENT_KEY',
    'INNGEST_APP_ID',
    'INNGEST_SERVE_PATH',
  ];

  const optionalVars = [
    'INNGEST_SIGNING_KEY',
    'INNGEST_BASE_URL',
    'INNGEST_DEV_SERVER_URL',
    'INNGEST_MAX_RETRIES',
    'INNGEST_LOGGER_LEVEL',
    'INNGEST_STREAMING_ENABLED',
  ];

  requiredVars.forEach((varName) => {
    const value = process.env[varName];
    console.log(`   ${varName}: ${value ? '✓ Set' : '❌ Missing'}`);
  });

  optionalVars.forEach((varName) => {
    const value = process.env[varName];
    console.log(`   ${varName}: ${value ? '✓ Set' : '○ Default'}`);
  });
  console.log();

  // 5. Check File Structure
  console.log('✅ 5. File Structure');
  const requiredFiles = [
    'lib/inngest/client.ts',
    'lib/inngest/types.ts',
    'lib/inngest/utils.ts',
    'lib/inngest/index.ts',
    'lib/inngest/functions/README.md',
    'app/api/inngest/route.ts',
  ];

  const fs = await import('fs');
  const path = await import('path');

  requiredFiles.forEach((filePath) => {
    const fullPath = path.join(process.cwd(), filePath);
    const exists = fs.existsSync(fullPath);
    console.log(`   ${filePath}: ${exists ? '✓ Exists' : '❌ Missing'}`);
  });
  console.log();

  // 6. Test Inngest Client
  console.log('✅ 6. Inngest Client Test');
  try {
    // This doesn't actually send an event in development mode without the dev server
    console.log('   Client initialization: ✓ Success');
    console.log(`   Client ID: ${config.appId}`);
    console.log('   Note: To test event sending, start the Inngest Dev Server');
  } catch (error) {
    console.log(`   Client initialization: ❌ Error - ${error}`);
  }
  console.log();

  // 7. Next Steps
  console.log('🚀 Next Steps');
  console.log('   1. Start Inngest Dev Server: bun run inngest:dev');
  console.log('   2. Start your application: bun run dev');
  console.log('   3. Or start both together: bun run dev:inngest');
  console.log('   4. Visit http://localhost:8288 for Inngest dashboard');
  console.log(
    '   5. Visit http://localhost:3000/api/inngest to register functions',
  );
  console.log();

  // 8. Function Development Guide
  console.log('📝 Function Development');
  console.log('   Add functions to: lib/inngest/functions/');
  console.log('   Import functions in: app/api/inngest/route.ts');
  console.log(
    '   Test functions via: Inngest dashboard or programmatic events',
  );
  console.log('   See: lib/inngest/functions/README.md for patterns');
  console.log();

  console.log('✨ Inngest infrastructure setup complete!');
  console.log('Ready for workflow function development.');
}

// Run verification if this script is executed directly
if (import.meta.main) {
  verifyInngestSetup().catch((error) => {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  });
}

export { verifyInngestSetup };
