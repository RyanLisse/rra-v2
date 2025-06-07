# Enhanced Neon API Client - Quick Start Guide

## Installation & Setup

### 1. Environment Variables
```bash
# Required
NEON_PROJECT_ID=your-project-id

# Optional  
NEON_DATABASE_NAME=neondb
NEON_ROLE_NAME=neondb_owner
```

### 2. Basic Usage

```typescript
import { getNeonApiClient } from './lib/testing/neon-api-client';

// Get singleton instance
const client = getNeonApiClient();

// List projects
const projects = await client.listProjects();

// Create test branch with auto-cleanup
await client.withTestBranch(
  {
    testSuite: 'my-test',
    purpose: 'testing',
    tags: ['unit-test', 'ci']
  },
  async (branchInfo) => {
    // Your test code here
    // Branch automatically deleted when done
    return testResults;
  }
);
```

## Common Patterns

### Unit Testing
```typescript
describe('My Service', () => {
  let client: EnhancedNeonApiClient;
  let testBranch: TestBranchInfo;

  beforeEach(async () => {
    client = getNeonApiClient();
    const result = await client.createTestBranch({
      testSuite: 'my-service',
      purpose: 'unit-testing'
    });
    testBranch = result.data!;
  });

  afterEach(async () => {
    await client.deleteTestBranch(testBranch.branchName);
  });

  it('should work', async () => {
    // Use testBranch.connectionString for database operations
  });
});
```

### Integration Testing
```typescript
await client.withTestBranch(
  { testSuite: 'integration', tags: ['api', 'database'] },
  async (branchInfo) => {
    // Setup test data
    await client.executeTransaction([
      'CREATE TABLE test_users (id SERIAL, name VARCHAR(100))',
      'INSERT INTO test_users (name) VALUES (\'Test User\')'
    ], branchInfo.branchId);
    
    // Run tests
    return await runIntegrationTests(branchInfo.connectionString);
  }
);
```

### Parallel Testing
```typescript
const testSuites = ['auth', 'users', 'products'];
const results = await Promise.all(
  testSuites.map(suite =>
    client.withTestBranch(
      { testSuite: suite, tags: ['parallel'] },
      async (branchInfo) => runTestSuite(suite, branchInfo)
    )
  )
);
```

## Monitoring & Analytics

### Performance Metrics
```typescript
const metrics = client.getPerformanceMetrics();
// { operation, count, avgDuration, successRate, lastExecuted }

const errors = client.getErrorSummary();
// { totalErrors, errorsByOperation, recentErrors }

const logs = client.getRecentLogs(10);
// Recent operation logs with timestamps
```

### Export Data
```typescript
const data = client.exportMonitoringData();
// Complete operational data for analysis
```

## Branch Management

### Manual Branch Creation
```typescript
const result = await client.createTestBranch({
  testSuite: 'my-test',
  purpose: 'development',
  tags: ['feature-x', 'draft'],
  database: 'mydb',
  role: 'myuser',
  waitForReady: true,
  timeoutMs: 60000
});

if (result.success) {
  const branch = result.data!;
  // Use branch.connectionString
  // Clean up: await client.deleteTestBranch(branch.branchName);
}
```

### Cleanup Operations
```typescript
// Cleanup old test branches
await client.cleanupTestBranches({
  maxAgeHours: 24,
  namePattern: /^test-/,
  excludeTags: ['preserve'],
  preservePrimary: true,
  dryRun: false
});

// Get branch statistics
const stats = await client.getBranchStatistics();
```

## Database Operations

### Execute SQL
```typescript
const result = await client.executeSql(
  'SELECT * FROM users WHERE active = true',
  branchId,
  'mydb'
);
```

### Execute Transactions
```typescript
const result = await client.executeTransaction([
  'BEGIN',
  'CREATE TABLE temp_data (id SERIAL, value TEXT)',
  'INSERT INTO temp_data (value) VALUES (\'test\')',
  'COMMIT'
], branchId);
```

### Get Connection String
```typescript
const result = await client.getConnectionString(branchId, 'mydb', 'myuser');
if (result.success) {
  const connectionString = result.data;
  // Use with your database client
}
```

## Configuration

### Custom Configuration
```typescript
const client = new EnhancedNeonApiClient({
  defaultProjectId: 'my-project',
  defaultDatabase: 'mydb',
  defaultRole: 'myuser',
  rateLimitConfig: {
    maxRequestsPerMinute: 100,
    burstLimit: 20
  },
  retryConfig: {
    maxRetries: 5,
    baseDelayMs: 500,
    maxDelayMs: 30000
  },
  cleanupConfig: {
    maxBranchAgeHours: 12,
    autoCleanupEnabled: true,
    preserveTaggedBranches: true
  }
});
```

## Error Handling

All operations return structured results:

```typescript
interface DatabaseOperationResult<T> {
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

// Always check success
const result = await client.listProjects();
if (result.success) {
  console.log('Projects:', result.data);
} else {
  console.error('Error:', result.error);
}
```

## Best Practices

### 1. Use Auto-Cleanup Pattern
```typescript
// Preferred
await client.withTestBranch(options, async (branch) => {
  // Test code
});

// vs manual cleanup
const branch = await client.createTestBranch(options);
try {
  // Test code
} finally {
  await client.deleteTestBranch(branch.data!.branchName);
}
```

### 2. Tag Your Branches
```typescript
await client.createTestBranch({
  testSuite: 'auth-service',
  tags: ['auth', 'critical', 'preserve'] // Use 'preserve' to skip cleanup
});
```

### 3. Monitor Performance
```typescript
// Regular health checks
const metrics = client.getPerformanceMetrics();
const slowOps = metrics.filter(m => m.avgDuration > 5000);
if (slowOps.length > 0) {
  console.warn('Slow operations detected:', slowOps);
}
```

### 4. Handle Errors Gracefully
```typescript
const result = await client.createTestBranch(options);
if (!result.success) {
  // Log error details
  console.error('Branch creation failed:', {
    error: result.error,
    operation: result.metadata.operation,
    duration: result.metadata.duration_ms
  });
  
  // Implement fallback or retry logic
  throw new Error(`Failed to create test branch: ${result.error}`);
}
```

## Troubleshooting

### Common Issues

**Branch Creation Timeout**
```typescript
// Increase timeout
await client.createTestBranch({
  testSuite: 'my-test',
  timeoutMs: 120000 // 2 minutes
});
```

**Rate Limiting**
```typescript
// Check rate limit configuration
const client = new EnhancedNeonApiClient({
  rateLimitConfig: {
    maxRequestsPerMinute: 30, // Reduce if hitting limits
    burstLimit: 5
  }
});
```

**Debug Logging**
```typescript
const logs = client.getRecentLogs(20, 'error');
console.log('Recent errors:', logs);

const errorSummary = client.getErrorSummary();
console.log('Error patterns:', errorSummary);
```

## Demo Script

Run the included demo to see all features:

```bash
bun run lib/testing/neon-demo.ts
```

This will demonstrate:
- Project and branch listing
- Performance monitoring
- Rate limiting
- Error handling
- Analytics export

## Next Steps

1. **Set up environment variables**
2. **Try the demo script**
3. **Integrate with your tests**
4. **Set up monitoring alerts**
5. **Configure cleanup policies**

For detailed documentation, see `lib/testing/README.md` and usage examples in `lib/testing/neon-usage-examples.ts`.