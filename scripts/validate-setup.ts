#!/usr/bin/env bun
/**
 * Setup Environment Validation Script
 * Validates that the remote environment setup is complete and working correctly
 * Based on requirements from /Users/neo/.claude/commands/setup-env-check.md
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

// ANSI color codes for output formatting
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

interface ValidationResult {
  category: string;
  item: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  suggestion?: string;
}

class SetupValidator {
  private results: ValidationResult[] = [];
  private projectRoot: string;

  constructor() {
    this.projectRoot = process.cwd();
  }

  private addResult(
    category: string,
    item: string,
    status: 'pass' | 'fail' | 'warning',
    message: string,
    suggestion?: string,
  ) {
    this.results.push({ category, item, status, message, suggestion });
  }

  private fileExists(path: string): boolean {
    return existsSync(join(this.projectRoot, path));
  }

  private readFile(path: string): string {
    try {
      return readFileSync(join(this.projectRoot, path), 'utf-8');
    } catch {
      return '';
    }
  }

  private runCommand(command: string): { success: boolean; output: string } {
    try {
      const output = execSync(command, {
        cwd: this.projectRoot,
        encoding: 'utf-8',
      });
      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        output: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private validateAgentsMd() {
    const category = 'AGENTS.md Validation';

    // Check if file exists and is readable
    if (!this.fileExists('AGENTS.md')) {
      this.addResult(
        category,
        'File exists',
        'fail',
        'AGENTS.md not found',
        'Create AGENTS.md file with project overview',
      );
      return;
    }

    const content = this.readFile('AGENTS.md');
    const lines = content.split('\n');

    this.addResult(
      category,
      'File exists',
      'pass',
      'AGENTS.md found and readable',
    );

    // Check line count (should be under 40 lines for quick agent parsing)
    if (lines.length > 40) {
      this.addResult(
        category,
        'File length',
        'warning',
        `File has ${lines.length} lines (> 40)`,
        'Consider condensing content for faster agent parsing',
      );
    } else {
      this.addResult(
        category,
        'File length',
        'pass',
        `File has ${lines.length} lines (≤ 40)`,
      );
    }

    // Check for placeholder text
    const placeholderPatterns = [
      /\[command\]/i,
      /\[todo\]/i,
      /\[placeholder\]/i,
      /\[fill.*\]/i,
    ];
    const hasPlaceholders = placeholderPatterns.some((pattern) =>
      pattern.test(content),
    );

    if (hasPlaceholders) {
      this.addResult(
        category,
        'No placeholders',
        'fail',
        'Found placeholder text in file',
        'Remove all [command], [todo], and similar placeholders',
      );
    } else {
      this.addResult(
        category,
        'No placeholders',
        'pass',
        'No placeholder text found',
      );
    }

    // Check for essential commands
    const essentialCommands = ['bun dev', 'bun build', 'bun test'];
    const missingCommands = essentialCommands.filter(
      (cmd) => !content.includes(cmd),
    );

    if (missingCommands.length > 0) {
      this.addResult(
        category,
        'Essential commands',
        'fail',
        `Missing commands: ${missingCommands.join(', ')}`,
        'Add missing essential commands to AGENTS.md',
      );
    } else {
      this.addResult(
        category,
        'Essential commands',
        'pass',
        'All essential commands documented',
      );
    }
  }

  private validateSetupSh() {
    const category = 'SETUP.sh Validation';

    // Check if file exists
    if (!this.fileExists('SETUP.sh')) {
      this.addResult(
        category,
        'File exists',
        'fail',
        'SETUP.sh not found',
        'Create SETUP.sh for automated environment setup',
      );
      return;
    }

    this.addResult(category, 'File exists', 'pass', 'SETUP.sh found');

    // Check executable permissions
    try {
      const stats = statSync(join(this.projectRoot, 'SETUP.sh'));
      const isExecutable = !!(stats.mode & 0o111);

      if (!isExecutable) {
        this.addResult(
          category,
          'Executable permissions',
          'fail',
          'SETUP.sh is not executable',
          'Run: chmod +x SETUP.sh',
        );
      } else {
        this.addResult(
          category,
          'Executable permissions',
          'pass',
          'SETUP.sh has executable permissions',
        );
      }
    } catch {
      this.addResult(
        category,
        'Executable permissions',
        'fail',
        'Cannot check permissions',
        'Verify file system permissions',
      );
    }

    // Check for proper error handling
    const content = this.readFile('SETUP.sh');
    const hasErrorHandling =
      content.includes('set -e') || content.includes('set -euo pipefail');

    if (!hasErrorHandling) {
      this.addResult(
        category,
        'Error handling',
        'warning',
        'No "set -e" found',
        'Add "set -e" for better error handling',
      );
    } else {
      this.addResult(
        category,
        'Error handling',
        'pass',
        'Error handling configured',
      );
    }

    // Check for shellcheck if available
    const shellcheckResult = this.runCommand('command -v shellcheck');
    if (shellcheckResult.success) {
      const lintResult = this.runCommand('shellcheck SETUP.sh');
      if (lintResult.success) {
        this.addResult(category, 'Shellcheck', 'pass', 'Shellcheck passes');
      } else {
        this.addResult(
          category,
          'Shellcheck',
          'warning',
          'Shellcheck found issues',
          'Fix shellcheck warnings for better script quality',
        );
      }
    } else {
      this.addResult(
        category,
        'Shellcheck',
        'warning',
        'Shellcheck not available',
        'Install shellcheck for script validation',
      );
    }

    // Check for essential commands referenced
    const commandChecks = ['bun', 'npm', 'node'];
    const missingCommands = commandChecks.filter(
      (cmd) => !content.includes(cmd),
    );

    if (missingCommands.length === commandChecks.length) {
      this.addResult(
        category,
        'Commands referenced',
        'warning',
        'No package manager commands found',
        'Ensure script handles package manager installation',
      );
    } else {
      this.addResult(
        category,
        'Commands referenced',
        'pass',
        'Package manager commands referenced',
      );
    }
  }

  private validateEnvironmentVariables() {
    const category = 'Environment Variables';

    // Check .env.example exists
    if (!this.fileExists('.env.example')) {
      this.addResult(
        category,
        '.env.example exists',
        'fail',
        '.env.example not found',
        'Create .env.example with all required variables',
      );
      return;
    }

    this.addResult(
      category,
      '.env.example exists',
      'pass',
      '.env.example found',
    );

    // Check .gitignore excludes .env files
    const gitignoreContent = this.readFile('.gitignore');
    const protectsEnv =
      gitignoreContent.includes('.env') ||
      gitignoreContent.includes('.env.local');

    if (!protectsEnv) {
      this.addResult(
        category,
        '.env in .gitignore',
        'fail',
        '.env files not in .gitignore',
        'Add .env* to .gitignore to prevent secret exposure',
      );
    } else {
      this.addResult(
        category,
        '.env in .gitignore',
        'pass',
        '.env files properly ignored',
      );
    }

    // Check for required variables in .env.example
    const envContent = this.readFile('.env.example');
    const requiredVars = [
      'POSTGRES_URL',
      'KINDE_CLIENT_ID',
      'KINDE_CLIENT_SECRET',
      'KINDE_ISSUER_URL',
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'GEMINI_API_KEY',
    ];

    const missingVars = requiredVars.filter(
      (varName) => !envContent.includes(varName),
    );

    if (missingVars.length > 0) {
      this.addResult(
        category,
        'Required variables',
        'fail',
        `Missing variables: ${missingVars.join(', ')}`,
        'Add missing required environment variables',
      );
    } else {
      this.addResult(
        category,
        'Required variables',
        'pass',
        'All required variables documented',
      );
    }

    // Check for secrets in committed files (basic check)
    const secretPatterns = [
      /sk-[a-zA-Z0-9]{48}/,
      /pk_[a-zA-Z0-9_]{24,}/,
      /postgres:\/\/.*:[^*]/,
    ];
    const hasSecrets = secretPatterns.some((pattern) =>
      pattern.test(envContent),
    );

    if (hasSecrets) {
      this.addResult(
        category,
        'No secrets committed',
        'fail',
        'Potential secrets found in .env.example',
        'Replace actual secrets with placeholder values (****)',
      );
    } else {
      this.addResult(
        category,
        'No secrets committed',
        'pass',
        'No secrets detected in .env.example',
      );
    }
  }

  private validateQuickSetupTest() {
    const category = 'Quick Setup Test';

    // Check if package.json exists
    if (!this.fileExists('package.json')) {
      this.addResult(
        category,
        'package.json exists',
        'fail',
        'package.json not found',
        'Ensure project is properly initialized',
      );
      return;
    }

    this.addResult(
      category,
      'package.json exists',
      'pass',
      'package.json found',
    );

    // Check package manager availability
    const packageManagers = ['bun', 'npm', 'yarn'];
    const availableManagers = packageManagers.filter(
      (pm) => this.runCommand(`command -v ${pm}`).success,
    );

    if (availableManagers.length === 0) {
      this.addResult(
        category,
        'Package manager',
        'fail',
        'No package manager available',
        'Install bun, npm, or yarn',
      );
    } else {
      this.addResult(
        category,
        'Package manager',
        'pass',
        `Available: ${availableManagers.join(', ')}`,
      );
    }

    // Check if dependencies are installable (basic check)
    const packageJson = JSON.parse(this.readFile('package.json') || '{}');
    const hasDependencies =
      packageJson.dependencies || packageJson.devDependencies;

    if (!hasDependencies) {
      this.addResult(
        category,
        'Dependencies defined',
        'warning',
        'No dependencies found in package.json',
        'Verify package.json completeness',
      );
    } else {
      this.addResult(
        category,
        'Dependencies defined',
        'pass',
        'Dependencies found in package.json',
      );
    }

    // Check essential scripts
    const scripts = packageJson.scripts || {};
    const essentialScripts = ['dev', 'build', 'test'];
    const missingScripts = essentialScripts.filter(
      (script) => !scripts[script],
    );

    if (missingScripts.length > 0) {
      this.addResult(
        category,
        'Essential scripts',
        'warning',
        `Missing scripts: ${missingScripts.join(', ')}`,
        'Add missing npm scripts',
      );
    } else {
      this.addResult(
        category,
        'Essential scripts',
        'pass',
        'Essential scripts defined',
      );
    }

    // Check TypeScript configuration
    if (this.fileExists('tsconfig.json')) {
      this.addResult(
        category,
        'TypeScript config',
        'pass',
        'tsconfig.json found',
      );
    } else {
      this.addResult(
        category,
        'TypeScript config',
        'warning',
        'tsconfig.json not found',
        'Add TypeScript configuration',
      );
    }
  }

  private validateAgentCompatibility() {
    const category = 'Agent Compatibility';

    // Check for GUI dependencies
    const packageJson = JSON.parse(this.readFile('package.json') || '{}');
    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    const guiDeps = Object.keys(allDeps || {}).filter(
      (dep) =>
        dep.includes('electron') ||
        dep.includes('desktop') ||
        dep.includes('native'),
    );

    if (guiDeps.length > 0) {
      this.addResult(
        category,
        'No GUI dependencies',
        'warning',
        `GUI dependencies found: ${guiDeps.join(', ')}`,
        'Consider headless alternatives for agent environments',
      );
    } else {
      this.addResult(
        category,
        'No GUI dependencies',
        'pass',
        'No GUI dependencies detected',
      );
    }

    // Check for network requirements documentation
    const readmeContent = this.readFile('README.md');
    const agentsContent = this.readFile('AGENTS.md');
    const hasNetworkDocs =
      readmeContent.includes('network') ||
      readmeContent.includes('internet') ||
      agentsContent.includes('network') ||
      agentsContent.includes('API');

    if (!hasNetworkDocs) {
      this.addResult(
        category,
        'Network requirements',
        'warning',
        'Network requirements not documented',
        'Document API keys and network dependencies',
      );
    } else {
      this.addResult(
        category,
        'Network requirements',
        'pass',
        'Network requirements documented',
      );
    }

    // Check for minimal environment commands
    const agentsContent2 = this.readFile('AGENTS.md');
    const hasMinimalCommands =
      agentsContent2.includes('bun') || agentsContent2.includes('npm');

    if (!hasMinimalCommands) {
      this.addResult(
        category,
        'Minimal commands',
        'warning',
        'No minimal environment commands found',
        'Document basic commands for agent execution',
      );
    } else {
      this.addResult(
        category,
        'Minimal commands',
        'pass',
        'Minimal environment commands documented',
      );
    }

    // Check for Docker support (optional but good for agents)
    if (
      this.fileExists('Dockerfile') ||
      this.fileExists('docker-compose.yml')
    ) {
      this.addResult(
        category,
        'Container support',
        'pass',
        'Docker configuration found',
      );
    } else {
      this.addResult(
        category,
        'Container support',
        'warning',
        'No container configuration',
        'Consider adding Dockerfile for consistent environments',
      );
    }
  }

  public async validate(): Promise<void> {
    console.log(
      `${colors.bold}${colors.blue}🔍 RRA_V2 Setup Environment Validation${colors.reset}\n`,
    );

    this.validateAgentsMd();
    this.validateSetupSh();
    this.validateEnvironmentVariables();
    this.validateQuickSetupTest();
    this.validateAgentCompatibility();

    this.printResults();
  }

  private printResults(): void {
    const categories = [...new Set(this.results.map((r) => r.category))];

    categories.forEach((category) => {
      console.log(`${colors.bold}${colors.blue}${category}${colors.reset}`);

      const categoryResults = this.results.filter(
        (r) => r.category === category,
      );
      categoryResults.forEach((result) => {
        const icon =
          result.status === 'pass'
            ? '✅'
            : result.status === 'fail'
              ? '❌'
              : '⚠️';
        const color =
          result.status === 'pass'
            ? colors.green
            : result.status === 'fail'
              ? colors.red
              : colors.yellow;

        console.log(
          `  ${icon} ${result.item}: ${color}${result.message}${colors.reset}`,
        );

        if (result.suggestion) {
          console.log(
            `    💡 ${colors.yellow}${result.suggestion}${colors.reset}`,
          );
        }
      });

      console.log('');
    });

    // Summary
    const passed = this.results.filter((r) => r.status === 'pass').length;
    const failed = this.results.filter((r) => r.status === 'fail').length;
    const warnings = this.results.filter((r) => r.status === 'warning').length;
    const total = this.results.length;

    console.log(`${colors.bold}📊 Summary${colors.reset}`);
    console.log(`  Total checks: ${total}`);
    console.log(`  ${colors.green}✅ Passed: ${passed}${colors.reset}`);
    console.log(`  ${colors.red}❌ Failed: ${failed}${colors.reset}`);
    console.log(`  ${colors.yellow}⚠️  Warnings: ${warnings}${colors.reset}`);

    const score = Math.round((passed / total) * 100);
    const scoreColor =
      score >= 80 ? colors.green : score >= 60 ? colors.yellow : colors.red;
    console.log(
      `\n${colors.bold}🎯 Setup Score: ${scoreColor}${score}%${colors.reset}`,
    );

    if (failed > 0) {
      console.log(
        `\n${colors.red}❌ Critical issues found. Address failed checks before deployment.${colors.reset}`,
      );
    } else if (warnings > 0) {
      console.log(
        `\n${colors.yellow}⚠️ Setup complete with warnings. Consider addressing suggestions for optimal agent compatibility.${colors.reset}`,
      );
    } else {
      console.log(
        `\n${colors.green}🎉 Excellent! Setup is fully validated and agent-ready.${colors.reset}`,
      );
    }
  }
}

// Run validation
async function main() {
  const validator = new SetupValidator();
  await validator.validate();

  // Exit with appropriate code
  const results = (validator as any).results as ValidationResult[];
  const hasCriticalFailures = results.some((r) => r.status === 'fail');
  process.exit(hasCriticalFailures ? 1 : 0);
}

if (import.meta.main) {
  main().catch(console.error);
}
