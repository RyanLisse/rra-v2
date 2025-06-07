# Performance Optimization Guide

This guide provides strategies for optimizing CI/CD performance and reducing costs while maintaining test quality.

## Performance Metrics

### Key Performance Indicators (KPIs)

| Metric | Target | Current Baseline |
|--------|--------|------------------|
| Branch Creation Time | < 10s | ~15s |
| Total Test Duration | < 10 min | ~15 min |
| Cost per Test Run | < $0.10 | ~$0.15 |
| Parallel Efficiency | > 80% | ~70% |
| Cache Hit Rate | > 90% | ~85% |

## Optimization Strategies

### 1. Branch Creation Optimization

#### Pre-warmed Branches

```typescript
// scripts/prewarm-branches.ts
import { NeonClient } from './lib/neon-client';

const POOL_SIZE = 5;
const POOL_PREFIX = 'pool-ready';

async function maintainBranchPool() {
  const client = new NeonClient();
  const branches = await client.listBranches();
  
  const readyBranches = branches.filter(b => 
    b.name.startsWith(POOL_PREFIX) && 
    b.status === 'ready'
  );
  
  const needed = POOL_SIZE - readyBranches.length;
  
  for (let i = 0; i < needed; i++) {
    await client.createBranch({
      name: `${POOL_PREFIX}-${Date.now()}`,
      parent: 'main',
      copyData: true
    });
  }
}

// Run every hour
setInterval(maintainBranchPool, 3600000);
```

#### Workflow Integration

```yaml
- name: Get pre-warmed branch
  id: get_branch
  run: |
    # Try to claim a pre-warmed branch
    BRANCH=$(bun run scripts/claim-pooled-branch.ts)
    if [ -n "$BRANCH" ]; then
      echo "branch_id=$BRANCH" >> $GITHUB_OUTPUT
      echo "prewarmed=true" >> $GITHUB_OUTPUT
    else
      echo "prewarmed=false" >> $GITHUB_OUTPUT
    fi

- name: Create branch if needed
  if: steps.get_branch.outputs.prewarmed != 'true'
  run: |
    # Fallback to regular creation
    bun run scripts/create-test-branch.ts
```

### 2. Test Execution Optimization

#### Intelligent Test Sharding

```typescript
// scripts/optimize-shards.ts
interface TestTiming {
  file: string;
  duration: number;
}

function optimizeShards(timings: TestTiming[], shardCount: number) {
  // Sort tests by duration (longest first)
  const sorted = timings.sort((a, b) => b.duration - a.duration);
  
  // Initialize shards
  const shards: TestTiming[][] = Array(shardCount).fill([]).map(() => []);
  const shardTimes = new Array(shardCount).fill(0);
  
  // Distribute tests using bin packing algorithm
  for (const test of sorted) {
    // Find shard with minimum total time
    const minIndex = shardTimes.indexOf(Math.min(...shardTimes));
    shards[minIndex].push(test);
    shardTimes[minIndex] += test.duration;
  }
  
  return shards;
}
```

#### Dynamic Parallelism

```yaml
- name: Determine optimal parallelism
  id: parallelism
  run: |
    # Base on available resources and test count
    CPU_COUNT=$(nproc)
    TEST_COUNT=$(find tests -name "*.test.ts" | wc -l)
    
    # Calculate optimal shard count
    if [ $TEST_COUNT -lt 10 ]; then
      SHARDS=1
    elif [ $TEST_COUNT -lt 50 ]; then
      SHARDS=$(($CPU_COUNT / 2))
    else
      SHARDS=$CPU_COUNT
    fi
    
    echo "shards=$SHARDS" >> $GITHUB_OUTPUT

- name: Run tests
  strategy:
    matrix:
      shard: ${{ fromJson(steps.parallelism.outputs.shards) }}
```

### 3. Caching Strategies

#### Multi-Level Cache

```yaml
- name: Restore caches
  uses: actions/cache@v4
  with:
    path: |
      ~/.bun/install/cache     # Bun packages
      .next/cache              # Next.js build cache
      playwright-browsers/     # Playwright browsers
      test-results/cache/      # Test result cache
    key: |
      cache-${{ runner.os }}-${{ hashFiles('**/bun.lockb') }}-${{ hashFiles('**/*.ts') }}
    restore-keys: |
      cache-${{ runner.os }}-${{ hashFiles('**/bun.lockb') }}-
      cache-${{ runner.os }}-
```

#### Selective Test Execution

```typescript
// scripts/detect-changes.ts
import { execSync } from 'child_process';

function getChangedFiles(base: string = 'main'): string[] {
  const output = execSync(`git diff --name-only ${base}...HEAD`);
  return output.toString().trim().split('\n');
}

function getAffectedTests(changedFiles: string[]): string[] {
  const testMap = {
    'lib/db/': ['tests/db/**/*.test.ts'],
    'app/api/': ['tests/api/**/*.test.ts'],
    'components/': ['tests/components/**/*.test.ts'],
  };
  
  const affectedTests = new Set<string>();
  
  for (const file of changedFiles) {
    for (const [pattern, tests] of Object.entries(testMap)) {
      if (file.startsWith(pattern)) {
        tests.forEach(t => affectedTests.add(t));
      }
    }
  }
  
  return Array.from(affectedTests);
}
```

### 4. Database Optimization

#### Connection Pooling

```typescript
// lib/db/test-pool.ts
import { Pool } from 'pg';

const pools = new Map<string, Pool>();

export function getTestPool(branchId: string): Pool {
  if (!pools.has(branchId)) {
    pools.set(branchId, new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    }));
  }
  return pools.get(branchId)!;
}

// Clean up after tests
export async function cleanupPools() {
  for (const pool of pools.values()) {
    await pool.end();
  }
  pools.clear();
}
```

#### Optimized Test Data

```sql
-- Create minimal indexes for tests
CREATE INDEX CONCURRENTLY idx_test_lookup ON documents(user_id, created_at);
CREATE INDEX CONCURRENTLY idx_test_search ON chunks USING GIN(to_tsvector('english', content));

-- Disable unnecessary constraints in test
ALTER TABLE documents DROP CONSTRAINT IF EXISTS check_file_size;

-- Use unlogged tables for temporary test data
CREATE UNLOGGED TABLE test_temp_data AS SELECT * FROM production_data LIMIT 1000;
```

### 5. Build Optimization

#### Incremental Builds

```typescript
// next.config.ts
export default {
  experimental: {
    incrementalCacheHandlerPath: './cache-handler.js',
    isrMemoryCacheSize: 0, // Disable in CI
  },
  
  // Optimize for CI
  eslint: {
    ignoreDuringBuilds: process.env.CI === 'true',
  },
  
  typescript: {
    ignoreBuildErrors: process.env.CI === 'true',
  },
  
  // Reduce build output
  compress: false,
  productionBrowserSourceMaps: false,
};
```

#### Parallel Build Tasks

```json
// package.json
{
  "scripts": {
    "build:parallel": "concurrently \"bun run build:app\" \"bun run build:tests\"",
    "build:app": "next build",
    "build:tests": "tsc --noEmit -p tests/tsconfig.json"
  }
}
```

### 6. Resource Management

#### Compute Right-Sizing

```yaml
jobs:
  test:
    runs-on: ${{ matrix.runner }}
    strategy:
      matrix:
        include:
          - test-type: unit
            runner: ubuntu-latest
          - test-type: integration
            runner: ubuntu-latest-4-cores
          - test-type: e2e
            runner: ubuntu-latest-8-cores
```

#### Memory Management

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
        isolate: true,
      }
    },
    // Limit memory per test
    maxConcurrency: 2,
    teardownTimeout: 10000,
  }
});
```

## Cost Optimization

### 1. Branch Lifecycle Management

```yaml
# Aggressive cleanup for cost savings
env:
  BRANCH_LIFETIME_MINUTES: 20  # Shorter lifetime
  CLEANUP_BATCH_SIZE: 10       # Process more at once
```

### 2. Test Data Optimization

```typescript
// Use smaller datasets for most tests
const TEST_PRESETS = {
  micro: { documents: 10, chunks: 50 },     // Most unit tests
  mini: { documents: 50, chunks: 250 },     // Integration tests
  standard: { documents: 200, chunks: 1000 }, // E2E tests
};
```

### 3. Smart Scheduling

```yaml
# Run expensive tests only when needed
on:
  push:
    branches: [main]
    paths-ignore:
      - 'docs/**'
      - '*.md'
  schedule:
    # Full test suite only twice daily
    - cron: '0 6,18 * * *'
```

## Monitoring and Analysis

### Performance Dashboard

```typescript
// scripts/analyze-ci-performance.ts
interface CIRun {
  workflow: string;
  duration: number;
  cost: number;
  status: 'success' | 'failure';
}

async function generatePerformanceReport(runs: CIRun[]) {
  const report = {
    avgDuration: avg(runs.map(r => r.duration)),
    p95Duration: percentile(runs.map(r => r.duration), 95),
    successRate: runs.filter(r => r.status === 'success').length / runs.length,
    totalCost: sum(runs.map(r => r.cost)),
    costPerRun: avg(runs.map(r => r.cost)),
  };
  
  // Identify bottlenecks
  const slowRuns = runs.filter(r => r.duration > report.p95Duration);
  
  return { report, bottlenecks: slowRuns };
}
```

### Continuous Improvement

```yaml
# Weekly performance review
name: Performance Analysis
on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly
jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - name: Collect metrics
        run: |
          # Gather performance data
          # Generate reports
          # Create optimization PRs
```

## Best Practices

### 1. Test Efficiency

- Write focused tests that test one thing
- Use test fixtures to avoid repeated setup
- Mock external services in unit tests
- Parallelize independent test suites

### 2. Resource Usage

- Clean up resources immediately after use
- Use connection pooling for database access
- Implement proper test isolation
- Monitor memory usage in long-running tests

### 3. Caching Strategy

- Cache dependencies aggressively
- Use content-based cache keys
- Implement cache warming for critical paths
- Monitor cache hit rates

### 4. Failure Recovery

- Implement automatic retries for flaky tests
- Use circuit breakers for external services
- Collect detailed logs for failures
- Implement graceful degradation

## Optimization Checklist

- [ ] Branch pool implemented
- [ ] Test sharding optimized
- [ ] Caching strategy defined
- [ ] Database indexes created
- [ ] Build process parallelized
- [ ] Resource limits configured
- [ ] Monitoring dashboards created
- [ ] Cost alerts configured
- [ ] Performance baselines established
- [ ] Regular optimization reviews scheduled