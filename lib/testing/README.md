# Enhanced Neon API Testing Utilities

This directory contains enhanced utilities for working with Neon database branches in testing and development environments. The enhanced implementation leverages MCP (Model Context Protocol) tools for improved reliability, monitoring, and developer experience.

## Overview

The enhanced Neon API client provides:

- **Robust Branch Management**: Create, delete, and manage test database branches
- **Rate Limiting & Retry Logic**: Built-in protection against API limits with exponential backoff
- **Comprehensive Logging**: Detailed operation logs and performance metrics
- **Automated Cleanup**: Intelligent cleanup of old test branches with configurable filters
- **MCP Integration**: Uses MCP Neon tools for reliable database operations
- **Type Safety**: Full TypeScript support with comprehensive type definitions
- **Monitoring & Analytics**: Performance tracking and error analysis capabilities

## Core Components

### 1. Enhanced Neon API Client (`neon-api-client.ts`)

The main client class that provides a high-level interface to Neon operations:

```typescript
import { EnhancedNeonApiClient, getNeonApiClient } from './lib/testing/neon-api-client';

// Get singleton instance
const client = getNeonApiClient({
  defaultProjectId: 'your-project-id',
  defaultDatabase: 'neondb',
  defaultRole: 'neondb_owner',
  rateLimitConfig: {
    maxRequestsPerMinute: 60,
    burstLimit: 10
  },
  retryConfig: {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000
  },
  cleanupConfig: {
    maxBranchAgeHours: 24,
    autoCleanupEnabled: true,
    preserveTaggedBranches: true
  }
});
```

### 2. MCP Interface Layer (`neon-mcp-interface.ts`)

Provides a clean interface to MCP Neon tools with type safety and error handling:

```typescript
import { NeonMCPInterface } from './lib/testing/neon-mcp-interface';

// Example: Create a branch using MCP tools
const response = await NeonMCPInterface.createBranch(projectId, branchName);
```

### 3. Enhanced Logging (`neon-logger.ts`)

Comprehensive logging and monitoring system:

```typescript
import { getNeonLogger } from './lib/testing/neon-logger';

const logger = getNeonLogger();
logger.info('operation', 'Operation completed successfully', { duration: 150 });
```

### 4. Legacy Implementation (`neon-test-branches.ts`)

The original implementation using direct API calls (maintained for compatibility).

## Key Features

### Branch Management

#### Create Test Branches
```typescript
const branchInfo = await client.createTestBranch({
  testSuite: 'user-authentication',
  purpose: 'unit-testing',
  tags: ['auth', 'users', 'ci'],
  database: 'neondb',
  role: 'neondb_owner',
  waitForReady: true,
  timeoutMs: 60000
});
```

#### Automatic Cleanup with `withTestBranch`
```typescript
const result = await client.withTestBranch(
  {
    testSuite: 'integration-test',
    purpose: 'schema-migration',
    tags: ['migration', 'schema']
  },
  async (branchInfo) => {
    // Your test code here
    // Branch is automatically cleaned up when done
    return testResult;
  }
);
```

#### Batch Cleanup
```typescript
const cleanupResult = await client.cleanupTestBranches({
  maxAgeHours: 24,
  namePattern: /^test-/,
  excludeTags: ['preserve'],
  preservePrimary: true,
  dryRun: false
});
```

### Database Operations

#### Execute SQL
```typescript
const result = await client.executeSql(
  'SELECT * FROM users WHERE active = true',
  branchId,
  'neondb'
);
```

#### Execute Transactions
```typescript
const result = await client.executeTransaction([
  'BEGIN',
  'CREATE TABLE test_users (id SERIAL PRIMARY KEY, name VARCHAR(100))',
  'INSERT INTO test_users (name) VALUES (\'Test User\')',
  'COMMIT'
], branchId);
```

### Monitoring & Analytics

#### Performance Metrics
```typescript
const metrics = client.getPerformanceMetrics();
// Returns: operation count, avg duration, success rate, etc.
```

#### Error Analysis
```typescript
const errorSummary = client.getErrorSummary();
// Returns: total errors, errors by operation, recent errors
```

#### Export Monitoring Data
```typescript
const exportData = client.exportMonitoringData();
// Returns: logs, metrics, active branches, configuration
```

## Usage Patterns

### 1. Unit Testing

```typescript
import { describe, it, beforeEach, afterEach } from 'vitest';
import { getNeonApiClient } from '../lib/testing/neon-api-client';

describe('User Service', () => {
  let client: EnhancedNeonApiClient;
  let testBranch: TestBranchInfo;

  beforeEach(async () => {
    client = getNeonApiClient();
    const result = await client.createTestBranch({
      testSuite: 'user-service',
      purpose: 'unit-testing'
    });
    testBranch = result.data!;
  });

  afterEach(async () => {
    await client.deleteTestBranch(testBranch.branchName);
  });

  it('should create user successfully', async () => {
    // Your test code using testBranch.connectionString
  });
});
```

### 2. Integration Testing

```typescript
import { getNeonApiClient } from '../lib/testing/neon-api-client';

const client = getNeonApiClient();

// Test with automatic cleanup
const result = await client.withTestBranch(
  {
    testSuite: 'api-integration',
    purpose: 'full-stack-testing',
    tags: ['integration', 'api', 'database']
  },
  async (branchInfo) => {
    // Set up test data
    await client.executeTransaction([
      'CREATE TABLE test_data (id SERIAL PRIMARY KEY, value TEXT)',
      'INSERT INTO test_data (value) VALUES (\'test1\'), (\'test2\')'
    ], branchInfo.branchId);

    // Run your integration tests
    // Branch is automatically cleaned up when this function returns
    return { success: true, recordsCreated: 2 };
  }
);
```

### 3. Migration Testing

```typescript
const migrationResult = await client.withTestBranch(
  {
    testSuite: 'schema-migration',
    purpose: 'migration-validation',
    tags: ['migration', 'schema']
  },
  async (branchInfo) => {
    // Apply migration
    await client.executeTransaction([
      'ALTER TABLE users ADD COLUMN last_login TIMESTAMP',
      'CREATE INDEX idx_users_last_login ON users(last_login)'
    ], branchInfo.branchId);

    // Validate migration
    const validation = await client.executeSql(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'users' AND column_name = 'last_login'`,
      branchInfo.branchId
    );

    return validation.success && validation.data;
  }
);
```

### 4. Parallel Testing

```typescript
const testSuites = ['auth', 'users', 'products'];

const parallelResults = await Promise.all(
  testSuites.map(suite => 
    client.withTestBranch(
      {
        testSuite: suite,
        purpose: 'parallel-testing',
        tags: ['parallel', 'isolated']
      },
      async (branchInfo) => {
        // Run suite-specific tests
        return runTestSuite(suite, branchInfo.connectionString);
      }
    )
  )
);
```

## Environment Setup

### Required Environment Variables

```bash
# Project Configuration
NEON_PROJECT_ID=your-project-id  # Required

# Optional Configuration
NEON_DATABASE_NAME=neondb        # Default database
NEON_ROLE_NAME=neondb_owner      # Default role
NEON_API_KEY=your-api-key        # For direct API access (fallback)
```

### Test Configuration

Add to your `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    timeout: 60000, // Longer timeout for database operations
    poolOptions: {
      threads: {
        maxThreads: 4, // Limit concurrent branch creation
      }
    }
  }
});
```

## Performance Considerations

### Rate Limiting
- Default: 60 requests/minute with burst limit of 10
- Automatically handles backoff and retry
- Configurable per client instance

### Connection Pooling
- Each branch gets its own connection string
- Use connection pooling in your application layer
- Consider PgBouncer for high-concurrency testing

### Cleanup Strategy
- Automatic cleanup after test completion
- Scheduled cleanup of old branches
- Tag-based preservation of important branches

## Best Practices

### 1. Test Isolation
- Always use separate branches for each test suite
- Use the `withTestBranch` pattern for automatic cleanup
- Tag branches appropriately for filtering

### 2. Resource Management
- Clean up test branches promptly
- Use parallel testing judiciously to avoid rate limits
- Monitor branch usage with analytics

### 3. Error Handling
- Always check operation results (`result.success`)
- Use retry logic for transient failures
- Monitor error rates and patterns

### 4. Monitoring
- Export monitoring data for analysis
- Track performance metrics over time
- Set up alerts for high error rates

## Migration from Legacy Implementation

If you're using the legacy `NeonTestBranchManager`:

```typescript
// Old way
const manager = getTestBranchManager();
const branch = await manager.createTestBranch('test-suite');

// New way
const client = getNeonApiClient();
const result = await client.createTestBranch({
  testSuite: 'test-suite',
  purpose: 'testing'
});
const branch = result.data!;
```

The enhanced client provides better error handling, logging, and type safety while maintaining similar functionality.

## Examples

See `neon-usage-examples.ts` for comprehensive usage examples including:

- Basic project and branch management
- Test branch creation and cleanup
- Database operations and transactions
- Monitoring and performance analysis
- Migration testing patterns
- Parallel test execution

## Troubleshooting

### Common Issues

1. **Branch Creation Timeout**
   - Increase `timeoutMs` in branch options
   - Check Neon service status
   - Verify project limits

2. **Rate Limiting**
   - Reduce concurrent operations
   - Increase rate limit configuration
   - Add delays between operations

3. **MCP Tool Errors**
   - Verify MCP tools are available
   - Check environment configuration
   - Fall back to direct API calls if needed

### Debug Logging

Enable debug logging:

```typescript
const client = getNeonApiClient();
const logs = client.getRecentLogs(50, 'debug');
console.log('Debug logs:', logs);
```

### Performance Analysis

```typescript
const metrics = client.getPerformanceMetrics();
const slowOperations = metrics.filter(m => m.avgDuration > 5000);
console.log('Slow operations:', slowOperations);
```

## Contributing

When adding new functionality:

1. Update type definitions in `neon-api-client.ts`
2. Add corresponding methods to `NeonMCPInterface`
3. Include comprehensive tests
4. Update documentation and examples
5. Consider backward compatibility with legacy implementation

## License

This enhanced implementation follows the same license as the main project.