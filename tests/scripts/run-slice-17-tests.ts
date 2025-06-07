#!/usr/bin/env bun
/**
 * Slice 17 Test Runner
 *
 * Executes comprehensive integration tests for the enhanced RAG pipeline
 * and generates detailed performance and compatibility reports.
 */

import { execSync } from 'node:child_process';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  details?: string;
  error?: string;
}

interface TestSuite {
  name: string;
  tests: TestResult[];
  totalDuration: number;
  passed: number;
  failed: number;
  skipped: number;
}

interface TestReport {
  timestamp: string;
  environment: {
    node: string;
    platform: string;
    arch: string;
    neonBranching: boolean;
  };
  suites: TestSuite[];
  summary: {
    totalTests: number;
    totalPassed: number;
    totalFailed: number;
    totalSkipped: number;
    totalDuration: number;
    successRate: number;
  };
  performance: {
    databaseOperations: number;
    searchOperations: number;
    contextAssembly: number;
    memoryUsage: number;
  };
  compatibility: {
    enhancedFeatures: boolean;
    legacySupport: boolean;
    mixedDocuments: boolean;
    performanceAcceptable: boolean;
  };
}

class Slice17TestRunner {
  private reportDir: string;
  private timestamp: string;
  private results: TestSuite[] = [];

  constructor() {
    this.timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.reportDir = join(process.cwd(), 'test-results', 'slice-17');

    // Ensure report directory exists
    if (!existsSync(this.reportDir)) {
      mkdirSync(this.reportDir, { recursive: true });
    }
  }

  async runAllTests(): Promise<TestReport> {
    console.log('🚀 Starting Slice 17 Enhanced RAG Pipeline Tests');
    console.log('================================================\n');

    try {
      // Run test suites in order
      await this.runIntegrationTests();
      await this.runE2ETests();
      await this.runPerformanceTests();
      await this.runCompatibilityTests();

      // Generate comprehensive report
      const report = this.generateReport();
      await this.saveReport(report);

      console.log('\n📊 Test execution completed');
      this.printSummary(report);

      return report;
    } catch (error) {
      console.error('❌ Test execution failed:', error);
      throw error;
    }
  }

  private async runIntegrationTests(): Promise<void> {
    console.log('📋 Running Integration Tests...');

    const suite: TestSuite = {
      name: 'Integration Tests',
      tests: [],
      totalDuration: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
    };

    const integrationTests = [
      {
        name: 'ADE Metadata Integration',
        command:
          'bun test tests/integration/slice-17-rag-enhancement.test.ts --reporter=verbose',
        timeout: 300000, // 5 minutes
      },
      {
        name: 'Enhanced Search Functionality',
        command:
          'bun test tests/integration/slice-17-rag-enhancement.test.ts -t "Enhanced Search"',
        timeout: 180000, // 3 minutes
      },
      {
        name: 'Context Assembly and LLM Integration',
        command:
          'bun test tests/integration/slice-17-rag-enhancement.test.ts -t "Enhanced Context"',
        timeout: 120000, // 2 minutes
      },
    ];

    for (const test of integrationTests) {
      const result = await this.executeTest(
        test.name,
        test.command,
        test.timeout,
      );
      suite.tests.push(result);
      suite.totalDuration += result.duration;

      if (result.status === 'passed') suite.passed++;
      else if (result.status === 'failed') suite.failed++;
      else suite.skipped++;
    }

    this.results.push(suite);
    console.log(
      `✅ Integration tests completed: ${suite.passed}/${suite.tests.length} passed\n`,
    );
  }

  private async runE2ETests(): Promise<void> {
    console.log('🎭 Running End-to-End Tests...');

    const suite: TestSuite = {
      name: 'End-to-End Tests',
      tests: [],
      totalDuration: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
    };

    const e2eTests = [
      {
        name: 'Complete Document Processing Pipeline',
        command:
          'bunx playwright test tests/e2e/slice-17-end-to-end.test.ts -g "Complete document processing"',
        timeout: 600000, // 10 minutes
      },
      {
        name: 'Enhanced Search with Filtering',
        command:
          'bunx playwright test tests/e2e/slice-17-end-to-end.test.ts -g "Enhanced search functionality"',
        timeout: 300000, // 5 minutes
      },
      {
        name: 'Context Assembly and Citations',
        command:
          'bunx playwright test tests/e2e/slice-17-end-to-end.test.ts -g "Context assembly\\|citation display"',
        timeout: 240000, // 4 minutes
      },
      {
        name: 'Complete Workflow Integration',
        command:
          'bunx playwright test tests/e2e/slice-17-end-to-end.test.ts -g "Complete workflow"',
        timeout: 480000, // 8 minutes
      },
    ];

    for (const test of e2eTests) {
      const result = await this.executeTest(
        test.name,
        test.command,
        test.timeout,
      );
      suite.tests.push(result);
      suite.totalDuration += result.duration;

      if (result.status === 'passed') suite.passed++;
      else if (result.status === 'failed') suite.failed++;
      else suite.skipped++;
    }

    this.results.push(suite);
    console.log(
      `✅ E2E tests completed: ${suite.passed}/${suite.tests.length} passed\n`,
    );
  }

  private async runPerformanceTests(): Promise<void> {
    console.log('⚡ Running Performance Tests...');

    const suite: TestSuite = {
      name: 'Performance Tests',
      tests: [],
      totalDuration: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
    };

    const performanceTests = [
      {
        name: 'Search Performance with Metadata',
        command:
          'bun test tests/integration/slice-17-rag-enhancement.test.ts -t "search performance"',
        timeout: 180000,
      },
      {
        name: 'Context Assembly Latency',
        command:
          'bun test tests/integration/slice-17-rag-enhancement.test.ts -t "context assembly latency"',
        timeout: 120000,
      },
      {
        name: 'Enhanced vs Legacy Benchmark',
        command:
          'bun test tests/integration/slice-17-rag-enhancement.test.ts -t "benchmark enhanced vs previous"',
        timeout: 240000,
      },
      {
        name: 'E2E Performance Validation',
        command:
          'bunx playwright test tests/e2e/slice-17-end-to-end.test.ts -g "Performance validation"',
        timeout: 300000,
      },
    ];

    for (const test of performanceTests) {
      const result = await this.executeTest(
        test.name,
        test.command,
        test.timeout,
      );
      suite.tests.push(result);
      suite.totalDuration += result.duration;

      if (result.status === 'passed') suite.passed++;
      else if (result.status === 'failed') suite.failed++;
      else suite.skipped++;
    }

    this.results.push(suite);
    console.log(
      `✅ Performance tests completed: ${suite.passed}/${suite.tests.length} passed\n`,
    );
  }

  private async runCompatibilityTests(): Promise<void> {
    console.log('🔄 Running Compatibility Tests...');

    const suite: TestSuite = {
      name: 'Compatibility Tests',
      tests: [],
      totalDuration: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
    };

    const compatibilityTests = [
      {
        name: 'Legacy Document Support',
        command:
          'bun test tests/integration/slice-17-rag-enhancement.test.ts -t "legacy documents"',
        timeout: 180000,
      },
      {
        name: 'Mixed Document Scenarios',
        command:
          'bun test tests/integration/slice-17-rag-enhancement.test.ts -t "mixed document scenarios"',
        timeout: 240000,
      },
      {
        name: 'Backward Compatibility',
        command:
          'bun test tests/integration/slice-17-rag-enhancement.test.ts -t "backward compatibility"',
        timeout: 120000,
      },
    ];

    for (const test of compatibilityTests) {
      const result = await this.executeTest(
        test.name,
        test.command,
        test.timeout,
      );
      suite.tests.push(result);
      suite.totalDuration += result.duration;

      if (result.status === 'passed') suite.passed++;
      else if (result.status === 'failed') suite.failed++;
      else suite.skipped++;
    }

    this.results.push(suite);
    console.log(
      `✅ Compatibility tests completed: ${suite.passed}/${suite.tests.length} passed\n`,
    );
  }

  private async executeTest(
    name: string,
    command: string,
    timeout: number,
  ): Promise<TestResult> {
    console.log(`  🔄 Running: ${name}`);
    const startTime = Date.now();

    try {
      const output = execSync(command, {
        timeout,
        encoding: 'utf8',
        stdio: 'pipe',
        env: {
          ...process.env,
          USE_NEON_BRANCHING: 'true',
          VITEST_REPORTER: 'verbose',
          NODE_ENV: 'test',
        },
      });

      const duration = Date.now() - startTime;
      console.log(`  ✅ ${name} - Passed (${duration}ms)`);

      return {
        name,
        status: 'passed',
        duration,
        details: this.extractTestDetails(output),
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.log(`  ❌ ${name} - Failed (${duration}ms)`);

      return {
        name,
        status: 'failed',
        duration,
        error: error.message,
        details: error.stdout || error.stderr || 'No additional details',
      };
    }
  }

  private extractTestDetails(output: string): string {
    // Extract key metrics from test output
    const lines = output.split('\n');
    const details: string[] = [];

    // Look for performance metrics
    lines.forEach((line) => {
      if (
        line.includes('Duration:') ||
        line.includes('Memory:') ||
        line.includes('Results:') ||
        line.includes('Performance Test Results:') ||
        line.includes('Enhanced Pipeline:') ||
        line.includes('Legacy Pipeline:')
      ) {
        details.push(line.trim());
      }
    });

    return details.slice(0, 10).join('\n'); // Limit to first 10 relevant lines
  }

  private generateReport(): TestReport {
    const totalTests = this.results.reduce(
      (sum, suite) => sum + suite.tests.length,
      0,
    );
    const totalPassed = this.results.reduce(
      (sum, suite) => sum + suite.passed,
      0,
    );
    const totalFailed = this.results.reduce(
      (sum, suite) => sum + suite.failed,
      0,
    );
    const totalSkipped = this.results.reduce(
      (sum, suite) => sum + suite.skipped,
      0,
    );
    const totalDuration = this.results.reduce(
      (sum, suite) => sum + suite.totalDuration,
      0,
    );

    return {
      timestamp: this.timestamp,
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        neonBranching: process.env.USE_NEON_BRANCHING === 'true',
      },
      suites: this.results,
      summary: {
        totalTests,
        totalPassed,
        totalFailed,
        totalSkipped,
        totalDuration,
        successRate: totalTests > 0 ? (totalPassed / totalTests) * 100 : 0,
      },
      performance: this.calculatePerformanceMetrics(),
      compatibility: this.assessCompatibility(),
    };
  }

  private calculatePerformanceMetrics() {
    // Extract performance metrics from test results
    const performanceSuite = this.results.find(
      (s) => s.name === 'Performance Tests',
    );

    return {
      databaseOperations: performanceSuite?.totalDuration || 0,
      searchOperations: this.extractMetric('search', 'duration') || 0,
      contextAssembly: this.extractMetric('context', 'duration') || 0,
      memoryUsage: this.extractMetric('memory', 'usage') || 0,
    };
  }

  private assessCompatibility() {
    const compatSuite = this.results.find(
      (s) => s.name === 'Compatibility Tests',
    );
    const integrationSuite = this.results.find(
      (s) => s.name === 'Integration Tests',
    );

    return {
      enhancedFeatures: (integrationSuite?.passed || 0) > 0,
      legacySupport:
        compatSuite?.tests.find((t) => t.name.includes('Legacy'))?.status ===
        'passed',
      mixedDocuments:
        compatSuite?.tests.find((t) => t.name.includes('Mixed'))?.status ===
        'passed',
      performanceAcceptable:
        (this.results.find((s) => s.name === 'Performance Tests')?.passed ||
          0) >= 2,
    };
  }

  private extractMetric(keyword: string, type: 'duration' | 'usage'): number {
    // Simple metric extraction from test details
    for (const suite of this.results) {
      for (const test of suite.tests) {
        if (test.details?.toLowerCase().includes(keyword)) {
          if (type === 'duration') return test.duration;
          // For usage, try to extract from details
          const match = test.details.match(/(\d+(?:\.\d+)?)(?:MB|ms|bytes)/);
          if (match) return Number.parseFloat(match[1]);
        }
      }
    }
    return 0;
  }

  private async saveReport(report: TestReport): Promise<void> {
    const reportPath = join(
      this.reportDir,
      `slice-17-test-report-${this.timestamp}.json`,
    );
    const htmlReportPath = join(
      this.reportDir,
      `slice-17-test-report-${this.timestamp}.html`,
    );

    // Save JSON report
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📄 JSON report saved: ${reportPath}`);

    // Generate and save HTML report
    const htmlReport = this.generateHtmlReport(report);
    writeFileSync(htmlReportPath, htmlReport);
    console.log(`📄 HTML report saved: ${htmlReportPath}`);

    // Save latest report (for CI/CD)
    const latestPath = join(this.reportDir, 'latest-slice-17-report.json');
    writeFileSync(latestPath, JSON.stringify(report, null, 2));
  }

  private generateHtmlReport(report: TestReport): string {
    return `<!DOCTYPE html>
<html>
<head>
    <title>Slice 17 Enhanced RAG Pipeline Test Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
        .metric { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; }
        .metric-value { font-size: 2em; font-weight: bold; color: #495057; }
        .metric-label { color: #6c757d; margin-top: 5px; }
        .suite { margin: 20px 0; border: 1px solid #dee2e6; border-radius: 8px; overflow: hidden; }
        .suite-header { background: #e9ecef; padding: 15px; font-weight: bold; }
        .test { padding: 10px 15px; border-bottom: 1px solid #f1f3f4; }
        .test:last-child { border-bottom: none; }
        .passed { color: #28a745; }
        .failed { color: #dc3545; }
        .skipped { color: #ffc107; }
        .details { font-size: 0.9em; color: #6c757d; margin-top: 5px; }
        .compatibility { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 20px 0; }
        .compat-item { display: flex; align-items: center; }
        .compat-icon { margin-right: 8px; font-size: 1.2em; }
        .success-rate { font-size: 1.5em; font-weight: bold; color: ${report.summary.successRate >= 90 ? '#28a745' : report.summary.successRate >= 70 ? '#ffc107' : '#dc3545'}; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 Slice 17: Enhanced RAG Pipeline Test Report</h1>
        <p>Generated: ${new Date(report.timestamp).toLocaleString()}</p>
        <p>Environment: Node ${report.environment.node} on ${report.environment.platform} (${report.environment.arch})</p>
    </div>

    <div class="summary">
        <div class="metric">
            <div class="metric-value success-rate">${report.summary.successRate.toFixed(1)}%</div>
            <div class="metric-label">Success Rate</div>
        </div>
        <div class="metric">
            <div class="metric-value">${report.summary.totalPassed}</div>
            <div class="metric-label">Tests Passed</div>
        </div>
        <div class="metric">
            <div class="metric-value">${report.summary.totalFailed}</div>
            <div class="metric-label">Tests Failed</div>
        </div>
        <div class="metric">
            <div class="metric-value">${(report.summary.totalDuration / 1000).toFixed(1)}s</div>
            <div class="metric-label">Total Duration</div>
        </div>
    </div>

    <h2>🔧 Compatibility Assessment</h2>
    <div class="compatibility">
        <div class="compat-item">
            <span class="compat-icon">${report.compatibility.enhancedFeatures ? '✅' : '❌'}</span>
            Enhanced Features Working
        </div>
        <div class="compat-item">
            <span class="compat-icon">${report.compatibility.legacySupport ? '✅' : '❌'}</span>
            Legacy Document Support
        </div>
        <div class="compat-item">
            <span class="compat-icon">${report.compatibility.mixedDocuments ? '✅' : '❌'}</span>
            Mixed Document Scenarios
        </div>
        <div class="compat-item">
            <span class="compat-icon">${report.compatibility.performanceAcceptable ? '✅' : '❌'}</span>
            Performance Acceptable
        </div>
    </div>

    <h2>📊 Test Suites</h2>
    ${report.suites
      .map(
        (suite) => `
        <div class="suite">
            <div class="suite-header">
                ${suite.name} (${suite.passed}/${suite.tests.length} passed, ${(suite.totalDuration / 1000).toFixed(1)}s)
            </div>
            ${suite.tests
              .map(
                (test) => `
                <div class="test">
                    <span class="${test.status}">${test.status === 'passed' ? '✅' : test.status === 'failed' ? '❌' : '⏭️'}</span>
                    <strong>${test.name}</strong> (${test.duration}ms)
                    ${test.details ? `<div class="details">${test.details.split('\n').slice(0, 3).join('<br>')}</div>` : ''}
                    ${test.error ? `<div class="details" style="color: #dc3545;">Error: ${test.error}</div>` : ''}
                </div>
            `,
              )
              .join('')}
        </div>
    `,
      )
      .join('')}

    <h2>⚡ Performance Metrics</h2>
    <div class="summary">
        <div class="metric">
            <div class="metric-value">${report.performance.searchOperations}ms</div>
            <div class="metric-label">Avg Search Time</div>
        </div>
        <div class="metric">
            <div class="metric-value">${report.performance.contextAssembly}ms</div>
            <div class="metric-label">Context Assembly</div>
        </div>
        <div class="metric">
            <div class="metric-value">${(report.performance.memoryUsage / 1024 / 1024).toFixed(1)}MB</div>
            <div class="metric-label">Peak Memory</div>
        </div>
    </div>

    <div style="margin-top: 40px; padding: 20px; background: #f8f9fa; border-radius: 8px; font-size: 0.9em; color: #6c757d;">
        <strong>About Slice 17:</strong> This test suite validates the enhanced RAG pipeline with ADE (Advanced Document Extraction) 
        metadata integration, including structural document understanding, enhanced search capabilities, improved context assembly, 
        and backward compatibility with legacy documents.
    </div>
</body>
</html>`;
  }

  private printSummary(report: TestReport): void {
    console.log('\n📈 Test Summary');
    console.log('===============');
    console.log(
      `✅ Passed: ${report.summary.totalPassed}/${report.summary.totalTests}`,
    );
    console.log(
      `❌ Failed: ${report.summary.totalFailed}/${report.summary.totalTests}`,
    );
    console.log(
      `⏭️  Skipped: ${report.summary.totalSkipped}/${report.summary.totalTests}`,
    );
    console.log(
      `⏱️  Duration: ${(report.summary.totalDuration / 1000).toFixed(1)}s`,
    );
    console.log(`📊 Success Rate: ${report.summary.successRate.toFixed(1)}%`);

    console.log('\n🔧 Compatibility');
    console.log('================');
    console.log(
      `Enhanced Features: ${report.compatibility.enhancedFeatures ? '✅' : '❌'}`,
    );
    console.log(
      `Legacy Support: ${report.compatibility.legacySupport ? '✅' : '❌'}`,
    );
    console.log(
      `Mixed Documents: ${report.compatibility.mixedDocuments ? '✅' : '❌'}`,
    );
    console.log(
      `Performance OK: ${report.compatibility.performanceAcceptable ? '✅' : '❌'}`,
    );

    if (report.summary.successRate >= 90) {
      console.log('\n🎉 Slice 17 implementation is ready for production!');
    } else if (report.summary.successRate >= 70) {
      console.log(
        '\n⚠️  Slice 17 implementation needs attention before production.',
      );
    } else {
      console.log('\n🚨 Slice 17 implementation has significant issues.');
    }
  }
}

// Main execution
async function main() {
  const runner = new Slice17TestRunner();

  try {
    const report = await runner.runAllTests();

    // Exit with appropriate code
    if (report.summary.successRate >= 90) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error) {
    console.error('Test execution failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.main) {
  main();
}

export { Slice17TestRunner };
export type { TestReport, TestSuite, TestResult };
