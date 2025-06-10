import { randomUUID } from 'node:crypto';
import { NeonMCPInterface, EnvironmentUtils } from './neon-mcp-interface';
import {
  type NeonLogger,
  getNeonLogger,
  type PerformanceMetrics,
} from './neon-logger';

/**
 * Enhanced Neon API Client using MCP tools
 * Provides robust database branching, project management, and connection utilities
 */

// Core types for Neon operations
export interface NeonProject {
  id: string;
  name: string;
  platform_id: string;
  region_id: string;
  pg_version: number;
  proxy_host: string;
  created_at: string;
  updated_at: string;
  owner_id: string;
  settings: {
    allowed_ips: {
      ips: string[];
      protected_branches_only: boolean;
    };
    enable_logical_replication: boolean;
    maintenance_window: {
      weekdays: number[];
      start_time: string;
      end_time: string;
    };
    block_public_connections: boolean;
    block_vpc_connections: boolean;
    hipaa: boolean;
  };
}

export interface NeonBranch {
  id: string;
  project_id: string;
  name: string;
  current_state: 'ready' | 'creating' | 'deleting' | 'init' | 'updating';
  state_changed_at: string;
  logical_size: number;
  creation_source: string;
  primary: boolean;
  default: boolean;
  protected: boolean;
  cpu_used_sec: number;
  compute_time_seconds: number;
  active_time_seconds: number;
  written_data_bytes: number;
  data_transfer_bytes: number;
  created_at: string;
  updated_at: string;
  created_by?: {
    name: string;
    image?: string;
  };
  init_source?: string;
}

export interface TestBranchInfo {
  branchId: string;
  branchName: string;
  connectionString: string;
  projectId: string;
  database: string;
  role: string;
  host: string;
  created_at: string;
  metadata: {
    testSuite: string;
    purpose: string;
    createdBy: string;
    tags: string[];
  };
}

export interface NeonApiClientConfig {
  defaultProjectId?: string;
  defaultDatabase?: string;
  defaultRole?: string;
  rateLimitConfig?: {
    maxRequestsPerMinute: number;
    burstLimit: number;
  };
  retryConfig?: {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
  };
  cleanupConfig?: {
    maxBranchAgeHours: number;
    autoCleanupEnabled: boolean;
    preserveTaggedBranches: boolean;
  };
}

export interface DatabaseOperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata: {
    operation: string;
    timestamp: string;
    duration_ms: number;
    project_id?: string;
    branch_id?: string;
  };
}

export interface BranchCreationOptions {
  testSuite: string;
  purpose?: string;
  tags?: string[];
  database?: string;
  role?: string;
  parentBranchId?: string;
  waitForReady?: boolean;
  timeoutMs?: number;
}

export interface CleanupFilters {
  maxAgeHours?: number;
  namePattern?: RegExp;
  excludeTags?: string[];
  includeTags?: string[];
  preservePrimary?: boolean;
  dryRun?: boolean;
}

/**
 * Rate limiter for API calls
 */
class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly burstLimit: number;

  constructor(maxRequestsPerMinute = 100, burstLimit = 10) {
    this.maxRequests = maxRequestsPerMinute;
    this.windowMs = 60 * 1000; // 1 minute
    this.burstLimit = burstLimit;
  }

  async checkLimit(): Promise<void> {
    const now = Date.now();

    // Remove old requests outside the window
    this.requests = this.requests.filter((time) => now - time < this.windowMs);

    // Check burst limit (last 10 seconds)
    const recentRequests = this.requests.filter((time) => now - time < 10000);
    if (recentRequests.length >= this.burstLimit) {
      const waitTime = 10000 - (now - recentRequests[0]);
      if (waitTime > 0) {
        await this.delay(waitTime);
      }
    }

    // Check rate limit
    if (this.requests.length >= this.maxRequests) {
      const waitTime = this.windowMs - (now - this.requests[0]);
      if (waitTime > 0) {
        await this.delay(waitTime);
      }
    }

    this.requests.push(now);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Retry utility with exponential backoff
 */
class RetryManager {
  constructor(
    private maxRetries = 3,
    private baseDelayMs = 1000,
    private maxDelayMs = 10000,
  ) {}

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: string,
  ): Promise<T> {
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === this.maxRetries) {
          break;
        }

        const delay = Math.min(
          this.baseDelayMs * Math.pow(2, attempt),
          this.maxDelayMs,
        );

        console.warn(
          `${context} failed (attempt ${attempt + 1}/${this.maxRetries + 1}), retrying in ${delay}ms:`,
          error,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error(
      `${context} failed after ${this.maxRetries + 1} attempts. Last error: ${lastError.message}`,
    );
  }
}

/**
 * Enhanced Neon API Client with MCP tool integration
 */
export class EnhancedNeonApiClient {
  public readonly config: Required<NeonApiClientConfig>;
  private readonly rateLimiter: RateLimiter;
  private readonly retryManager: RetryManager;
  private readonly logger: NeonLogger;
  private readonly activeBranches = new Map<string, TestBranchInfo>();
  private readonly operationLog: DatabaseOperationResult[] = [];

  constructor(config: NeonApiClientConfig = {}) {
    // Validate environment
    const envCheck = EnvironmentUtils.validateEnvironment();
    if (!envCheck.valid) {
      console.warn(
        `Missing required environment variables: ${envCheck.missing.join(', ')}`,
      );
    }

    this.config = {
      defaultProjectId:
        config.defaultProjectId ||
        process.env.NEON_PROJECT_ID ||
        'yellow-tooth-01830141',
      defaultDatabase: config.defaultDatabase || 'neondb',
      defaultRole: config.defaultRole || 'neondb_owner',
      rateLimitConfig: {
        maxRequestsPerMinute: 60,
        burstLimit: 10,
        ...config.rateLimitConfig,
      },
      retryConfig: {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 10000,
        ...config.retryConfig,
      },
      cleanupConfig: {
        maxBranchAgeHours: 24,
        autoCleanupEnabled: true,
        preserveTaggedBranches: true,
        ...config.cleanupConfig,
      },
    };

    this.rateLimiter = new RateLimiter(
      this.config.rateLimitConfig.maxRequestsPerMinute,
      this.config.rateLimitConfig.burstLimit,
    );

    this.retryManager = new RetryManager(
      this.config.retryConfig.maxRetries,
      this.config.retryConfig.baseDelayMs,
      this.config.retryConfig.maxDelayMs,
    );

    this.logger = getNeonLogger();
    this.logger.info('client_init', 'Enhanced Neon API Client initialized', {
      projectId: this.config.defaultProjectId,
      database: this.config.defaultDatabase,
      environment: EnvironmentUtils.getEnvironmentConfig(),
    });
  }

  /**
   * List all available Neon projects
   */
  async listProjects(): Promise<DatabaseOperationResult<NeonProject[]>> {
    return this.executeOperation('list_projects', async () => {
      await this.rateLimiter.checkLimit();

      const result = await this.retryManager.executeWithRetry(async () => {
        // Check environment
        const env = EnvironmentUtils.getEnvironmentConfig();
        if (env.isBrowser) {
          throw new Error('Neon operations not available on client side');
        }

        // Use MCP interface
        const response = await NeonMCPInterface.listProjects();
        // Transform MCPNeonProject to NeonProject with default settings
        return response.projects.map((project) => ({
          ...project,
          settings: {
            allowed_ips: {
              ips: [],
              protected_branches_only: false,
            },
            enable_logical_replication: false,
            maintenance_window: {
              weekdays: [0],
              start_time: '00:00',
              end_time: '04:00',
            },
            block_public_connections: false,
            block_vpc_connections: false,
            hipaa: false,
          },
        }));
      }, 'List projects');

      return result;
    });
  }

  /**
   * Get detailed information about a specific project
   */
  async getProject(
    projectId?: string,
  ): Promise<DatabaseOperationResult<NeonProject>> {
    const id = projectId || this.config.defaultProjectId;

    return this.executeOperation(
      'get_project',
      async () => {
        await this.rateLimiter.checkLimit();

        const result = await this.retryManager.executeWithRetry(async () => {
          // Use MCP interface
          const response = await NeonMCPInterface.describeProject(id);
          return response;
        }, `Get project ${id}`);

        return result;
      },
      { project_id: id },
    );
  }

  /**
   * Create a new test branch with enhanced options
   */
  async createTestBranch(
    options: BranchCreationOptions,
  ): Promise<DatabaseOperationResult<TestBranchInfo>> {
    const {
      testSuite,
      purpose = 'testing',
      tags = [],
      database = this.config.defaultDatabase,
      role = this.config.defaultRole,
      parentBranchId,
      waitForReady = true,
      timeoutMs = 120000,
    } = options;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const branchName = `test-${testSuite}-${timestamp}-${randomUUID().slice(0, 8)}`;

    let createdBranchId: string | undefined;

    const operationResult = await this.executeOperation(
      'create_test_branch',
      async () => {
        await this.rateLimiter.checkLimit();

        const result = await this.retryManager.executeWithRetry(async () => {
          // Create branch using MCP interface
          const createResponse = await NeonMCPInterface.createBranch(
            this.config.defaultProjectId,
            branchName,
          );

          const branchId = createResponse.branch.id;
          createdBranchId = branchId;

          // Wait for branch to be ready if requested
          if (waitForReady) {
            await this.waitForBranchReady(branchId, timeoutMs);
          }

          // Get connection string using MCP interface
          const connectionResponse = await NeonMCPInterface.getConnectionString(
            this.config.defaultProjectId,
            branchId,
            database,
            role,
          );

          const branchInfo: TestBranchInfo = {
            branchId,
            branchName,
            connectionString: connectionResponse.connection_string,
            projectId: this.config.defaultProjectId,
            database,
            role,
            host: this.extractHostFromConnectionString(
              connectionResponse.connection_string,
            ),
            created_at: new Date().toISOString(),
            metadata: {
              testSuite,
              purpose,
              createdBy: process.env.USER || 'unknown',
              tags: [...tags, 'test', 'automated'],
            },
          };

          // Store in active branches
          this.activeBranches.set(branchName, branchInfo);

          return branchInfo;
        }, `Create test branch ${branchName}`);

        return result;
      },
      { branch_id: createdBranchId },
    );

    return operationResult;
  }

  /**
   * Delete a test branch by name or ID
   */
  async deleteTestBranch(
    branchNameOrId: string,
  ): Promise<DatabaseOperationResult<void>> {
    const branchInfo = this.activeBranches.get(branchNameOrId);
    const branchId = branchInfo?.branchId || branchNameOrId;

    return this.executeOperation(
      'delete_test_branch',
      async () => {
        await this.rateLimiter.checkLimit();

        await this.retryManager.executeWithRetry(async () => {
          // Delete branch using MCP interface
          await NeonMCPInterface.deleteBranch(
            this.config.defaultProjectId,
            branchId,
          );
        }, `Delete test branch ${branchNameOrId}`);

        // Remove from active branches
        if (branchInfo) {
          this.activeBranches.delete(branchInfo.branchName);
        }

        return undefined;
      },
      { branch_id: branchId },
    );
  }

  /**
   * List all branches in a project
   */
  async listBranches(
    projectId?: string,
  ): Promise<DatabaseOperationResult<NeonBranch[]>> {
    const id = projectId || this.config.defaultProjectId;

    return this.executeOperation(
      'list_branches',
      async () => {
        await this.rateLimiter.checkLimit();

        const result = await this.retryManager.executeWithRetry(async () => {
          // Use MCP interface
          const response = await NeonMCPInterface.describeProject(id);
          return response.branches || [];
        }, `List branches for project ${id}`);

        return result;
      },
      { project_id: id },
    );
  }

  /**
   * Execute SQL on a specific branch
   */
  async executeSql(
    sql: string,
    branchId?: string,
    database?: string,
  ): Promise<DatabaseOperationResult<any>> {
    return this.executeOperation(
      'execute_sql',
      async () => {
        await this.rateLimiter.checkLimit();

        const result = await this.retryManager.executeWithRetry(
          async () => {
            // Use MCP interface
            const response = await NeonMCPInterface.runSql(
              this.config.defaultProjectId,
              sql,
              branchId,
              database || this.config.defaultDatabase,
            );
            return response;
          },
          `Execute SQL on branch ${branchId || 'default'}`,
        );

        return result;
      },
      { project_id: this.config.defaultProjectId, branch_id: branchId },
    );
  }

  /**
   * Execute SQL transaction on a specific branch
   */
  async executeTransaction(
    sqlStatements: string[],
    branchId?: string,
    database?: string,
  ): Promise<DatabaseOperationResult<any>> {
    return this.executeOperation(
      'execute_transaction',
      async () => {
        await this.rateLimiter.checkLimit();

        const result = await this.retryManager.executeWithRetry(
          async () => {
            // Use MCP interface
            const response = await NeonMCPInterface.runSqlTransaction(
              this.config.defaultProjectId,
              sqlStatements,
              branchId,
              database || this.config.defaultDatabase,
            );
            return response;
          },
          `Execute transaction on branch ${branchId || 'default'}`,
        );

        return result;
      },
      { project_id: this.config.defaultProjectId, branch_id: branchId },
    );
  }

  /**
   * Get connection string for a branch
   */
  async getConnectionString(
    branchId?: string,
    database?: string,
    role?: string,
  ): Promise<DatabaseOperationResult<string>> {
    return this.executeOperation(
      'get_connection_string',
      async () => {
        await this.rateLimiter.checkLimit();

        const result = await this.retryManager.executeWithRetry(
          async () => {
            // Use MCP interface
            const response = await NeonMCPInterface.getConnectionString(
              this.config.defaultProjectId,
              branchId,
              database || this.config.defaultDatabase,
              role || this.config.defaultRole,
            );
            return response.connection_string;
          },
          `Get connection string for branch ${branchId || 'default'}`,
        );

        return result;
      },
      { project_id: this.config.defaultProjectId, branch_id: branchId },
    );
  }

  /**
   * Cleanup old test branches based on filters
   */
  async cleanupTestBranches(filters: CleanupFilters = {}): Promise<
    DatabaseOperationResult<{
      deleted: string[];
      failed: string[];
      skipped: string[];
    }>
  > {
    const {
      maxAgeHours = this.config.cleanupConfig.maxBranchAgeHours,
      namePattern = /^test-/,
      excludeTags = [],
      includeTags = [],
      preservePrimary = true,
      dryRun = false,
    } = filters;

    return this.executeOperation('cleanup_test_branches', async () => {
      const branchesResult = await this.listBranches();
      if (!branchesResult.success || !branchesResult.data) {
        throw new Error('Failed to list branches for cleanup');
      }

      const branches = branchesResult.data;
      const now = new Date();
      const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

      const deleted: string[] = [];
      const failed: string[] = [];
      const skipped: string[] = [];

      for (const branch of branches) {
        // Skip primary branches if preservePrimary is true
        if (preservePrimary && branch.primary) {
          skipped.push(`${branch.name} (primary)`);
          continue;
        }

        // Check name pattern
        if (!namePattern.test(branch.name)) {
          skipped.push(`${branch.name} (name pattern)`);
          continue;
        }

        // Check age
        const createdAt = new Date(branch.created_at);
        if (now.getTime() - createdAt.getTime() < maxAgeMs) {
          skipped.push(`${branch.name} (too recent)`);
          continue;
        }

        // Check tags (if branch info is available)
        const branchInfo = this.activeBranches.get(branch.name);
        if (branchInfo && this.config.cleanupConfig.preserveTaggedBranches) {
          const hasExcludedTags = excludeTags.some((tag) =>
            branchInfo.metadata.tags.includes(tag),
          );
          const hasRequiredTags =
            includeTags.length === 0 ||
            includeTags.some((tag) => branchInfo.metadata.tags.includes(tag));

          if (hasExcludedTags || !hasRequiredTags) {
            skipped.push(`${branch.name} (tags)`);
            continue;
          }
        }

        if (dryRun) {
          skipped.push(`${branch.name} (dry run)`);
          continue;
        }

        // Attempt deletion
        try {
          await this.deleteTestBranch(branch.id);
          deleted.push(branch.name);
        } catch (error) {
          console.error(`Failed to delete branch ${branch.name}:`, error);
          failed.push(branch.name);
        }
      }

      return { deleted, failed, skipped };
    });
  }

  /**
   * Get statistics about branches and usage
   */
  async getBranchStatistics(projectId?: string): Promise<
    DatabaseOperationResult<{
      total_branches: number;
      test_branches: number;
      active_branches: number;
      total_size_bytes: number;
      oldest_test_branch?: string;
      newest_test_branch?: string;
    }>
  > {
    const id = projectId || this.config.defaultProjectId;

    return this.executeOperation(
      'get_branch_statistics',
      async () => {
        const branchesResult = await this.listBranches(id);
        if (!branchesResult.success || !branchesResult.data) {
          throw new Error('Failed to list branches for statistics');
        }

        const branches = branchesResult.data;
        const testBranches = branches.filter((b) => b.name.startsWith('test-'));
        const activeBranches = branches.filter(
          (b) => b.current_state === 'ready',
        );

        let oldestTestBranch: string | undefined;
        let newestTestBranch: string | undefined;

        if (testBranches.length > 0) {
          const sorted = [...testBranches].sort(
            (a, b) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime(),
          );
          oldestTestBranch = sorted[0].name;
          newestTestBranch = sorted[sorted.length - 1].name;
        }

        return {
          total_branches: branches.length,
          test_branches: testBranches.length,
          active_branches: activeBranches.length,
          total_size_bytes: branches.reduce(
            (sum, b) => sum + (b.logical_size || 0),
            0,
          ),
          oldest_test_branch: oldestTestBranch,
          newest_test_branch: newestTestBranch,
        };
      },
      { project_id: id },
    );
  }

  /**
   * Get operation logs for monitoring and debugging
   */
  getOperationLogs(limit?: number): DatabaseOperationResult[] {
    return limit ? this.operationLog.slice(-limit) : [...this.operationLog];
  }

  /**
   * Get performance metrics from the logger
   */
  getPerformanceMetrics(operation?: string): PerformanceMetrics[] {
    return this.logger.getMetrics(operation);
  }

  /**
   * Get error summary from the logger
   */
  getErrorSummary(since?: Date) {
    return this.logger.getErrorSummary(since);
  }

  /**
   * Get recent logs from the logger
   */
  getRecentLogs(limit?: number, level?: 'debug' | 'info' | 'warn' | 'error') {
    return this.logger.getLogs(limit, level);
  }

  /**
   * Export monitoring data for external analysis
   */
  exportMonitoringData() {
    return {
      ...this.logger.export(),
      operationLogs: this.operationLog,
      activeBranches: Array.from(this.activeBranches.values()),
      config: {
        defaultProjectId: this.config.defaultProjectId,
        defaultDatabase: this.config.defaultDatabase,
        defaultRole: this.config.defaultRole,
      },
    };
  }

  /**
   * Get active branches managed by this client
   */
  getActiveBranches(): TestBranchInfo[] {
    return Array.from(this.activeBranches.values());
  }

  /**
   * Cleanup all active branches (useful for teardown)
   */
  async cleanupAllActiveBranches(): Promise<void> {
    const branches = Array.from(this.activeBranches.keys());
    const deletePromises = branches.map((branchName) =>
      this.deleteTestBranch(branchName).catch((error) =>
        console.error(`Failed to cleanup branch ${branchName}:`, error),
      ),
    );

    await Promise.allSettled(deletePromises);
    this.activeBranches.clear();
  }

  /**
   * Utility function for test execution with automatic cleanup
   */
  async withTestBranch<T>(
    options: BranchCreationOptions,
    fn: (branchInfo: TestBranchInfo) => Promise<T>,
  ): Promise<T> {
    const createResult = await this.createTestBranch(options);

    if (!createResult.success || !createResult.data) {
      throw new Error(`Failed to create test branch: ${createResult.error}`);
    }

    const branchInfo = createResult.data;

    try {
      return await fn(branchInfo);
    } finally {
      await this.deleteTestBranch(branchInfo.branchName).catch((error) =>
        console.error(
          `Failed to cleanup test branch ${branchInfo.branchName}:`,
          error,
        ),
      );
    }
  }

  /**
   * Wait for a branch to be in ready state
   */
  private async waitForBranchReady(
    branchId: string,
    timeoutMs = 60000,
  ): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds

    while (Date.now() - startTime < timeoutMs) {
      try {
        const branchesResult = await this.listBranches();
        if (branchesResult.success && branchesResult.data) {
          const branch = branchesResult.data.find((b) => b.id === branchId);
          if (branch && branch.current_state === 'ready') {
            return;
          }
        }
      } catch (error) {
        // Ignore polling errors
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(
      `Branch ${branchId} did not become ready within ${timeoutMs}ms`,
    );
  }

  /**
   * Extract host from connection string
   */
  private extractHostFromConnectionString(connectionString: string): string {
    try {
      const url = new URL(connectionString);
      return url.hostname;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Execute operation with logging and error handling
   */
  private async executeOperation<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata: Record<string, any> = {},
  ): Promise<DatabaseOperationResult<T>> {
    const operationId = this.logger.startOperation(
      operation,
      `Executing ${operation}`,
      metadata,
    );
    const startTime = Date.now();

    try {
      const data = await fn();
      const duration = Date.now() - startTime;

      // Log success
      this.logger.completeOperation(
        operationId,
        operation,
        true,
        duration,
        'Operation completed successfully',
        {
          ...metadata,
          dataSize:
            typeof data === 'object'
              ? JSON.stringify(data).length
              : String(data).length,
        },
      );

      const result: DatabaseOperationResult<T> = {
        success: true,
        data,
        metadata: {
          operation,
          timestamp: new Date().toISOString(),
          duration_ms: duration,
          ...metadata,
        },
      };

      this.operationLog.push(result);

      // Keep only last 1000 operations
      if (this.operationLog.length > 1000) {
        this.operationLog.splice(0, this.operationLog.length - 1000);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Log error
      this.logger.completeOperation(
        operationId,
        operation,
        false,
        duration,
        errorMessage,
        {
          ...metadata,
          errorType:
            error instanceof Error ? error.constructor.name : 'Unknown',
        },
      );

      const result: DatabaseOperationResult<T> = {
        success: false,
        error: errorMessage,
        metadata: {
          operation,
          timestamp: new Date().toISOString(),
          duration_ms: duration,
          ...metadata,
        },
      };

      this.operationLog.push(result);

      // Keep only last 1000 operations
      if (this.operationLog.length > 1000) {
        this.operationLog.splice(0, this.operationLog.length - 1000);
      }

      return result;
    }
  }
}

/**
 * Singleton instance for global use
 */
let globalNeonClient: EnhancedNeonApiClient | null = null;

/**
 * Get or create the global Neon API client instance
 */
export function getNeonApiClient(
  config?: NeonApiClientConfig,
): EnhancedNeonApiClient {
  if (!globalNeonClient) {
    globalNeonClient = new EnhancedNeonApiClient(config);
  }
  return globalNeonClient;
}

/**
 * Reset the global client instance (useful for testing)
 */
export function resetNeonApiClient(): void {
  globalNeonClient = null;
}
