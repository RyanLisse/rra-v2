#!/usr/bin/env bun
/**
 * Demo Workflow - Example usage of enhanced test branch management
 *
 * This script demonstrates a complete workflow using the enhanced test branch management system
 */

import { spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(spawn);

interface DemoStep {
  name: string;
  description: string;
  command: string[];
  optional?: boolean;
}

const DEMO_STEPS: DemoStep[] = [
  {
    name: 'Health Check',
    description: 'Check system health before starting',
    command: ['bun', 'run', 'test:branches:health', '--verbose'],
  },
  {
    name: 'Status Overview',
    description: 'Show current branch status',
    command: ['bun', 'run', 'test:branches:status', '--format=summary'],
  },
  {
    name: 'Create Test Branches',
    description: 'Create branches for development testing',
    command: [
      'bun',
      'run',
      'test:branches:create',
      '--envs=unit,integration',
      '--count=1',
      '--prefix=demo',
      '--dry-run',
    ],
  },
  {
    name: 'Show Statistics',
    description: 'Display system statistics',
    command: ['bun', 'run', 'test:branches:manager', 'stats', '--format=table'],
  },
  {
    name: 'Cleanup Demo',
    description: 'Clean up old demo branches',
    command: [
      'bun',
      'run',
      'test:branches:cleanup',
      '--policies=emergency',
      '--dry-run',
    ],
    optional: true,
  },
];

async function runCommand(
  command: string[],
): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    console.log(`\n🔧 Running: ${command.join(' ')}`);
    console.log('─'.repeat(80));

    const process = spawn(command[0], command.slice(1), {
      stdio: 'inherit',
      shell: true,
    });

    process.on('close', (code) => {
      resolve({
        success: code === 0,
        output: `Process exited with code ${code}`,
      });
    });

    process.on('error', (error) => {
      resolve({
        success: false,
        output: `Error: ${error.message}`,
      });
    });
  });
}

async function runDemo(): Promise<void> {
  console.log('🚀 Enhanced Neon Test Branch Management Demo');
  console.log('═'.repeat(80));
  console.log(
    'This demo showcases the enhanced test branch management capabilities.',
  );
  console.log(
    'All operations will run in DRY RUN mode to avoid creating/deleting branches.',
  );
  console.log('');

  let successCount = 0;
  let failureCount = 0;

  for (const [index, step] of DEMO_STEPS.entries()) {
    console.log(`\n📋 Step ${index + 1}/${DEMO_STEPS.length}: ${step.name}`);
    console.log(`   ${step.description}`);

    if (step.optional) {
      console.log('   (Optional step)');
    }

    const result = await runCommand(step.command);

    if (result.success) {
      console.log(`\n✅ Step ${index + 1} completed successfully`);
      successCount++;
    } else {
      console.log(`\n❌ Step ${index + 1} failed: ${result.output}`);
      failureCount++;

      if (!step.optional) {
        console.log(
          '   This step was required. Continuing anyway for demo purposes...',
        );
      }
    }

    // Add a small delay between steps for readability
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log('\n' + '═'.repeat(80));
  console.log('🎉 Demo Completed');
  console.log(`   ✅ Successful steps: ${successCount}`);
  console.log(`   ❌ Failed steps: ${failureCount}`);
  console.log('');

  if (failureCount === 0) {
    console.log('🎊 All steps completed successfully!');
    console.log(
      '   The enhanced test branch management system is working correctly.',
    );
  } else {
    console.log(
      '⚠️  Some steps failed, but this is expected in a demo environment.',
    );
    console.log('   Check the output above for details.');
  }

  console.log('');
  console.log('💡 Next Steps:');
  console.log(
    '   • Set up NEON_PROJECT_ID environment variable for real usage',
  );
  console.log('   • Remove --dry-run flags to perform actual operations');
  console.log('   • Integrate scripts into your CI/CD pipeline');
  console.log('   • Set up monitoring with the health check commands');
  console.log('');
  console.log('📚 Documentation:');
  console.log('   • Read scripts/README.md for detailed usage instructions');
  console.log('   • Check --help for each script for all available options');
  console.log('   • Review lib/testing/neon-api-client.ts for API details');
}

async function main() {
  try {
    await runDemo();
  } catch (error) {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
