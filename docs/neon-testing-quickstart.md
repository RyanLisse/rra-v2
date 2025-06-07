# Neon Testing Infrastructure - Quick Start Guide

Get up and running with the Enhanced Neon Testing Infrastructure in 5 minutes!

## Prerequisites

- Node.js 18+ or Bun
- A Neon account with a project ID

## 1. Environment Setup (1 minute)

Create `.env.test` in your project root:

```bash
# Required
NEON_PROJECT_ID=your-project-id

# Optional (but recommended)
NEON_DATABASE_NAME=neondb
NEON_ROLE_NAME=neondb_owner
USE_NEON_BRANCHING=true
ENABLE_BRANCH_METRICS=true
```

## 2. Install Dependencies (1 minute)

```bash
# Using Bun (recommended)
bun add -d vitest @types/node
bun add pg dotenv

# Using npm
npm install -D vitest @types/node
npm install pg dotenv
```

## 3. Create Test Setup (1 minute)

Create `tests/setup.ts`:

```typescript
import { config } from 'dotenv';
import { setupNeonTestBranching } from './config/neon-branch-setup';

// Load test environment
config({ path: '.env.test' });

// Enable Neon branching for your test suite
export function setupTestEnvironment(suiteName: string) {
  setupNeonTestBranching(suiteName, {
    useEnhancedClient: true,
    enableMetrics: true
  });
}
```

## 4. Write Your First Test (1 minute)

Create `tests/quickstart.test.ts`:

```typescript
import { describe, it } from 'vitest';
import { getNeonApiClient } from '@/lib/testing/neon-api-client';
import { setupTestEnvironment } from './setup';

// Setup test environment
setupTestEnvironment('quickstart');

describe('Neon Quick Start', () => {
  it('should work with isolated database', async () => {
    const client = getNeonApiClient();
    
    // This creates a branch, runs your test, then cleans up
    await client.withTestBranch(
      {
        testSuite: 'quickstart',
        purpose: 'demo',
        tags: ['quickstart']
      },
      async (branchInfo) => {
        console.log('✅ Connected to test branch:', branchInfo.branchName);
        console.log('📊 Database:', branchInfo.database);
        console.log('🔗 Connection available at:', branchInfo.host);
        
        // Run a simple query
        const result = await client.executeSql(
          'SELECT current_database(), version()',
          branchInfo.branchId
        );
        
        console.log('Query result:', result.data);
        return { success: true };
      }
    );
  });
});
```

## 5. Run the Test (1 minute)

```bash
# Using Bun
bun test tests/quickstart.test.ts

# Using npm
npx vitest run tests/quickstart.test.ts
```

Expected output:
```
✅ Connected to test branch: test-quickstart-2024-01-15T10-30-45-123Z-a1b2c3d4
📊 Database: neondb
🔗 Connection available at: ep-cool-thunder-123456.us-east-2.aws.neon.tech
Query result: { rows: [...], rowCount: 1 }
✓ tests/quickstart.test.ts
  ✓ Neon Quick Start
    ✓ should work with isolated database
```

## Common Patterns

### Pattern 1: Database Schema Testing

```typescript
it('should create and query tables', async () => {
  const client = getNeonApiClient();
  
  await client.withTestBranch(
    { testSuite: 'schema-test' },
    async (branch) => {
      // Create schema
      await client.executeTransaction([
        `CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100),
          email VARCHAR(255) UNIQUE
        )`,
        `INSERT INTO users (name, email) 
         VALUES ('Alice', 'alice@example.com')`
      ], branch.branchId);
      
      // Query data
      const result = await client.executeSql(
        'SELECT * FROM users',
        branch.branchId
      );
      
      expect(result.data.rows).toHaveLength(1);
      expect(result.data.rows[0].name).toBe('Alice');
    }
  );
});
```

### Pattern 2: Using with Database Clients

```typescript
import postgres from 'postgres';

it('should work with postgres.js', async () => {
  const client = getNeonApiClient();
  
  await client.withTestBranch(
    { testSuite: 'postgres-client' },
    async (branch) => {
      // Connect with postgres.js
      const sql = postgres(branch.connectionString);
      
      // Use as normal
      const users = await sql`
        SELECT * FROM pg_user WHERE usename = current_user
      `;
      
      console.log('Current user:', users[0].usename);
      
      // Don't forget to close
      await sql.end();
    }
  );
});
```

### Pattern 3: Parallel Testing

```typescript
it('should run tests in parallel', async () => {
  const client = getNeonApiClient();
  const testCases = ['test1', 'test2', 'test3'];
  
  // Run all tests in parallel, each with its own branch
  const results = await Promise.all(
    testCases.map(testCase =>
      client.withTestBranch(
        { testSuite: testCase },
        async (branch) => {
          // Each test runs in isolation
          console.log(`Running ${testCase} on ${branch.branchName}`);
          
          // Simulate test work
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          return { testCase, branch: branch.branchName };
        }
      )
    )
  );
  
  console.log('All tests completed:', results);
});
```

## Next Steps

### 1. Explore More Examples

Check out the comprehensive examples:
- [Testing Patterns](./testing-patterns.md)
- [Usage Examples](../lib/testing/neon-usage-examples.ts)
- [Demo Script](../lib/testing/neon-demo.ts)

### 2. Set Up CI/CD

Add to your GitHub Actions:

```yaml
- name: Run Tests with Neon
  env:
    NEON_PROJECT_ID: ${{ secrets.NEON_PROJECT_ID }}
  run: |
    bun test
```

### 3. Monitor Performance

```typescript
// After your tests
const client = getNeonApiClient();
const metrics = client.getPerformanceMetrics();
console.log('Test performance:', metrics);
```

### 4. Implement Cleanup

```bash
# Add cleanup script
bun run test:branches:cleanup --max-age=24
```

## Troubleshooting Quick Fixes

### Issue: "NEON_PROJECT_ID not set"
**Fix**: Ensure `.env.test` is loaded:
```typescript
import { config } from 'dotenv';
config({ path: '.env.test' });
```

### Issue: "Branch creation timeout"
**Fix**: Increase timeout:
```typescript
await client.createTestBranch({
  testSuite: 'my-test',
  timeoutMs: 180000 // 3 minutes
});
```

### Issue: "Rate limit exceeded"
**Fix**: Add delays between tests:
```typescript
afterEach(async () => {
  await new Promise(resolve => setTimeout(resolve, 2000));
});
```

## Get Help

- 📖 [Full Documentation](./neon-testing-guide.md)
- 🐛 [Troubleshooting Guide](./neon-testing-guide.md#troubleshooting)
- 💡 [Best Practices](./neon-testing-guide.md#best-practices)
- 🚀 [Performance Tips](./performance-testing-guide.md)

## Summary

You now have:
1. ✅ Test environment configured
2. ✅ Isolated database branches for each test
3. ✅ Automatic cleanup after tests
4. ✅ Performance monitoring built-in
5. ✅ Production-ready error handling

Happy testing! 🎉