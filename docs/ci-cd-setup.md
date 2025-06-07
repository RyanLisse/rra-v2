# CI/CD Setup Guide

This guide covers the setup and configuration of the CI/CD pipeline with Neon branch management.

## Overview

Our CI/CD pipeline provides:
- Automated test branch creation for every PR
- Isolated test environments with real PostgreSQL databases
- Parallel test execution across multiple shards
- Performance benchmarking and regression detection
- Automatic cleanup of test resources
- Cost optimization through intelligent branch lifecycle management

## Prerequisites

1. **Neon Account**: Create a project at [console.neon.tech](https://console.neon.tech)
2. **GitHub Repository**: With Actions enabled
3. **Required Secrets**: Configure in GitHub Settings → Secrets

## GitHub Secrets Configuration

### Required Secrets

```yaml
# Neon Database
NEON_API_KEY          # Your Neon API key
NEON_PROJECT_ID       # Your Neon project ID
NEON_DATABASE_URL     # Main branch database URL

# Optional - For notifications
SLACK_WEBHOOK_URL     # Slack webhook for alerts
```

### Getting Neon Credentials

1. **API Key**:
   ```bash
   # From Neon Console → Account Settings → API Keys
   # Create a new API key with full access
   ```

2. **Project ID**:
   ```bash
   # From your project URL: https://console.neon.tech/app/projects/{PROJECT_ID}
   # Or via API:
   curl -H "Authorization: Bearer $NEON_API_KEY" \
     https://console.neon.tech/api/v2/projects
   ```

3. **Database URL**:
   ```bash
   # From Neon Console → Connection Details
   # Format: postgresql://user:password@host/database?sslmode=require
   ```

## Workflow Configuration

### 1. Main Test Workflow

The `test-neon-branches.yml` workflow runs on:
- Push to main/develop branches
- Pull requests
- Manual dispatch

Features:
- Creates isolated test branch
- Runs migrations and seeds test data
- Executes tests in parallel (4 shards)
- Supports unit, integration, E2E, and performance tests
- Automatically cleans up after completion

### 2. PR Test Isolation

The `pr-test-isolation.yml` workflow provides:
- Dedicated test environment per PR
- Slash commands for interactive testing
- Persistent branch throughout PR lifecycle
- Automatic cleanup on PR close

Available commands:
- `/test` - Run all tests
- `/test unit` - Run unit tests only
- `/test e2e` - Run E2E tests only
- `/test performance` - Run performance benchmarks
- `/reset-db` - Reset database to initial state
- `/seed-data [preset]` - Seed test data
- `/branch-info` - Get branch connection details

### 3. Scheduled Cleanup

The `cleanup-test-branches.yml` workflow:
- Runs every 6 hours
- Deletes branches older than 24 hours
- Generates cost reports
- Sends alerts for high usage

### 4. Performance Benchmarks

The `performance-benchmarks.yml` workflow:
- Runs on main branch pushes
- Compares performance metrics with baseline
- Detects regressions automatically
- Posts results to PRs

## Local Development

### Environment Variables

Create `.env.test` for local testing:

```bash
# Database
DATABASE_URL=postgresql://...
NEON_API_KEY=your-api-key
NEON_PROJECT_ID=your-project-id

# Test Configuration
TEST_BRANCH_PREFIX=local-test
TEST_BRANCH_LIFETIME_HOURS=2
```

### Running Tests Locally

```bash
# Create a test branch
bun run scripts/create-test-branch.ts --name local-test-1

# Run tests with the branch
DATABASE_URL=<branch-url> bun test

# Clean up
bun run scripts/delete-test-branch.ts --branch-id <id>
```

## Cost Optimization

### Branch Lifecycle

1. **CI Branches** (`ci-test-*`):
   - Created per workflow run
   - Deleted immediately after tests
   - Lifetime: ~30 minutes

2. **PR Branches** (`pr-*`):
   - Created when PR opens
   - Persists during PR lifetime
   - Deleted when PR closes

3. **Manual Branches**:
   - Created via dispatch
   - Must be manually deleted
   - Monitor via cleanup workflow

### Cost Monitoring

```bash
# View current month usage
curl -H "Authorization: Bearer $NEON_API_KEY" \
  https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/usage

# List all branches
bun run scripts/list-test-branches.ts --verbose
```

### Best Practices

1. **Use appropriate test data presets**:
   - `minimal` - Quick smoke tests
   - `standard` - Regular CI runs
   - `performance` - Benchmark tests only

2. **Leverage parallel execution**:
   - Tests are sharded automatically
   - E2E tests run across browsers in parallel

3. **Monitor branch usage**:
   - Check cleanup workflow summaries
   - Review cost reports weekly

## Troubleshooting

### Common Issues

1. **Branch creation fails**:
   ```bash
   # Check API key permissions
   curl -H "Authorization: Bearer $NEON_API_KEY" \
     https://console.neon.tech/api/v2/users/me
   
   # Verify project access
   curl -H "Authorization: Bearer $NEON_API_KEY" \
     https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID
   ```

2. **Tests timeout**:
   - Increase timeout in workflow
   - Check Neon branch status
   - Verify migrations completed

3. **Cleanup not working**:
   - Check cron schedule syntax
   - Verify API permissions
   - Review workflow logs

### Debug Mode

Enable debug logging:

```yaml
env:
  ACTIONS_STEP_DEBUG: true
  ACTIONS_RUNNER_DEBUG: true
```

## Advanced Configuration

### Custom Test Presets

Add to `scripts/seed-test-data.ts`:

```typescript
PRESETS.custom = {
  users: 100,
  documents: 1000,
  chunksPerDocument: 50,
  description: 'Custom large dataset'
};
```

### Workflow Customization

Override defaults in workflow:

```yaml
env:
  MAX_BRANCH_AGE_HOURS: 48  # Keep branches longer
  BRANCH_PREFIX: custom-    # Custom prefix
  TEST_TIMEOUT: 3600        # 1 hour timeout
```

### Performance Thresholds

Configure in `scripts/analyze-performance.ts`:

```typescript
const REGRESSION_THRESHOLDS = {
  'api.search': 100,      // 100ms threshold
  'build.time': 30000,    // 30 second build
  'memory.loaded': 500,   // 500MB memory
};
```

## Security Considerations

1. **API Key Security**:
   - Use least-privilege API keys
   - Rotate keys regularly
   - Never commit keys to code

2. **Branch Isolation**:
   - Each branch has unique credentials
   - No cross-branch access
   - Automatic credential cleanup

3. **Data Protection**:
   - Use test data only
   - No production data in branches
   - Sanitize any real data

## Monitoring and Alerts

### Slack Integration

Configure webhook for alerts:

```javascript
// High branch count alert
if (branchCount > 50) {
  await sendSlackAlert({
    text: '⚠️ High number of test branches',
    level: 'warning'
  });
}
```

### GitHub Status Checks

Required checks for PRs:
- `test-summary` - All tests must pass
- `performance-check` - No regressions
- `branch-cleanup` - Cleanup verified

## Migration Guide

### From Local Testing

1. Export current test data
2. Create Neon project
3. Configure GitHub secrets
4. Update test configuration
5. Run initial benchmark

### From Other CI Systems

1. Map environment variables
2. Convert test commands
3. Configure branch naming
4. Set up cleanup schedules
5. Verify cost estimates