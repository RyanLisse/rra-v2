/**
 * Enhanced test configuration builder with Neon API client integration
 * Provides validation, environment variable mapping, and configuration utilities
 */

import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';
import type {
  CompleteTestConfig,
  TestEnvironmentConfig,
  NeonTestConfig,
  TestSuiteConfig,
  TestReporterConfig,
  ConfigValidationResult,
  EnvironmentVariableMap,
  ConfigBuilder,
} from './types';
import { EnvironmentUtils } from '@/lib/testing/neon-mcp-interface';
import { getNeonLogger } from '@/lib/testing/neon-logger';

const logger = getNeonLogger();

// Environment variable mappings
const ENV_VAR_MAP: EnvironmentVariableMap = {
  nodeEnv: { envVar: 'NODE_ENV', defaultValue: 'test' as const, required: true },
  isCI: { envVar: 'CI', defaultValue: false },
  isNeonEnabled: { envVar: 'USE_NEON_BRANCHING', defaultValue: false },
  
  postgresUrl: { envVar: 'POSTGRES_URL', required: true },
  postgresPooledUrl: { envVar: 'POSTGRES_POOLED_URL', required: false },
  
  betterAuthSecret: { envVar: 'BETTER_AUTH_SECRET', required: true },
  betterAuthUrl: { envVar: 'BETTER_AUTH_URL', defaultValue: 'http://localhost:3000' },
  
  neonApiKey: { envVar: 'NEON_API_KEY', required: false },
  neonProjectId: { envVar: 'NEON_PROJECT_ID', required: false },
  neonDatabaseName: { envVar: 'NEON_DATABASE_NAME', defaultValue: 'neondb' },
  neonRoleName: { envVar: 'NEON_ROLE_NAME', defaultValue: 'neondb_owner' },
  
  testIsolationMode: { envVar: 'TEST_ISOLATION_MODE', defaultValue: 'branch' as const },
  testBranchReuse: { envVar: 'TEST_BRANCH_REUSE', defaultValue: false },
  autoCleanupTestData: { envVar: 'AUTO_CLEANUP_TEST_DATA', defaultValue: true },
  
  vitestTimeout: { envVar: 'VITEST_TIMEOUT', defaultValue: 120000 },
  vitestHookTimeout: { envVar: 'VITEST_HOOK_TIMEOUT', defaultValue: 120000 },
  vitestTeardownTimeout: { envVar: 'VITEST_TEARDOWN_TIMEOUT', defaultValue: 60000 },
  playwrightTimeout: { envVar: 'PLAYWRIGHT_TIMEOUT', defaultValue: 180000 },
  playwrightExpectTimeout: { envVar: 'PLAYWRIGHT_EXPECT_TIMEOUT', defaultValue: 120000 },
  
  enableTestMetrics: { envVar: 'ENABLE_TEST_METRICS', defaultValue: true },
  enableBranchMetrics: { envVar: 'ENABLE_BRANCH_METRICS', defaultValue: true },
  enableConsoleCapture: { envVar: 'ENABLE_CONSOLE_CAPTURE', defaultValue: true },
  enableRequestLogging: { envVar: 'ENABLE_REQUEST_LOGGING', defaultValue: false },
  testMetricsOutputDir: { envVar: 'TEST_METRICS_OUTPUT_DIR', defaultValue: './test-results' },
  
  verboseLogging: { envVar: 'VERBOSE_LOGGING', defaultValue: false },
  testLogLevel: { envVar: 'TEST_LOG_LEVEL', defaultValue: 'info' as const },
  
  forceCleanupOnExit: { envVar: 'FORCE_CLEANUP_ON_EXIT', defaultValue: true },
  preserveTestArtifactsOnFailure: { envVar: 'PRESERVE_TEST_ARTIFACTS_ON_FAILURE', defaultValue: true },
  cleanupParallelLimit: { envVar: 'CLEANUP_PARALLEL_LIMIT', defaultValue: 3 },
};

/**
 * Enhanced configuration builder implementation
 */
export class EnhancedConfigBuilder implements ConfigBuilder {
  private loadedEnvFiles: string[] = [];

  constructor() {
    this.loadEnvironmentFiles();
  }

  /**
   * Load environment files in priority order
   */
  private loadEnvironmentFiles(): void {
    const envFiles = [
      '.env.test.local',
      '.env.test',
      '.env.local',
      '.env'
    ];

    for (const file of envFiles) {
      try {
        const result = loadDotenv({ path: resolve(process.cwd(), file) });
        if (!result.error) {
          this.loadedEnvFiles.push(file);
          logger.debug('config_builder', `Loaded environment file: ${file}`);
        }
      } catch (error) {
        // File doesn't exist, continue
      }
    }

    logger.info('config_builder', 'Environment files loaded', {
      files: this.loadedEnvFiles,
    });
  }

  /**
   * Build configuration from environment variables
   */
  fromEnvironment(): CompleteTestConfig {
    logger.info('config_builder', 'Building configuration from environment');

    const environment = this.buildEnvironmentConfig();
    const neon = this.buildNeonConfig();
    const suite = this.buildSuiteConfig();
    const reporting = this.buildReportingConfig();

    const config: CompleteTestConfig = {
      environment,
      neon: environment.isNeonEnabled ? neon : undefined,
      suite,
      reporting,
    };

    logger.info('config_builder', 'Configuration built successfully', {
      hasNeonConfig: !!config.neon,
      suiteType: config.suite.type,
      environmentValid: this.validateEnvironmentConfig(environment).isValid,
    });

    return config;
  }

  /**
   * Build environment configuration
   */
  private buildEnvironmentConfig(): TestEnvironmentConfig {
    const config: TestEnvironmentConfig = {} as TestEnvironmentConfig;

    for (const [key, mapping] of Object.entries(ENV_VAR_MAP)) {
      const envValue = process.env[mapping.envVar];
      
      if (envValue !== undefined) {
        config[key as keyof TestEnvironmentConfig] = this.parseEnvironmentValue(
          envValue,
          mapping.defaultValue
        );
      } else if (mapping.defaultValue !== undefined) {
        config[key as keyof TestEnvironmentConfig] = mapping.defaultValue;
      } else if (mapping.required) {
        throw new Error(`Required environment variable ${mapping.envVar} is not set`);
      }
    }

    // Special handling for boolean values
    config.isCI = this.parseBoolean(process.env.CI);
    config.isNeonEnabled = this.parseBoolean(process.env.USE_NEON_BRANCHING);
    config.testBranchReuse = this.parseBoolean(process.env.TEST_BRANCH_REUSE);
    config.autoCleanupTestData = this.parseBoolean(process.env.AUTO_CLEANUP_TEST_DATA, true);
    config.enableTestMetrics = this.parseBoolean(process.env.ENABLE_TEST_METRICS, true);
    config.enableBranchMetrics = this.parseBoolean(process.env.ENABLE_BRANCH_METRICS, true);
    config.enableConsoleCapture = this.parseBoolean(process.env.ENABLE_CONSOLE_CAPTURE, true);
    config.enableRequestLogging = this.parseBoolean(process.env.ENABLE_REQUEST_LOGGING);
    config.verboseLogging = this.parseBoolean(process.env.VERBOSE_LOGGING);
    config.forceCleanupOnExit = this.parseBoolean(process.env.FORCE_CLEANUP_ON_EXIT, true);
    config.preserveTestArtifactsOnFailure = this.parseBoolean(process.env.PRESERVE_TEST_ARTIFACTS_ON_FAILURE, true);

    return config;
  }

  /**
   * Build Neon-specific configuration
   */
  private buildNeonConfig(): NeonTestConfig | undefined {
    if (!this.parseBoolean(process.env.USE_NEON_BRANCHING)) {
      return undefined;
    }

    return {
      // Connection settings
      apiKey: process.env.NEON_API_KEY || '',
      projectId: process.env.NEON_PROJECT_ID || '',
      parentBranchId: process.env.NEON_PARENT_BRANCH_ID,
      databaseName: process.env.NEON_DATABASE_NAME || 'neondb',
      roleName: process.env.NEON_ROLE_NAME || 'neondb_owner',
      usePooling: this.parseBoolean(process.env.NEON_USE_POOLING, true),
      dbPassword: process.env.NEON_DB_PASSWORD,
      
      // Enhanced API configuration
      apiBaseUrl: process.env.NEON_API_BASE_URL || 'https://console.neon.tech/api/v2',
      rateLimitPerMinute: parseInt(process.env.NEON_API_RATE_LIMIT_PER_MINUTE || '60'),
      burstLimit: parseInt(process.env.NEON_API_BURST_LIMIT || '10'),
      maxRetries: parseInt(process.env.NEON_API_MAX_RETRIES || '3'),
      baseDelayMs: parseInt(process.env.NEON_API_BASE_DELAY_MS || '1000'),
      maxDelayMs: parseInt(process.env.NEON_API_MAX_DELAY_MS || '10000'),
      
      // Branch management
      branchTimeout: parseInt(process.env.NEON_BRANCH_TIMEOUT || '120000'),
      maxConcurrentBranches: parseInt(process.env.NEON_MAX_CONCURRENT_BRANCHES || '5'),
      cleanupOnStartup: this.parseBoolean(process.env.NEON_CLEANUP_ON_STARTUP, true),
      maxBranchAgeHours: parseInt(process.env.NEON_MAX_BRANCH_AGE_HOURS || '24'),
      autoCleanupEnabled: this.parseBoolean(process.env.NEON_AUTO_CLEANUP_ENABLED, true),
      preserveTaggedBranches: this.parseBoolean(process.env.NEON_PRESERVE_TAGGED_BRANCHES, true),
      
      // Branch naming and tagging
      branchNamePrefix: process.env.NEON_BRANCH_NAME_PREFIX || 'test',
      defaultBranchTags: (process.env.NEON_DEFAULT_BRANCH_TAGS || 'test,automated').split(','),
      preserveTags: (process.env.NEON_PRESERVE_TAGS || 'preserve,keep').split(','),
      
      // Performance and monitoring
      enablePerformanceMetrics: this.parseBoolean(process.env.NEON_ENABLE_PERFORMANCE_METRICS, true),
      enableOperationLogging: this.parseBoolean(process.env.NEON_ENABLE_OPERATION_LOGGING, true),
      logLevel: (process.env.NEON_LOG_LEVEL as any) || 'info',
      metricsRetentionHours: parseInt(process.env.NEON_METRICS_RETENTION_HOURS || '168'),
      exportMetricsOnExit: this.parseBoolean(process.env.NEON_EXPORT_METRICS_ON_EXIT, true),
    };
  }

  /**
   * Build test suite configuration
   */
  private buildSuiteConfig(): TestSuiteConfig {
    return {
      name: process.env.TEST_SUITE_NAME || 'default',
      type: (process.env.TEST_SUITE_TYPE as any) || 'unit',
      
      testTimeout: parseInt(process.env.VITEST_TIMEOUT || '120000'),
      hookTimeout: parseInt(process.env.VITEST_HOOK_TIMEOUT || '120000'),
      teardownTimeout: parseInt(process.env.VITEST_TEARDOWN_TIMEOUT || '60000'),
      
      maxConcurrency: parseInt(process.env.VITEST_POOL_THREADS_MAX || '4'),
      sequential: !this.parseBoolean(process.env.VITEST_SEQUENCE_CONCURRENT, true),
      isolate: this.parseBoolean(process.env.VITEST_ISOLATE, false),
      
      neonConfig: this.parseBoolean(process.env.USE_NEON_BRANCHING) ? {
        useEnhancedClient: true,
        enableMetrics: this.parseBoolean(process.env.ENABLE_BRANCH_METRICS, true),
        enableIsolation: this.parseBoolean(process.env.TEST_ISOLATION_MODE !== 'none', true),
        branchOptions: {
          purpose: 'test-suite',
          tags: (process.env.NEON_DEFAULT_BRANCH_TAGS || 'test,automated').split(','),
          waitForReady: true,
          timeoutMs: parseInt(process.env.NEON_BRANCH_TIMEOUT || '120000'),
        },
      } : undefined,
      
      enableMetrics: this.parseBoolean(process.env.ENABLE_TEST_METRICS, true),
      reportingOptions: {
        outputFormat: this.parseStringArray(process.env.TEST_REPORT_FORMATS, ['json']),
        outputDirectory: process.env.TEST_METRICS_OUTPUT_DIR || './test-results',
        includeScreenshots: this.parseBoolean(process.env.PRESERVE_TEST_ARTIFACTS_ON_FAILURE, true),
        includeConsoleLog: this.parseBoolean(process.env.ENABLE_CONSOLE_CAPTURE, true),
        includeNetworkLog: this.parseBoolean(process.env.ENABLE_REQUEST_LOGGING, false),
      },
    };
  }

  /**
   * Build reporting configuration
   */
  private buildReportingConfig(): TestReporterConfig {
    return {
      format: this.parseStringArray(process.env.TEST_REPORT_FORMATS, ['console', 'json']),
      outputDirectory: process.env.TEST_METRICS_OUTPUT_DIR || './test-results',
      
      includeMetrics: this.parseBoolean(process.env.ENABLE_TEST_METRICS, true),
      includeConsoleLog: this.parseBoolean(process.env.ENABLE_CONSOLE_CAPTURE, true),
      includeScreenshots: this.parseBoolean(process.env.PRESERVE_TEST_ARTIFACTS_ON_FAILURE, true),
      includeNetworkLog: this.parseBoolean(process.env.ENABLE_REQUEST_LOGGING, false),
      includeBranchInfo: this.parseBoolean(process.env.ENABLE_BRANCH_METRICS, true),
      
      reportFailuresOnly: this.parseBoolean(process.env.REPORT_FAILURES_ONLY, false),
      minimumSeverity: (process.env.MINIMUM_REPORT_SEVERITY as any) || 'info',
    };
  }

  /**
   * Validate complete configuration
   */
  validate(config: CompleteTestConfig): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const missingVariables: string[] = [];
    const recommendations: string[] = [];

    // Validate environment configuration
    const envValidation = this.validateEnvironmentConfig(config.environment);
    errors.push(...envValidation.errors);
    warnings.push(...envValidation.warnings);
    missingVariables.push(...envValidation.missingVariables);

    // Validate Neon configuration if enabled
    if (config.environment.isNeonEnabled && config.neon) {
      const neonValidation = this.validateNeonConfig(config.neon);
      errors.push(...neonValidation.errors);
      warnings.push(...neonValidation.warnings);
      missingVariables.push(...neonValidation.missingVariables);
    } else if (config.environment.isNeonEnabled && !config.neon) {
      errors.push('Neon branching is enabled but Neon configuration is missing');
    }

    // Validate test suite configuration
    const suiteValidation = this.validateSuiteConfig(config.suite);
    warnings.push(...suiteValidation.warnings);
    recommendations.push(...suiteValidation.recommendations);

    // Add recommendations
    if (config.environment.isNeonEnabled && !config.environment.enableBranchMetrics) {
      recommendations.push('Consider enabling branch metrics for better monitoring');
    }

    if (!config.environment.enableTestMetrics) {
      recommendations.push('Consider enabling test metrics for performance insights');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      missingVariables,
      recommendations,
    };
  }

  /**
   * Validate environment configuration
   */
  private validateEnvironmentConfig(config: TestEnvironmentConfig): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const missingVariables: string[] = [];

    // Check required fields
    if (!config.postgresUrl) {
      errors.push('Database URL is required');
      missingVariables.push('POSTGRES_URL');
    }

    if (!config.betterAuthSecret) {
      errors.push('Authentication secret is required');
      missingVariables.push('BETTER_AUTH_SECRET');
    }

    // Validate timeout values
    if (config.vitestTimeout < 30000) {
      warnings.push('Vitest timeout is very low, consider increasing for Neon operations');
    }

    if (config.playwrightTimeout < 60000) {
      warnings.push('Playwright timeout is low, consider increasing for E2E tests');
    }

    // Check Neon requirements
    if (config.isNeonEnabled) {
      if (!config.neonApiKey) {
        errors.push('Neon API key is required when Neon branching is enabled');
        missingVariables.push('NEON_API_KEY');
      }
      if (!config.neonProjectId) {
        errors.push('Neon project ID is required when Neon branching is enabled');
        missingVariables.push('NEON_PROJECT_ID');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      missingVariables,
      recommendations: [],
    };
  }

  /**
   * Validate Neon configuration
   */
  private validateNeonConfig(config: NeonTestConfig): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const missingVariables: string[] = [];

    if (!config.apiKey) {
      errors.push('Neon API key is required');
      missingVariables.push('NEON_API_KEY');
    }

    if (!config.projectId) {
      errors.push('Neon project ID is required');
      missingVariables.push('NEON_PROJECT_ID');
    }

    if (config.rateLimitPerMinute > 100) {
      warnings.push('High rate limit may trigger Neon API throttling');
    }

    if (config.maxConcurrentBranches > 10) {
      warnings.push('High concurrent branch limit may cause performance issues');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      missingVariables,
      recommendations: [],
    };
  }

  /**
   * Validate suite configuration
   */
  private validateSuiteConfig(config: TestSuiteConfig): {
    warnings: string[];
    recommendations: string[];
  } {
    const warnings: string[] = [];
    const recommendations: string[] = [];

    if (config.maxConcurrency && config.maxConcurrency > 8) {
      warnings.push('High concurrency may overwhelm system resources');
    }

    if (!config.enableMetrics) {
      recommendations.push('Enable metrics for better test insights');
    }

    return { warnings, recommendations };
  }

  /**
   * Merge configurations with override precedence
   */
  merge(base: CompleteTestConfig, override: Partial<CompleteTestConfig>): CompleteTestConfig {
    return {
      environment: { ...base.environment, ...override.environment },
      neon: override.neon ? { ...base.neon, ...override.neon } : base.neon,
      suite: { ...base.suite, ...override.suite },
      reporting: { ...base.reporting, ...override.reporting },
      data: override.data ? { ...base.data, ...override.data } : base.data,
      integrations: override.integrations ? { ...base.integrations, ...override.integrations } : base.integrations,
      hooks: override.hooks ? { ...base.hooks, ...override.hooks } : base.hooks,
    };
  }

  /**
   * Export configuration to string format
   */
  export(config: CompleteTestConfig, format: 'json' | 'yaml'): string {
    if (format === 'json') {
      return JSON.stringify(config, null, 2);
    } else {
      // Simple YAML export (would need yaml library for full support)
      return JSON.stringify(config, null, 2).replace(/"/g, '').replace(/,/g, '');
    }
  }

  /**
   * Utility methods for parsing environment values
   */
  private parseEnvironmentValue(value: string, defaultValue: any): any {
    if (typeof defaultValue === 'boolean') {
      return this.parseBoolean(value, defaultValue);
    } else if (typeof defaultValue === 'number') {
      return parseInt(value) || defaultValue;
    } else {
      return value || defaultValue;
    }
  }

  private parseBoolean(value: string | undefined, defaultValue: boolean = false): boolean {
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true' || value === '1';
  }

  private parseStringArray(value: string | undefined, defaultValue: string[] = []): string[] {
    if (!value) return defaultValue;
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }
}

// Create singleton instance
export const configBuilder = new EnhancedConfigBuilder();

// Convenience functions
export function getTestConfig(): CompleteTestConfig {
  return configBuilder.fromEnvironment();
}

export function validateTestConfig(config?: CompleteTestConfig): ConfigValidationResult {
  const testConfig = config || getTestConfig();
  return configBuilder.validate(testConfig);
}

export function isConfigValid(): boolean {
  const validation = validateTestConfig();
  return validation.isValid;
}

// Environment validation
export function validateTestEnvironment(): {
  isValid: boolean;
  neonAvailable: boolean;
  errors: string[];
  warnings: string[];
} {
  const config = getTestConfig();
  const validation = validateTestConfig(config);
  
  // Additional Neon-specific validation
  let neonAvailable = false;
  if (config.environment.isNeonEnabled && config.neon) {
    try {
      const envCheck = EnvironmentUtils.validateEnvironment();
      neonAvailable = envCheck.valid;
      if (!envCheck.valid) {
        validation.warnings.push(`Neon environment incomplete: ${envCheck.missing.join(', ')}`);
      }
    } catch (error) {
      validation.warnings.push('Failed to validate Neon environment');
    }
  }

  return {
    isValid: validation.isValid,
    neonAvailable,
    errors: validation.errors,
    warnings: validation.warnings,
  };
}

export { EnhancedConfigBuilder };
export default configBuilder;