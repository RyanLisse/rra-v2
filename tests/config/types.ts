/**
 * Enhanced TypeScript types for test configuration and Neon integration
 */

import type { TestBranchInfo as EnhancedTestBranchInfo } from '@/lib/testing/neon-api-client';

// Test environment configuration
export interface TestEnvironmentConfig {
  // Core configuration
  nodeEnv: 'test' | 'development' | 'production';
  isCI: boolean;
  isNeonEnabled: boolean;

  // Database configuration
  postgresUrl: string;
  postgresPooledUrl?: string;

  // Authentication
  betterAuthSecret: string;
  betterAuthUrl: string;

  // Neon-specific configuration
  neonApiKey?: string;
  neonProjectId?: string;
  neonDatabaseName?: string;
  neonRoleName?: string;

  // Test behavior
  testIsolationMode: 'branch' | 'savepoint' | 'none';
  testBranchReuse: boolean;
  autoCleanupTestData: boolean;

  // Timeouts
  vitestTimeout: number;
  vitestHookTimeout: number;
  vitestTeardownTimeout: number;
  playwrightTimeout: number;
  playwrightExpectTimeout: number;

  // Performance and monitoring
  enableTestMetrics: boolean;
  enableBranchMetrics: boolean;
  enableConsoleCapture: boolean;
  enableRequestLogging: boolean;
  testMetricsOutputDir: string;

  // Logging
  verboseLogging: boolean;
  testLogLevel: 'debug' | 'info' | 'warn' | 'error';

  // Cleanup
  forceCleanupOnExit: boolean;
  preserveTestArtifactsOnFailure: boolean;
  cleanupParallelLimit: number;
}

// Neon-specific test configuration
export interface NeonTestConfig {
  // Connection settings
  apiKey: string;
  projectId: string;
  parentBranchId?: string;
  databaseName: string;
  roleName: string;
  usePooling: boolean;
  dbPassword?: string;

  // Enhanced API configuration
  apiBaseUrl: string;
  rateLimitPerMinute: number;
  burstLimit: number;
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;

  // Branch management
  branchTimeout: number;
  maxConcurrentBranches: number;
  cleanupOnStartup: boolean;
  maxBranchAgeHours: number;
  autoCleanupEnabled: boolean;
  preserveTaggedBranches: boolean;

  // Branch naming and tagging
  branchNamePrefix: string;
  defaultBranchTags: string[];
  preserveTags: string[];

  // Performance and monitoring
  enablePerformanceMetrics: boolean;
  enableOperationLogging: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  metricsRetentionHours: number;
  exportMetricsOnExit: boolean;
}

// Test suite configuration
export interface TestSuiteConfig {
  // Basic info
  name: string;
  type: 'unit' | 'integration' | 'e2e' | 'performance';

  // Timeouts
  testTimeout?: number;
  hookTimeout?: number;
  teardownTimeout?: number;

  // Concurrency
  maxConcurrency?: number;
  sequential?: boolean;
  isolate?: boolean;

  // Neon configuration
  neonConfig?: {
    useEnhancedClient?: boolean;
    branchOptions?: {
      purpose?: string;
      tags?: string[];
      parentBranchId?: string;
      waitForReady?: boolean;
      timeoutMs?: number;
    };
    enableMetrics?: boolean;
    enableIsolation?: boolean;
  };

  // Reporting
  enableMetrics?: boolean;
  reportingOptions?: {
    outputFormat?: ('json' | 'html' | 'junit')[];
    outputDirectory?: string;
    includeScreenshots?: boolean;
    includeConsoleLog?: boolean;
    includeNetworkLog?: boolean;
  };
}

// Test branch information
export interface TestBranchState {
  // Branch details
  branchInfo: EnhancedTestBranchInfo | null;
  isActive: boolean;
  createdAt?: Date;
  lastUsedAt?: Date;

  // Usage statistics
  testCount: number;
  failureCount: number;

  // Metadata
  testSuiteName: string;
  testType: string;
  tags: string[];

  // Performance metrics
  creationTime?: number;
  totalUsageTime?: number;
  avgTestDuration?: number;
}

// Test metrics and monitoring
export interface TestMetrics {
  // Suite-level metrics
  suiteMetrics: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    duration: number;

    // Neon-specific metrics
    branchOperations?: number;
    totalBranchCreationTime?: number;
    totalBranchDeletionTime?: number;
    branchFailures?: number;
  };

  // Performance metrics
  performanceMetrics: {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage?: NodeJS.CpuUsage;
    networkStats?: {
      requestCount: number;
      totalBytes: number;
      avgResponseTime: number;
    };
  };

  // Error tracking
  errorSummary: {
    totalErrors: number;
    errorsByType: Record<string, number>;
    criticalErrors: string[];
  };

  // Neon-specific metrics
  neonMetrics?: {
    activeBranches: number;
    branchesCreated: number;
    branchesDeleted: number;
    apiCallsTotal: number;
    apiCallsSuccess: number;
    apiCallsFailure: number;
    avgApiResponseTime: number;
  };
}

// Test configuration validation
export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  missingVariables: string[];
  recommendations: string[];
}

// Test setup hooks
export interface TestSetupHooks {
  beforeAll?: () => Promise<void> | void;
  afterAll?: () => Promise<void> | void;
  beforeEach?: () => Promise<void> | void;
  afterEach?: () => Promise<void> | void;

  // Neon-specific hooks
  beforeBranchCreation?: (branchName: string) => Promise<void> | void;
  afterBranchCreation?: (
    branchInfo: EnhancedTestBranchInfo,
  ) => Promise<void> | void;
  beforeBranchDeletion?: (branchName: string) => Promise<void> | void;
  afterBranchDeletion?: (branchName: string) => Promise<void> | void;

  // Error handling hooks
  onTestFailure?: (error: Error, testName: string) => Promise<void> | void;
  onBranchFailure?: (error: Error, operation: string) => Promise<void> | void;
}

// Test reporter configuration
export interface TestReporterConfig {
  // Basic reporting
  format: ('console' | 'json' | 'html' | 'junit' | 'custom')[];
  outputDirectory: string;

  // Content options
  includeMetrics: boolean;
  includeConsoleLog: boolean;
  includeScreenshots: boolean;
  includeNetworkLog: boolean;
  includeBranchInfo: boolean;

  // Filtering
  reportFailuresOnly: boolean;
  minimumSeverity?: 'info' | 'warn' | 'error';

  // Custom reporting
  customReporters?: {
    name: string;
    path: string;
    options?: Record<string, any>;
  }[];
}

// Test data management
export interface TestDataConfig {
  // Data sources
  fixtures: {
    directory: string;
    autoLoad: boolean;
    formats: ('json' | 'yaml' | 'csv' | 'sql')[];
  };

  // Data cleanup
  autoCleanup: boolean;
  cleanupStrategy: 'truncate' | 'delete' | 'recreate';
  preserveData: boolean;

  // Seeding
  seedData: boolean;
  seedScript?: string;
  seedOrder?: string[];
}

// Integration with external systems
export interface ExternalIntegrationConfig {
  // CI/CD integration
  ci: {
    provider?: 'github' | 'gitlab' | 'jenkins' | 'other';
    reportingWebhook?: string;
    failureNotifications?: boolean;
  };

  // Monitoring integration
  monitoring: {
    enabled: boolean;
    provider?: 'datadog' | 'newrelic' | 'grafana' | 'custom';
    endpoint?: string;
    apiKey?: string;
  };

  // Error tracking
  errorTracking: {
    enabled: boolean;
    provider?: 'sentry' | 'bugsnag' | 'rollbar' | 'custom';
    dsn?: string;
  };
}

// Complete test configuration
export interface CompleteTestConfig {
  environment: TestEnvironmentConfig;
  neon?: NeonTestConfig;
  suite: TestSuiteConfig;
  reporting: TestReporterConfig;
  data?: TestDataConfig;
  integrations?: ExternalIntegrationConfig;
  hooks?: TestSetupHooks;
}

// Configuration builder utilities
export interface ConfigBuilder {
  fromEnvironment(): CompleteTestConfig;
  validate(config: CompleteTestConfig): ConfigValidationResult;
  merge(
    base: CompleteTestConfig,
    override: Partial<CompleteTestConfig>,
  ): CompleteTestConfig;
  export(config: CompleteTestConfig, format: 'json' | 'yaml'): string;
}

// Test execution context
export interface TestExecutionContext {
  // Test information
  testName: string;
  testFile: string;
  testSuite: string;
  testType: 'unit' | 'integration' | 'e2e' | 'performance';

  // Execution state
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

  // Resources
  branchInfo?: EnhancedTestBranchInfo;
  databaseUrl?: string;
  tempFiles?: string[];

  // Metrics
  metrics?: TestMetrics;
  logs?: Array<{
    level: string;
    message: string;
    timestamp: Date;
    metadata?: Record<string, any>;
  }>;

  // Cleanup functions
  cleanup?: Array<() => Promise<void>>;
}

// Export all types
export type { EnhancedTestBranchInfo };

// Utility type for environment variable mapping
export type EnvironmentVariableMap = {
  [K in keyof TestEnvironmentConfig]: {
    envVar: string;
    defaultValue?: TestEnvironmentConfig[K];
    required?: boolean;
    validator?: (value: string) => boolean;
  };
};

// Type guards
export function isNeonTestConfig(config: any): config is NeonTestConfig {
  return (
    config &&
    typeof config.apiKey === 'string' &&
    typeof config.projectId === 'string'
  );
}

export function isTestBranchState(state: any): state is TestBranchState {
  return (
    state &&
    typeof state.testSuiteName === 'string' &&
    typeof state.isActive === 'boolean'
  );
}

export function isTestExecutionContext(
  context: any,
): context is TestExecutionContext {
  return (
    context &&
    typeof context.testName === 'string' &&
    typeof context.testFile === 'string'
  );
}
