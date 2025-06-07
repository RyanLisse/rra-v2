# Testing with Neon Database Branches

This documentation explains how to use Neon database branching for isolated test environments in the RAG Chat Application.

## Overview

Neon database branches provide isolated database environments for each test suite, ensuring complete test isolation without the overhead of spinning up separate database instances. Each test suite gets its own ephemeral branch that is automatically created before tests run and cleaned up afterward.

## Setup

### 1. Environment Variables

Create a `.env.test` file with the following variables:

```bash
# Required for Neon branching
NEON_API_KEY=your_neon_api_key_here
NEON_PROJECT_ID=your_neon_project_id_here

# Optional configuration
NEON_PARENT_BRANCH_ID=br_main_branch_id  # Defaults to main branch
NEON_DATABASE_NAME=test                   # Database name to use
NEON_ROLE_NAME=test                       # Role name for connections
NEON_USE_POOLING=true                     # Enable connection pooling
USE_NEON_BRANCHING=true                   # Enable branching for tests

# Database password (stored securely in your environment)
NEON_DB_PASSWORD=your_database_password
```

### 2. Obtaining Neon API Key

1. Visit the [Neon Console](https://console.neon.tech)
2. Navigate to your project settings
3. Go to the "API Keys" section
4. Create a new API key with the necessary permissions:
   - `branches:create`
   - `branches:delete`
   - `branches:list`
   - `endpoints:create`
   - `endpoints:delete`

### 3. Finding Your Project ID

Your project ID can be found in:
- The Neon Console URL: `https://console.neon.tech/app/projects/{project-id}`
- Your existing connection string: `postgresql://user:pass@{endpoint}.{region}.{project-id}.neon.tech/db`

## Usage

### Unit and Component Tests (Vitest)

For tests that require database isolation, use the setup function in your test files:

```typescript
import { describe, test, expect } from 'vitest';
import { setupNeonTestBranching } from '@/tests/config/neon-branch-setup';

describe('Database Integration Tests', () => {
  // This will create a unique branch for this test suite
  setupNeonTestBranching('database-integration');

  test('should create user', async () => {
    // Your test code here - uses the isolated test branch
  });
});
```

### Integration Tests

For integration tests that need full database isolation, use the minimal config:

```bash
# Run integration tests with Neon branching
bun run vitest --config vitest.config.minimal.ts
```

### End-to-End Tests (Playwright)

For E2E tests, each test automatically gets its own branch:

```typescript
import { test, expect } from '@playwright/test';
import { setupNeonForPlaywright } from '@/tests/config/neon-branch-setup';

test('user registration flow', async ({ page }) => {
  // Automatically gets an isolated database branch
  const testInfo = test.info();
  const { databaseUrl, cleanup } = await setupNeonForPlaywright(testInfo);
  
  try {
    // Your E2E test code here
    await page.goto('/register');
    // ... test implementation
  } finally {
    await cleanup();
  }
});
```

## Branching Strategy

### Branch Naming Convention

Test branches follow this naming pattern:
```
test-{suite-name}-{timestamp}-{random-id}
```

Examples:
- `test-api-auth-2024-01-15T10-30-00-abc123de`
- `test-document-upload-2024-01-15T10-31-15-def456gh`

### Branch Lifecycle

1. **Creation**: Before test suite starts
   - New branch created from parent branch (usually main)
   - Endpoint provisioned for the branch
   - Connection strings generated
   - Database migrations applied (if configured)

2. **Testing**: During test execution
   - Tests run against the isolated branch
   - No interference from other test suites
   - Fresh data state for each suite

3. **Cleanup**: After test suite completes
   - Branch automatically deleted
   - All associated endpoints removed
   - No orphaned resources

### Branch Inheritance

By default, test branches are created from your main production branch, ensuring tests run against the latest schema. You can specify a different parent branch using the `NEON_PARENT_BRANCH_ID` environment variable.

## Configuration Options

### Per-Suite Configuration

You can customize branch creation per test suite:

```typescript
describe('Custom Test Suite', () => {
  setupNeonTestBranching('custom-suite', {
    parentBranchId: 'br_custom_parent',  // Use specific parent branch
    databaseName: 'custom_test_db',      // Custom database name
    pooled: true,                        // Enable connection pooling
  });
});
```

### Global Configuration

Configure global settings in your `.env.test` file:

```bash
# Performance tuning
NEON_BRANCH_TIMEOUT=60000          # Max time to wait for branch creation (ms)
NEON_MAX_CONCURRENT_BRANCHES=5     # Limit concurrent branches

# Cleanup settings
NEON_CLEANUP_ON_STARTUP=true       # Cleanup old branches on test startup
NEON_MAX_BRANCH_AGE_HOURS=24       # Auto-cleanup branches older than this

# Database settings
NEON_AUTO_MIGRATE=true             # Run migrations on new branches
NEON_SEED_DATA=false               # Seed test data after migration
```

## Best Practices

### 1. Test Isolation

- Each test suite gets its own branch
- Use descriptive suite names for easier debugging
- Avoid shared state between test suites

### 2. Performance Optimization

- Limit concurrent test suites when using branching
- Use connection pooling for better performance
- Consider disabling branching for unit tests that don't need database access

### 3. Resource Management

- Branches are automatically cleaned up after tests
- Old branches are cleaned up on startup (configurable)
- Monitor your Neon usage to avoid hitting plan limits

### 4. Error Handling

- Tests gracefully fall back to local database if Neon is unavailable
- Failed branch creation doesn't block the entire test suite
- Cleanup continues even if some operations fail

## Debugging

### Enable Debug Logging

Set the debug environment variable:

```bash
DEBUG=neon:* bun test
```

### Manual Branch Management

You can manually manage branches using the utility functions:

```typescript
import { getTestBranchManager } from '@/lib/testing/neon-test-branches';

const manager = getTestBranchManager();

// List all branches
const branches = await manager.listBranches();

// Cleanup old branches
await manager.cleanupOldTestBranches(24); // older than 24 hours

// Create a branch manually
const branch = await manager.createTestBranch('manual-test');

// Delete a branch manually
await manager.deleteTestBranch(branch.branchId);
```

### Common Issues

#### 1. API Rate Limits

**Problem**: Tests fail with rate limit errors
**Solution**: Reduce the number of concurrent workers in test configuration

#### 2. Branch Creation Timeout

**Problem**: Branches take too long to become ready
**Solution**: Increase `NEON_BRANCH_TIMEOUT` or check Neon service status

#### 3. Permission Errors

**Problem**: API key lacks necessary permissions
**Solution**: Ensure API key has branch management permissions

#### 4. Connection String Issues

**Problem**: Database connections fail
**Solution**: Verify `NEON_DB_PASSWORD` and role configuration

## Script Commands

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "test:neon": "USE_NEON_BRANCHING=true bun test",
    "test:neon:integration": "USE_NEON_BRANCHING=true bun run vitest --config vitest.config.minimal.ts",
    "test:neon:e2e": "USE_NEON_BRANCHING=true bun run test:e2e",
    "test:neon:cleanup": "bun run tsx scripts/cleanup-test-branches.ts",
    "test:branch:create": "bun run tsx scripts/create-test-branch.ts",
    "test:branch:list": "bun run tsx scripts/list-test-branches.ts"
  }
}
```

## Migration Strategy

### Gradual Adoption

1. **Phase 1**: Enable for integration tests only
2. **Phase 2**: Enable for specific test suites that need isolation
3. **Phase 3**: Enable for all database-dependent tests

### Fallback Strategy

The system automatically falls back to local database when:
- Neon API is unavailable
- API credentials are missing
- Branch creation fails
- `USE_NEON_BRANCHING=false` is set

## Monitoring and Observability

### Branch Usage Tracking

Monitor branch creation and cleanup:

```typescript
// Custom metrics tracking
const metrics = {
  branchesCreated: 0,
  branchesDeleted: 0,
  averageCreationTime: 0,
  failedOperations: 0,
};
```

### Cost Monitoring

- Track compute hours used by test branches
- Monitor storage usage for test data
- Set up alerts for unusual usage patterns

## Security Considerations

### API Key Management

- Store API keys securely (environment variables, secrets manager)
- Use least-privilege API keys
- Rotate keys regularly
- Never commit keys to version control

### Database Security

- Test branches inherit security settings from parent
- Ensure test data doesn't contain sensitive information
- Use separate Neon projects for production and testing

### Network Security

- Test branches are accessible over the internet
- Use SSL/TLS for all connections
- Consider IP allowlisting for enhanced security

## Troubleshooting

### Test Failures

1. Check Neon service status
2. Verify API key permissions
3. Review branch creation logs
4. Ensure sufficient plan limits

### Performance Issues

1. Reduce concurrent test workers
2. Enable connection pooling
3. Optimize test data size
4. Consider regional proximity

### Resource Cleanup

1. Manual cleanup of orphaned branches
2. Review and adjust cleanup policies
3. Monitor resource usage patterns
4. Set up automated alerts

## Support

For issues related to:
- **Neon service**: [Neon Support](https://neon.tech/docs/introduction)
- **Test configuration**: Check the test setup files
- **Application-specific**: Review the test utilities and documentation