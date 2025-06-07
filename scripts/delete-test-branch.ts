#!/usr/bin/env bun
/**
 * Delete a test branch manually
 * Usage: bun run scripts/delete-test-branch.ts <branch-id-or-name> [--force]
 */

import { getTestBranchManager } from '../lib/testing/neon-test-branches';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.test') });
config({ path: resolve(process.cwd(), '.env.local') });

interface CliArgs {
  branchIdOrName: string;
  force: boolean;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    branchIdOrName: '',
    force: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--force' || arg === '-f') {
      result.force = true;
    } else if (!result.branchIdOrName && !arg.startsWith('--')) {
      result.branchIdOrName = arg;
    }
  }

  return result;
}

function printHelp() {
  console.log(`
Usage: bun run scripts/delete-test-branch.ts <branch-id-or-name> [options]

Arguments:
  branch-id-or-name   Branch ID or name to delete (required)

Options:
  --force, -f         Skip confirmation prompt
  --help, -h          Show this help message

Examples:
  bun run scripts/delete-test-branch.ts br_abc123
  bun run scripts/delete-test-branch.ts test-my-suite-2024-01-15-abc123
  bun run scripts/delete-test-branch.ts br_abc123 --force
`);
}

async function confirm(message: string): Promise<boolean> {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer: string) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.branchIdOrName) {
    console.error('❌ Error: branch-id-or-name is required');
    printHelp();
    process.exit(1);
  }

  if (!process.env.NEON_API_KEY || !process.env.NEON_PROJECT_ID) {
    console.error('❌ Error: NEON_API_KEY and NEON_PROJECT_ID must be set');
    console.error('   Add these to your .env.test or .env.local file');
    process.exit(1);
  }

  try {
    const manager = getTestBranchManager();

    // First, try to get branch info
    console.log('🔍 Looking up branch...');
    const branches = await manager.listBranches();

    let targetBranch = branches.find((b) => b.id === args.branchIdOrName);
    if (!targetBranch) {
      targetBranch = branches.find((b) => b.name === args.branchIdOrName);
    }

    if (!targetBranch) {
      console.error(`❌ Branch not found: ${args.branchIdOrName}`);
      console.log('');
      console.log('💡 Available branches:');
      const testBranches = branches.filter((b) => b.name.startsWith('test-'));
      if (testBranches.length === 0) {
        console.log('   No test branches found');
      } else {
        for (const branch of testBranches) {
          console.log(`   ${branch.name} (${branch.id})`);
        }
      }
      process.exit(1);
    }

    // Safety check for primary branch
    if (targetBranch.primary) {
      console.error(`❌ Cannot delete primary branch: ${targetBranch.name}`);
      process.exit(1);
    }

    console.log('📋 Branch Details:');
    console.log(`   Name: ${targetBranch.name}`);
    console.log(`   ID: ${targetBranch.id}`);
    console.log(`   State: ${targetBranch.current_state}`);
    console.log(
      `   Created: ${new Date(targetBranch.created_at).toLocaleString()}`,
    );
    console.log('');

    // Confirmation
    if (!args.force) {
      const shouldDelete = await confirm(
        '⚠️  Are you sure you want to delete this branch?',
      );
      if (!shouldDelete) {
        console.log('❌ Deletion cancelled');
        process.exit(0);
      }
    }

    console.log('⏳ Deleting branch...');
    await manager.deleteTestBranch(targetBranch.id);

    console.log('✅ Branch deleted successfully!');
    console.log(`   Deleted: ${targetBranch.name} (${targetBranch.id})`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      console.log('✅ Branch was already deleted or does not exist');
    } else {
      console.error('❌ Error deleting branch:', error);
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
