#!/usr/bin/env bun
/**
 * Cleanup old test branches
 * Usage: bun run scripts/cleanup-test-branches.ts [--max-age-hours=24] [--dry-run]
 */

import { getTestBranchManager } from '../lib/testing/neon-test-branches';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.test') });
config({ path: resolve(process.cwd(), '.env.local') });

interface CliArgs {
  maxAgeHours: number;
  dryRun: boolean;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    maxAgeHours: 24,
    dryRun: false,
    help: false,
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg.startsWith('--max-age-hours=')) {
      result.maxAgeHours = parseInt(arg.split('=')[1], 10);
    }
  }

  return result;
}

function printHelp() {
  console.log(`
Usage: bun run scripts/cleanup-test-branches.ts [options]

Options:
  --max-age-hours=N    Cleanup branches older than N hours (default: 24)
  --dry-run           Show what would be deleted without actually deleting
  --help, -h          Show this help message

Examples:
  bun run scripts/cleanup-test-branches.ts
  bun run scripts/cleanup-test-branches.ts --max-age-hours=12
  bun run scripts/cleanup-test-branches.ts --dry-run
`);
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!process.env.NEON_API_KEY || !process.env.NEON_PROJECT_ID) {
    console.error('❌ Error: NEON_API_KEY and NEON_PROJECT_ID must be set');
    console.error('   Add these to your .env.test or .env.local file');
    process.exit(1);
  }

  console.log('🧹 Cleaning up old test branches...');
  console.log(`   Max age: ${args.maxAgeHours} hours`);
  console.log(`   Dry run: ${args.dryRun}`);
  console.log('');

  try {
    const manager = getTestBranchManager();
    
    // List all branches first
    const branches = await manager.listBranches();
    const testBranches = branches.filter(
      branch => branch.name.startsWith('test-') && !branch.primary
    );

    if (testBranches.length === 0) {
      console.log('✅ No test branches found');
      return;
    }

    console.log(`📋 Found ${testBranches.length} test branches:`);
    
    const now = new Date();
    const maxAgeMs = args.maxAgeHours * 60 * 60 * 1000;
    const branchesToDelete = [];

    for (const branch of testBranches) {
      const createdAt = new Date(branch.created_at);
      const age = now.getTime() - createdAt.getTime();
      const ageHours = Math.round(age / (60 * 60 * 1000) * 10) / 10;
      
      const shouldDelete = age > maxAgeMs;
      const status = shouldDelete ? '🗑️  DELETE' : '⏰ KEEP';
      
      console.log(`   ${status} ${branch.name} (${ageHours}h old)`);
      
      if (shouldDelete) {
        branchesToDelete.push(branch);
      }
    }

    if (branchesToDelete.length === 0) {
      console.log('✅ No branches need cleanup');
      return;
    }

    console.log('');
    console.log(`🗑️  ${branchesToDelete.length} branches to delete`);

    if (args.dryRun) {
      console.log('');
      console.log('🔍 Dry run mode - no branches were actually deleted');
      console.log('   Run without --dry-run to perform the cleanup');
      return;
    }

    console.log('');
    console.log('⏳ Deleting branches...');

    let deleted = 0;
    let failed = 0;

    for (const branch of branchesToDelete) {
      try {
        await manager.deleteTestBranch(branch.id);
        console.log(`   ✅ Deleted ${branch.name}`);
        deleted++;
      } catch (error) {
        console.log(`   ❌ Failed to delete ${branch.name}: ${error}`);
        failed++;
      }
    }

    console.log('');
    console.log('🎉 Cleanup completed:');
    console.log(`   ✅ Deleted: ${deleted} branches`);
    if (failed > 0) {
      console.log(`   ❌ Failed: ${failed} branches`);
    }

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});