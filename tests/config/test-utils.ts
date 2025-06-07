/**
 * Enhanced test utilities with Neon API client integration
 * Provides helper functions, setup utilities, and test management
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { TestInfo } from '@playwright/test';
import {
  getNeonApiClient,
  type BranchCreationOptions,
  type TestBranchInfo,
} from '@/lib/testing/neon-api-client';
import { getNeonLogger } from '@/lib/testing/neon-logger';
import { getTestConfig, validateTestEnvironment } from './config-builder';
import {
  setupNeonTestBranching,
  isNeonBranchingEnabled,
} from './neon-branch-setup';
import type {
  TestExecutionContext,
  TestMetrics,
  TestSetupHooks,
  CompleteTestConfig,
} from './types';

const logger = getNeonLogger();

/**
 * Enhanced test context manager
 */
export class TestContextManager {
  private static instance: TestContextManager;
  private contexts = new Map<string, TestExecutionContext>();
  private globalMetrics: TestMetrics;
  private config: CompleteTestConfig;

  private constructor() {
    this.config = getTestConfig();
    this.globalMetrics = this.initializeGlobalMetrics();
  }

  static getInstance(): TestContextManager {
    if (!TestContextManager.instance) {
      TestContextManager.instance = new TestContextManager();
    }
    return TestContextManager.instance;
  }

  /**
   * Create a new test execution context
   */
  createContext(
    testName: string,
    testFile: string,
    testSuite: string,
    testType: 'unit' | 'integration' | 'e2e' | 'performance' = 'unit',
  ): TestExecutionContext {
    const context: TestExecutionContext = {
      testName,
      testFile,
      testSuite,
      testType,
      startTime: new Date(),
      status: 'pending',
      logs: [],
      cleanup: [],
    };

    this.contexts.set(testName, context);

    logger.info('test_context', 'Test context created', {
      testName,
      testSuite,
      testType,
    });

    return context;
  }

  /**
   * Update test context
   */
  updateContext(
    testName: string,
    updates: Partial<TestExecutionContext>,
  ): void {
    const context = this.contexts.get(testName);
    if (context) {
      Object.assign(context, updates);

      if (updates.status === 'passed' || updates.status === 'failed') {
        context.endTime = new Date();
        context.duration =
          context.endTime.getTime() - context.startTime.getTime();
      }
    }
  }

  /**
   * Get test context
   */
  getContext(testName: string): TestExecutionContext | undefined {
    return this.contexts.get(testName);
  }

  /**
   * Add cleanup function to context
   */
  addCleanup(testName: string, cleanupFn: () => Promise<void>): void {
    const context = this.contexts.get(testName);
    if (context) {
      context.cleanup = context.cleanup || [];
      context.cleanup.push(cleanupFn);
    }
  }

  /**
   * Execute cleanup functions for a test
   */
  async executeCleanup(testName: string): Promise<void> {
    const context = this.contexts.get(testName);
    if (context && context.cleanup) {
      const cleanupPromises = context.cleanup.map((fn) =>
        fn().catch((error) =>
          logger.error('test_context', 'Cleanup function failed', {
            testName,
            error: error.message,
          }),
        ),
      );

      await Promise.allSettled(cleanupPromises);
      context.cleanup = [];
    }
  }

  /**
   * Initialize global metrics
   */
  private initializeGlobalMetrics(): TestMetrics {
    return {
      suiteMetrics: {
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
        duration: 0,
        branchOperations: 0,
        totalBranchCreationTime: 0,
        totalBranchDeletionTime: 0,
        branchFailures: 0,
      },
      performanceMetrics: {
        memoryUsage: process.memoryUsage(),
      },
      errorSummary: {
        totalErrors: 0,
        errorsByType: {},
        criticalErrors: [],
      },
      neonMetrics: {
        activeBranches: 0,
        branchesCreated: 0,
        branchesDeleted: 0,
        apiCallsTotal: 0,
        apiCallsSuccess: 0,
        apiCallsFailure: 0,
        avgApiResponseTime: 0,
      },
    };
  }

  /**
   * Update global metrics
   */
  updateGlobalMetrics(updates: Partial<TestMetrics>): void {
    if (updates.suiteMetrics) {
      Object.assign(this.globalMetrics.suiteMetrics, updates.suiteMetrics);
    }
    if (updates.performanceMetrics) {
      Object.assign(
        this.globalMetrics.performanceMetrics,
        updates.performanceMetrics,
      );
    }
    if (updates.errorSummary) {
      Object.assign(this.globalMetrics.errorSummary, updates.errorSummary);
    }
    if (updates.neonMetrics) {
      Object.assign(this.globalMetrics.neonMetrics, updates.neonMetrics);
    }
  }

  /**
   * Get current global metrics
   */
  getGlobalMetrics(): TestMetrics {
    return { ...this.globalMetrics };
  }

  /**
   * Export all test data
   */
  exportTestData() {
    return {
      config: this.config,
      contexts: Array.from(this.contexts.values()),
      globalMetrics: this.globalMetrics,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Enhanced test setup utilities
 */
export class TestSetupUtils {
  private static contextManager = TestContextManager.getInstance();

  /**
   * Setup test suite with enhanced Neon integration
   */
  static setupTestSuite(
    suiteName: string,
    options?: {
      type?: 'unit' | 'integration' | 'e2e' | 'performance';
      useNeonBranching?: boolean;
      enableMetrics?: boolean;
      branchOptions?: Partial<BranchCreationOptions>;
      hooks?: TestSetupHooks;
    },
  ) {
    const {
      type = 'unit',
      useNeonBranching = isNeonBranchingEnabled(),
      enableMetrics = true,
      branchOptions = {},
      hooks = {},
    } = options || {};

    logger.info('test_setup', `Setting up test suite: ${suiteName}`, {
      type,
      useNeonBranching,
      enableMetrics,
    });

    // Setup Neon branching if enabled
    if (useNeonBranching) {
      setupNeonTestBranching(suiteName, {
        useEnhancedClient: true,
        branchOptions: {
          purpose: `${type}-testing`,
          tags: [type, 'automated', 'test-suite'],
          ...branchOptions,
        },
        enableMetrics,
      });
    }

    // Setup global hooks
    beforeAll(async () => {
      const startTime = Date.now();

      // Execute custom hook
      if (hooks.beforeAll) {
        await hooks.beforeAll();
      }

      // Update metrics
      if (enableMetrics) {
        TestSetupUtils.contextManager.updateGlobalMetrics({
          suiteMetrics: {
            totalTests: 0,
            passedTests: 0,
            failedTests: 0,
            skippedTests: 0,
            duration: 0,
          },
        });
      }

      logger.info('test_setup', `Test suite setup completed: ${suiteName}`, {
        duration: Date.now() - startTime,
      });
    });

    afterAll(async () => {
      const startTime = Date.now();

      // Execute custom hook
      if (hooks.afterAll) {
        await hooks.afterAll();
      }

      // Export test data if enabled
      if (enableMetrics && process.env.EXPORT_TEST_REPORTS === 'true') {
        await TestSetupUtils.exportTestMetrics(suiteName);
      }

      logger.info('test_setup', `Test suite teardown completed: ${suiteName}`, {
        duration: Date.now() - startTime,
      });
    });

    // Setup per-test hooks
    beforeEach(async () => {
      if (hooks.beforeEach) {
        await hooks.beforeEach();
      }
    });

    afterEach(async () => {
      if (hooks.afterEach) {
        await hooks.afterEach();
      }
    });
  }

  /**
   * Setup individual test with context tracking
   */
  static setupTest(
    testName: string,
    testFile: string,
    testSuite: string,
    options?: {
      type?: 'unit' | 'integration' | 'e2e' | 'performance';
      enableMetrics?: boolean;
      timeout?: number;
    },
  ): TestExecutionContext {
    const { type = 'unit', enableMetrics = true, timeout } = options || {};

    const context = TestSetupUtils.contextManager.createContext(
      testName,
      testFile,
      testSuite,
      type,
    );

    if (timeout) {
      // Set test timeout if supported by test framework
      // This would need to be implemented based on the test runner
    }

    return context;
  }

  /**
   * Create test branch with enhanced options
   */
  static async createTestBranch(
    testName: string,
    options?: Partial<BranchCreationOptions>,
  ): Promise<TestBranchInfo> {
    if (!isNeonBranchingEnabled()) {
      throw new Error('Neon branching is not enabled');
    }

    const neonClient = getNeonApiClient();
    const startTime = Date.now();

    const branchOptions: BranchCreationOptions = {
      testSuite: testName,
      purpose: 'individual-test',
      tags: ['test', 'automated', 'individual'],
      waitForReady: true,
      timeoutMs: 120000,
      ...options,
    };

    logger.info('test_utils', `Creating test branch for: ${testName}`);

    try {
      const result = await neonClient.createTestBranch(branchOptions);

      if (!result.success || !result.data) {
        throw new Error(`Failed to create test branch: ${result.error}`);
      }

      const branchInfo = result.data;
      const creationTime = Date.now() - startTime;

      // Update context with branch info
      const context = TestSetupUtils.contextManager.getContext(testName);
      if (context) {
        context.branchInfo = branchInfo;
        context.databaseUrl = branchInfo.connectionString;
      }

      // Add cleanup function
      TestSetupUtils.contextManager.addCleanup(testName, async () => {
        await TestSetupUtils.deleteTestBranch(branchInfo.branchName);
      });

      // Update metrics
      TestSetupUtils.contextManager.updateGlobalMetrics({
        neonMetrics: {
          branchesCreated: 1,
          activeBranches: 1,
        },
        suiteMetrics: {
          branchOperations: 1,
          totalBranchCreationTime: creationTime,
        },
      });

      logger.info('test_utils', `Test branch created successfully`, {
        testName,
        branchName: branchInfo.branchName,
        branchId: branchInfo.branchId,
        creationTime,
      });

      return branchInfo;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('test_utils', 'Failed to create test branch', {
        testName,
        error: errorMessage,
        duration: Date.now() - startTime,
      });

      // Update error metrics
      TestSetupUtils.contextManager.updateGlobalMetrics({
        neonMetrics: {
          branchFailures: 1,
        },
        errorSummary: {
          totalErrors: 1,
          errorsByType: { 'branch-creation': 1 },
        },
      });

      throw error;
    }
  }

  /**
   * Delete test branch
   */
  static async deleteTestBranch(branchName: string): Promise<void> {
    if (!isNeonBranchingEnabled()) {
      return;
    }

    const neonClient = getNeonApiClient();
    const startTime = Date.now();

    try {
      const result = await neonClient.deleteTestBranch(branchName);

      if (!result.success) {
        throw new Error(`Failed to delete test branch: ${result.error}`);
      }

      const deletionTime = Date.now() - startTime;

      // Update metrics
      TestSetupUtils.contextManager.updateGlobalMetrics({
        neonMetrics: {
          branchesDeleted: 1,
          activeBranches: -1,
        },
        suiteMetrics: {
          totalBranchDeletionTime: deletionTime,
        },
      });

      logger.info('test_utils', `Test branch deleted successfully`, {
        branchName,
        deletionTime,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('test_utils', 'Failed to delete test branch', {
        branchName,
        error: errorMessage,
        duration: Date.now() - startTime,
      });

      // Update error metrics
      TestSetupUtils.contextManager.updateGlobalMetrics({
        neonMetrics: {
          branchFailures: 1,
        },
        errorSummary: {
          totalErrors: 1,
          errorsByType: { 'branch-deletion': 1 },
        },
      });

      throw error;
    }
  }

  /**
   * Execute test with automatic cleanup
   */
  static async withTestBranch<T>(
    testName: string,
    fn: (branchInfo: TestBranchInfo) => Promise<T>,
    options?: Partial<BranchCreationOptions>,
  ): Promise<T> {
    const branchInfo = await TestSetupUtils.createTestBranch(testName, options);

    try {
      return await fn(branchInfo);
    } finally {
      await TestSetupUtils.deleteTestBranch(branchInfo.branchName);
    }
  }

  /**
   * Validate test environment before running tests
   */
  static validateEnvironment(): void {
    const validation = validateTestEnvironment();

    if (!validation.isValid) {
      const errorMessage = `Test environment validation failed:\n${validation.errors.join('\n')}`;
      logger.error('test_utils', 'Environment validation failed', {
        errors: validation.errors,
        warnings: validation.warnings,
      });
      throw new Error(errorMessage);
    }

    if (validation.warnings.length > 0) {
      logger.warn('test_utils', 'Environment validation warnings', {
        warnings: validation.warnings,
      });
      console.warn(
        'Test environment warnings:',
        validation.warnings.join('\n'),
      );
    }

    logger.info('test_utils', 'Test environment validated successfully', {
      neonAvailable: validation.neonAvailable,
    });
  }

  /**
   * Export test metrics to file
   */
  static async exportTestMetrics(suiteName: string): Promise<void> {
    try {
      const testData = TestSetupUtils.contextManager.exportTestData();
      const outputDir = process.env.TEST_METRICS_OUTPUT_DIR || './test-results';

      const fs = await import('node:fs/promises');
      const path = await import('node:path');

      await fs.mkdir(outputDir, { recursive: true });

      const fileName = `test-metrics-${suiteName}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      const filePath = path.join(outputDir, fileName);

      await fs.writeFile(filePath, JSON.stringify(testData, null, 2));

      logger.info('test_utils', 'Test metrics exported', {
        suiteName,
        filePath,
        dataSize: JSON.stringify(testData).length,
      });
    } catch (error) {
      logger.error('test_utils', 'Failed to export test metrics', {
        suiteName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get test statistics
   */
  static getTestStatistics() {
    const metrics = TestSetupUtils.contextManager.getGlobalMetrics();
    const neonClient = isNeonBranchingEnabled() ? getNeonApiClient() : null;

    return {
      ...metrics,
      neonClientStats: neonClient
        ? {
            activeBranches: neonClient.getActiveBranches().length,
            performanceMetrics: neonClient.getPerformanceMetrics(),
            recentErrors: neonClient.getErrorSummary(),
          }
        : null,
    };
  }
}

/**
 * Playwright-specific utilities
 */
export class PlaywrightTestUtils {
  /**
   * Setup test with Neon branch for Playwright
   */
  static async setupPlaywrightTest(
    testInfo: TestInfo,
    options?: {
      useNeonBranching?: boolean;
      branchOptions?: Partial<BranchCreationOptions>;
    },
  ): Promise<{
    databaseUrl: string;
    branchInfo?: TestBranchInfo;
    cleanup: () => Promise<void>;
  }> {
    const { useNeonBranching = isNeonBranchingEnabled(), branchOptions = {} } =
      options || {};

    if (!useNeonBranching) {
      return {
        databaseUrl: process.env.POSTGRES_URL || '',
        cleanup: async () => {},
      };
    }

    const testName = `playwright-${testInfo.project.name}-${testInfo.title.replace(/\s+/g, '-').toLowerCase()}`;

    const branchInfo = await TestSetupUtils.createTestBranch(testName, {
      purpose: 'playwright-test',
      tags: ['playwright', 'e2e', testInfo.project.name],
      ...branchOptions,
    });

    return {
      databaseUrl: branchInfo.connectionString,
      branchInfo,
      cleanup: async () => {
        await TestSetupUtils.deleteTestBranch(branchInfo.branchName);
      },
    };
  }
}

// Export utilities
export const testContextManager = TestContextManager.getInstance();
export { TestSetupUtils as testSetup };
export { PlaywrightTestUtils as playwrightUtils };

// Convenience functions
export function setupTestSuite(
  suiteName: string,
  options?: Parameters<typeof TestSetupUtils.setupTestSuite>[1],
) {
  return TestSetupUtils.setupTestSuite(suiteName, options);
}

export function setupTest(
  testName: string,
  testFile: string,
  testSuite: string,
  options?: Parameters<typeof TestSetupUtils.setupTest>[3],
) {
  return TestSetupUtils.setupTest(testName, testFile, testSuite, options);
}

export function withTestBranch<T>(
  testName: string,
  fn: (branchInfo: TestBranchInfo) => Promise<T>,
  options?: Partial<BranchCreationOptions>,
) {
  return TestSetupUtils.withTestBranch(testName, fn, options);
}

export function validateTestEnvironment() {
  return TestSetupUtils.validateEnvironment();
}

export default {
  TestContextManager,
  TestSetupUtils,
  PlaywrightTestUtils,
  testContextManager,
  setupTestSuite,
  setupTest,
  withTestBranch,
  validateTestEnvironment,
};
