#!/usr/bin/env bun
/**
 * Create a test branch manually
 * Usage: bun run scripts/create-test-branch.ts <suite-name> [--parent=branch-id] [--pooled]
 */

import { getTestBranchManager } from '../lib/testing/neon-test-branches';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.test') });
config({ path: resolve(process.cwd(), '.env.local') });

interface CliArgs {
  suiteName: string;
  parentBranchId?: string;
  pooled: boolean;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    suiteName: '',
    pooled: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--pooled') {
      result.pooled = true;
    } else if (arg.startsWith('--parent=')) {
      result.parentBranchId = arg.split('=')[1];
    } else if (!result.suiteName && !arg.startsWith('--')) {
      result.suiteName = arg;
    }
  }

  return result;
}

function printHelp() {
  console.log(`
Usage: bun run scripts/create-test-branch.ts <suite-name> [options]

Arguments:
  suite-name          Name for the test suite (required)

Options:
  --parent=ID         Parent branch ID (defaults to main branch)
  --pooled           Enable connection pooling
  --help, -h         Show this help message

Examples:
  bun run scripts/create-test-branch.ts my-test-suite
  bun run scripts/create-test-branch.ts integration-test --pooled
  bun run scripts/create-test-branch.ts custom-test --parent=br_abc123
`);
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.suiteName) {
    console.error('❌ Error: suite-name is required');
    printHelp();
    process.exit(1);
  }

  if (!process.env.NEON_API_KEY || !process.env.NEON_PROJECT_ID) {
    console.error('❌ Error: NEON_API_KEY and NEON_PROJECT_ID must be set');
    console.error('   Add these to your .env.test or .env.local file');
    process.exit(1);
  }

  console.log('🌿 Creating test branch...');
  console.log(`   Suite: ${args.suiteName}`);
  if (args.parentBranchId) {
    console.log(`   Parent: ${args.parentBranchId}`);
  }
  console.log(`   Pooled: ${args.pooled}`);
  console.log('');

  try {
    const manager = getTestBranchManager();

    console.log('⏳ Creating branch...');
    const branch = await manager.createTestBranch(args.suiteName, {
      parentBranchId: args.parentBranchId,
      pooled: args.pooled,
    });

    console.log('✅ Branch created successfully!');
    console.log('');
    console.log('📋 Branch Details:');
    console.log(`   Name: ${branch.branchName}`);
    console.log(`   ID: ${branch.branchId}`);
    console.log(`   Host: ${branch.host}`);
    console.log(`   Database: ${branch.database}`);
    console.log(`   Role: ${branch.role}`);
    console.log('');
    console.log('🔗 Connection Strings:');
    console.log(`   Standard: ${branch.connectionString}`);
    if (branch.pooledConnectionString) {
      console.log(`   Pooled: ${branch.pooledConnectionString}`);
    }
    console.log('');
    console.log('💡 Usage:');
    console.log(`   export POSTGRES_URL="${branch.connectionString}"`);
    if (branch.pooledConnectionString) {
      console.log(
        `   export POSTGRES_POOLED_URL="${branch.pooledConnectionString}"`,
      );
    }
    console.log('');
    console.log('🗑️  Cleanup:');
    console.log(`   bun run scripts/delete-test-branch.ts ${branch.branchId}`);
  } catch (error) {
    console.error('❌ Error creating branch:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
