import { randomUUID } from 'crypto';

/**
 * Neon API types for database branching operations
 */
interface NeonBranch {
  id: string;
  project_id: string;
  parent_id?: string;
  parent_lsn?: string;
  name: string;
  current_state: 'ready' | 'creating' | 'deleting';
  logical_size?: number;
  created_at: string;
  updated_at: string;
  primary: boolean;
}

interface NeonDatabase {
  id: number;
  branch_id: string;
  name: string;
  owner_name: string;
  created_at: string;
  updated_at: string;
}

interface NeonEndpoint {
  id: string;
  project_id: string;
  branch_id: string;
  host: string;
  region_id: string;
  type: 'read_write' | 'read_only';
  current_state: 'active' | 'idle' | 'stopped';
  created_at: string;
  updated_at: string;
}

interface CreateBranchResponse {
  branch: NeonBranch;
  endpoints: NeonEndpoint[];
  operations: Array<{
    id: string;
    project_id: string;
    branch_id: string;
    action: string;
    status: string;
  }>;
  connection_uris: Array<{
    connection_uri: string;
    connection_parameters: {
      database: string;
      role: string;
      host: string;
      pooler_host: string;
    };
  }>;
}

export interface NeonTestBranchConfig {
  apiKey: string;
  projectId: string;
  parentBranchId?: string;
  databaseName?: string;
  roleName?: string;
  pooled?: boolean;
}

export interface TestBranchInfo {
  branchId: string;
  branchName: string;
  connectionString: string;
  pooledConnectionString?: string;
  host: string;
  database: string;
  role: string;
}

/**
 * Manages Neon database branches for testing
 */
export class NeonTestBranchManager {
  private readonly apiKey: string;
  private readonly projectId: string;
  private readonly apiBaseUrl = 'https://console.neon.tech/api/v2';
  private readonly branches: Map<string, TestBranchInfo> = new Map();

  constructor(config: NeonTestBranchConfig) {
    this.apiKey = config.apiKey;
    this.projectId = config.projectId;
  }

  /**
   * Creates a new test branch from the parent branch
   */
  async createTestBranch(
    testSuiteName: string,
    options?: {
      parentBranchId?: string;
      databaseName?: string;
      roleName?: string;
      pooled?: boolean;
    }
  ): Promise<TestBranchInfo> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const branchName = `test-${testSuiteName}-${timestamp}-${randomUUID().slice(0, 8)}`;

    try {
      // Create the branch
      const response = await fetch(
        `${this.apiBaseUrl}/projects/${this.projectId}/branches`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            branch: {
              name: branchName,
              parent_id: options?.parentBranchId,
            },
            endpoints: [
              {
                type: 'read_write',
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to create test branch: ${response.status} ${error}`);
      }

      const data: CreateBranchResponse = await response.json();
      
      // Wait for branch to be ready
      await this.waitForBranchReady(data.branch.id);

      // Get connection details
      const connectionUri = data.connection_uris[0];
      const database = options?.databaseName || connectionUri.connection_parameters.database;
      const role = options?.roleName || connectionUri.connection_parameters.role;

      // Build connection strings
      const connectionString = this.buildConnectionString(
        connectionUri.connection_parameters.host,
        database,
        role,
        false
      );

      const pooledConnectionString = options?.pooled
        ? this.buildConnectionString(
            connectionUri.connection_parameters.pooler_host,
            database,
            role,
            true
          )
        : undefined;

      const branchInfo: TestBranchInfo = {
        branchId: data.branch.id,
        branchName: branchName,
        connectionString,
        pooledConnectionString,
        host: connectionUri.connection_parameters.host,
        database,
        role,
      };

      this.branches.set(branchName, branchInfo);
      return branchInfo;
    } catch (error) {
      console.error(`Failed to create test branch: ${error}`);
      throw error;
    }
  }

  /**
   * Deletes a test branch
   */
  async deleteTestBranch(branchNameOrId: string): Promise<void> {
    const branchInfo = this.branches.get(branchNameOrId);
    const branchId = branchInfo?.branchId || branchNameOrId;

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/projects/${this.projectId}/branches/${branchId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        }
      );

      if (!response.ok && response.status !== 404) {
        const error = await response.text();
        throw new Error(`Failed to delete test branch: ${response.status} ${error}`);
      }

      if (branchInfo) {
        this.branches.delete(branchInfo.branchName);
      }
    } catch (error) {
      console.error(`Failed to delete test branch: ${error}`);
      throw error;
    }
  }

  /**
   * Deletes all test branches created by this manager
   */
  async deleteAllTestBranches(): Promise<void> {
    const deletePromises = Array.from(this.branches.values()).map((branch) =>
      this.deleteTestBranch(branch.branchId)
    );

    await Promise.allSettled(deletePromises);
    this.branches.clear();
  }

  /**
   * Lists all branches in the project
   */
  async listBranches(): Promise<NeonBranch[]> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/projects/${this.projectId}/branches`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to list branches: ${response.status} ${error}`);
      }

      const data = await response.json();
      return data.branches;
    } catch (error) {
      console.error(`Failed to list branches: ${error}`);
      throw error;
    }
  }

  /**
   * Cleans up old test branches based on age
   */
  async cleanupOldTestBranches(maxAgeHours: number = 24): Promise<void> {
    try {
      const branches = await this.listBranches();
      const now = new Date();
      const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

      const testBranches = branches.filter(
        (branch) => branch.name.startsWith('test-') && !branch.primary
      );

      const deletePromises = testBranches
        .filter((branch) => {
          const createdAt = new Date(branch.created_at);
          return now.getTime() - createdAt.getTime() > maxAgeMs;
        })
        .map((branch) => this.deleteTestBranch(branch.id));

      const results = await Promise.allSettled(deletePromises);
      const failed = results.filter((r) => r.status === 'rejected');

      if (failed.length > 0) {
        console.warn(`Failed to delete ${failed.length} old test branches`);
      }
    } catch (error) {
      console.error(`Failed to cleanup old test branches: ${error}`);
      throw error;
    }
  }

  /**
   * Gets the connection string for a branch
   */
  getConnectionString(branchName: string, pooled: boolean = false): string | undefined {
    const branch = this.branches.get(branchName);
    if (!branch) return undefined;
    return pooled ? branch.pooledConnectionString : branch.connectionString;
  }

  /**
   * Waits for a branch to be ready
   */
  private async waitForBranchReady(
    branchId: string,
    maxWaitMs: number = 60000
  ): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 1000; // 1 second

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const response = await fetch(
          `${this.apiBaseUrl}/projects/${this.projectId}/branches/${branchId}`,
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (data.branch.current_state === 'ready') {
            return;
          }
        }
      } catch (error) {
        // Ignore errors during polling
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Branch ${branchId} did not become ready within ${maxWaitMs}ms`);
  }

  /**
   * Builds a connection string from components
   */
  private buildConnectionString(
    host: string,
    database: string,
    role: string,
    pooled: boolean
  ): string {
    const params = new URLSearchParams({
      sslmode: 'require',
    });

    if (pooled) {
      params.append('pgbouncer', 'true');
    }

    // Note: In a real implementation, you'd need to handle the password securely
    // This is a placeholder - the actual password would come from the API response
    // or be provided via environment variables
    return `postgresql://${role}:${process.env.NEON_DB_PASSWORD || 'password'}@${host}/${database}?${params.toString()}`;
  }
}

/**
 * Creates a singleton instance for test branch management
 */
let testBranchManager: NeonTestBranchManager | null = null;

export function getTestBranchManager(): NeonTestBranchManager {
  if (!testBranchManager) {
    const apiKey = process.env.NEON_API_KEY;
    const projectId = process.env.NEON_PROJECT_ID;

    if (!apiKey || !projectId) {
      throw new Error(
        'NEON_API_KEY and NEON_PROJECT_ID environment variables must be set for test branching'
      );
    }

    testBranchManager = new NeonTestBranchManager({
      apiKey,
      projectId,
      parentBranchId: process.env.NEON_PARENT_BRANCH_ID,
      databaseName: process.env.NEON_DATABASE_NAME || 'test',
      roleName: process.env.NEON_ROLE_NAME || 'test',
      pooled: process.env.NEON_USE_POOLING === 'true',
    });
  }

  return testBranchManager;
}

/**
 * Utility function to create a test branch with automatic cleanup
 */
export async function withTestBranch<T>(
  testSuiteName: string,
  fn: (connectionString: string) => Promise<T>
): Promise<T> {
  const manager = getTestBranchManager();
  const branch = await manager.createTestBranch(testSuiteName);

  try {
    return await fn(branch.connectionString);
  } finally {
    await manager.deleteTestBranch(branch.branchName);
  }
}