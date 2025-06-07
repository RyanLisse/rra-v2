#!/usr/bin/env bun
/**
 * List all test branches
 * Usage: bun run scripts/list-test-branches.ts [--all] [--json]
 */

import { getTestBranchManager } from '../lib/testing/neon-test-branches';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.test') });
config({ path: resolve(process.cwd(), '.env.local') });

interface CliArgs {
  all: boolean;
  json: boolean;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    all: false,
    json: false,
    help: false,
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--all') {
      result.all = true;
    } else if (arg === '--json') {
      result.json = true;
    }
  }

  return result;
}

function printHelp() {
  console.log(`
Usage: bun run scripts/list-test-branches.ts [options]

Options:
  --all               Show all branches (not just test branches)
  --json              Output in JSON format
  --help, -h          Show this help message

Examples:
  bun run scripts/list-test-branches.ts
  bun run scripts/list-test-branches.ts --all
  bun run scripts/list-test-branches.ts --json
`);
}

function formatSize(bytes?: number): string {
  if (!bytes) return 'Unknown';

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${Math.round(size * 10) / 10} ${units[unitIndex]}`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / (60 * 1000));
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
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

  try {
    const manager = getTestBranchManager();
    const branches = await manager.listBranches();

    const filteredBranches = args.all
      ? branches
      : branches.filter((branch) => branch.name.startsWith('test-'));

    if (args.json) {
      console.log(JSON.stringify(filteredBranches, null, 2));
      return;
    }

    if (filteredBranches.length === 0) {
      console.log(
        args.all ? '📭 No branches found' : '📭 No test branches found',
      );
      return;
    }

    console.log(
      `📋 ${args.all ? 'All branches' : 'Test branches'} (${filteredBranches.length} total):`,
    );
    console.log('');

    // Group by type
    const testBranches = filteredBranches.filter((b) =>
      b.name.startsWith('test-'),
    );
    const otherBranches = filteredBranches.filter(
      (b) => !b.name.startsWith('test-'),
    );

    if (testBranches.length > 0) {
      console.log('🧪 Test Branches:');
      for (const branch of testBranches) {
        const status =
          branch.current_state === 'ready'
            ? '🟢'
            : branch.current_state === 'creating'
              ? '🟡'
              : '🔴';
        const primary = branch.primary ? ' (PRIMARY)' : '';
        const size = formatSize(branch.logical_size);
        const age = formatDate(branch.created_at);

        console.log(`   ${status} ${branch.name}${primary}`);
        console.log(`      ID: ${branch.id}`);
        console.log(`      State: ${branch.current_state}`);
        console.log(`      Size: ${size}`);
        console.log(`      Age: ${age}`);
        console.log('');
      }
    }

    if (args.all && otherBranches.length > 0) {
      console.log('🌿 Other Branches:');
      for (const branch of otherBranches) {
        const status =
          branch.current_state === 'ready'
            ? '🟢'
            : branch.current_state === 'creating'
              ? '🟡'
              : '🔴';
        const primary = branch.primary ? ' (PRIMARY)' : '';
        const size = formatSize(branch.logical_size);
        const age = formatDate(branch.created_at);

        console.log(`   ${status} ${branch.name}${primary}`);
        console.log(`      ID: ${branch.id}`);
        console.log(`      State: ${branch.current_state}`);
        console.log(`      Size: ${size}`);
        console.log(`      Age: ${age}`);
        console.log('');
      }
    }

    // Summary
    const readyCount = filteredBranches.filter(
      (b) => b.current_state === 'ready',
    ).length;
    const creatingCount = filteredBranches.filter(
      (b) => b.current_state === 'creating',
    ).length;
    const primaryCount = filteredBranches.filter((b) => b.primary).length;

    console.log('📊 Summary:');
    console.log(`   Total: ${filteredBranches.length} branches`);
    console.log(`   Ready: ${readyCount}`);
    if (creatingCount > 0) console.log(`   Creating: ${creatingCount}`);
    if (args.all) console.log(`   Primary: ${primaryCount}`);
  } catch (error) {
    console.error('❌ Error listing branches:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
