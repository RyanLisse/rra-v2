# CI/CD Troubleshooting Guide

This guide helps diagnose and resolve common issues with the CI/CD pipeline and Neon branch management.

## Quick Diagnostics

### Health Check Script

Create this script to quickly diagnose issues:

```bash
#!/bin/bash
# ci-health-check.sh

echo "🔍 CI/CD Health Check"
echo "===================="

# Check Neon API
echo -n "Neon API: "
if curl -s -H "Authorization: Bearer $NEON_API_KEY" \
  https://console.neon.tech/api/v2/users/me > /dev/null; then
  echo "✅ Connected"
else
  echo "❌ Failed"
fi

# Check project access
echo -n "Project Access: "
if curl -s -H "Authorization: Bearer $NEON_API_KEY" \
  "https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID" > /dev/null; then
  echo "✅ Accessible"
else
  echo "❌ Failed"
fi

# List test branches
echo -e "\nTest Branches:"
bun run scripts/list-test-branches.ts --output json | \
  jq -r '.branches[] | select(.name | startswith("ci-test-")) | .name'
```

## Common Issues

### 1. Branch Creation Failures

#### Symptom
```
Error: Failed to create branch: 403 Forbidden
```

#### Causes & Solutions

**API Key Issues**:
```bash
# Verify API key has correct permissions
curl -H "Authorization: Bearer $NEON_API_KEY" \
  https://console.neon.tech/api/v2/users/me

# Should return user info, not 401/403
```

**Project Limits**:
```bash
# Check branch limits
curl -H "Authorization: Bearer $NEON_API_KEY" \
  "https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID" | \
  jq '.project.settings.branch_limit'

# Clean up old branches if at limit
bun run scripts/cleanup-test-branches.ts --max-age-hours 0
```

**Rate Limiting**:
```yaml
# Add retry logic to workflow
- name: Create branch with retry
  uses: nick-fields/retry@v2
  with:
    timeout_minutes: 5
    max_attempts: 3
    command: |
      bun run scripts/create-test-branch.ts \
        --name "$BRANCH_NAME" \
        --parent-branch main
```

### 2. Test Timeouts

#### Symptom
```
Error: Test exceeded timeout of 300000ms
```

#### Solutions

**Database Connection**:
```typescript
// Add connection pooling
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
```

**Test Configuration**:
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    timeout: 60000, // Increase timeout
    retry: 2,       // Add retries
    pool: 'forks',  // Use process isolation
  }
});
```

**Workflow Timeout**:
```yaml
jobs:
  test:
    timeout-minutes: 30  # Increase job timeout
    steps:
      - name: Run tests
        timeout-minutes: 20  # Step timeout
```

### 3. Migration Failures

#### Symptom
```
Error: Migration failed: relation "users" already exists
```

#### Solutions

**Check Migration State**:
```sql
-- Connect to branch database
SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at DESC;
```

**Reset Migrations**:
```bash
# Drop all tables and re-run
DATABASE_URL=<branch-url> bun run db:push --force
```

**Conditional Migrations**:
```sql
-- Make migrations idempotent
CREATE TABLE IF NOT EXISTS users (...);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
```

### 4. Performance Test Failures

#### Symptom
```
Performance regression detected: API response 150% slower
```

#### Debugging Steps

1. **Check Branch Resources**:
```bash
# Get branch compute details
curl -H "Authorization: Bearer $NEON_API_KEY" \
  "https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/branches/$BRANCH_ID"
```

2. **Analyze Query Performance**:
```sql
-- Enable query timing
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM document_embeddings 
WHERE embedding <-> '[...]' < 0.5 
ORDER BY embedding <-> '[...]' 
LIMIT 10;
```

3. **Check Indexes**:
```sql
-- List all indexes
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

### 5. Cleanup Job Failures

#### Symptom
```
Cleanup job failing, branches accumulating
```

#### Solutions

**Manual Cleanup**:
```bash
# Force cleanup all old branches
bun run scripts/list-test-branches.ts --output json | \
  jq -r '.branches[] | select(.name | startswith("ci-test-")) | .id' | \
  xargs -I {} bun run scripts/delete-test-branch.ts --branch-id {} --force
```

**Fix Permissions**:
```yaml
# Ensure workflow has correct permissions
permissions:
  contents: read
  actions: write  # Needed for artifact cleanup
```

### 6. Flaky Tests

#### Symptom
```
Tests pass locally but fail in CI randomly
```

#### Solutions

**Add Test Isolation**:
```typescript
// test-setup.ts
beforeEach(async () => {
  // Clean database state
  await db.execute(sql`TRUNCATE TABLE ${user} CASCADE`);
  
  // Reset connections
  await db.end();
  await db.connect();
});
```

**Stabilize Timing**:
```typescript
// Add wait utilities
async function waitForCondition(
  condition: () => Promise<boolean>,
  timeout = 5000
) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Condition timeout');
}
```

**Debug Flaky Tests**:
```yaml
# Run tests multiple times to catch flakes
- name: Run tests with flake detection
  run: |
    for i in {1..5}; do
      echo "Run $i"
      if ! bun test; then
        echo "Failed on run $i"
        exit 1
      fi
    done
```

## Advanced Debugging

### Enable Verbose Logging

```yaml
# In workflow
env:
  DEBUG: 'neon:*,test:*'
  NODE_OPTIONS: '--trace-warnings'
  ACTIONS_STEP_DEBUG: true
```

### Database Query Logging

```typescript
// Enable query logging
const db = drizzle(sql, {
  logger: {
    logQuery(query, params) {
      console.log('Query:', query);
      console.log('Params:', params);
    }
  }
});
```

### Network Debugging

```bash
# Test Neon connectivity
curl -v -H "Authorization: Bearer $NEON_API_KEY" \
  https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID

# Test database connectivity
psql "$DATABASE_URL" -c "SELECT version();"
```

### Workflow Artifacts

```yaml
# Save debug information
- name: Save debug artifacts
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: debug-logs
    path: |
      test-results/
      logs/
      .next/
```

## Performance Optimization

### Parallel Test Execution

```yaml
# Optimize test sharding
strategy:
  matrix:
    shard: [1, 2, 3, 4, 5, 6, 7, 8]  # More shards
```

### Caching Strategies

```yaml
# Multi-level caching
- name: Cache dependencies
  uses: actions/cache@v4
  with:
    path: |
      ~/.bun/install/cache
      .next/cache
      playwright-browsers/
    key: ${{ runner.os }}-deps-${{ hashFiles('**/bun.lockb') }}
```

### Database Optimization

```sql
-- Add connection pooling
ALTER DATABASE mydb SET connection_limit = 100;

-- Optimize for testing
SET work_mem = '256MB';
SET maintenance_work_mem = '256MB';
```

## Emergency Procedures

### All Tests Failing

1. **Check Neon Status**:
   ```bash
   curl https://status.neon.tech/api/v2/status.json
   ```

2. **Fallback to Local**:
   ```yaml
   # Use local Postgres if Neon is down
   services:
     postgres:
       image: pgvector/pgvector:pg16
       env:
         POSTGRES_PASSWORD: postgres
   ```

### Branch Leak

```bash
# Emergency cleanup script
#!/bin/bash
BRANCHES=$(curl -s -H "Authorization: Bearer $NEON_API_KEY" \
  "https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/branches" | \
  jq -r '.branches[] | select(.name | startswith("ci-test-")) | .id')

for branch in $BRANCHES; do
  echo "Deleting $branch"
  curl -X DELETE -H "Authorization: Bearer $NEON_API_KEY" \
    "https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/branches/$branch"
done
```

### Cost Spike

1. **Immediate Actions**:
   - Reduce branch lifetime
   - Decrease test data size
   - Limit parallel jobs

2. **Long-term Solutions**:
   - Implement branch quotas
   - Add cost alerts
   - Review test efficiency

## Monitoring

### Health Dashboard

Create a monitoring job:

```yaml
name: CI Health Monitor
on:
  schedule:
    - cron: '0 * * * *'  # Hourly
jobs:
  monitor:
    runs-on: ubuntu-latest
    steps:
      - name: Check CI health
        run: |
          # Count active branches
          # Check failure rate
          # Monitor costs
          # Send alerts if needed
```

### Metrics Collection

```typescript
// Collect CI metrics
const metrics = {
  branchCreationTime: Date.now() - startTime,
  testExecutionTime: testEnd - testStart,
  branchCount: await getBranchCount(),
  failureRate: failures / total,
};

// Send to monitoring service
await sendMetrics(metrics);
```

## Getting Help

### Debug Information to Collect

When reporting issues, include:

1. **Workflow logs**: Download from Actions tab
2. **Branch details**: `bun run scripts/list-test-branches.ts --verbose`
3. **Error messages**: Full stack traces
4. **Environment**: OS, Bun version, Node version
5. **Configuration**: Sanitized env vars and settings

### Support Channels

- GitHub Issues: For bugs and feature requests
- Discussions: For questions and help
- Neon Support: For database-specific issues