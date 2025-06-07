# Performance Testing Guide with Enhanced Neon Infrastructure

This comprehensive guide covers performance testing strategies, patterns, and best practices using the Enhanced Neon Testing Infrastructure.

## Table of Contents

1. [Introduction](#introduction)
2. [Performance Testing Fundamentals](#performance-testing-fundamentals)
3. [Load Testing Patterns](#load-testing-patterns)
4. [Stress Testing](#stress-testing)
5. [Concurrency Testing](#concurrency-testing)
6. [Database Performance Testing](#database-performance-testing)
7. [API Performance Testing](#api-performance-testing)
8. [Memory and Resource Testing](#memory-and-resource-testing)
9. [Performance Monitoring](#performance-monitoring)
10. [Optimization Strategies](#optimization-strategies)
11. [CI/CD Integration](#cicd-integration)
12. [Best Practices](#best-practices)

## Introduction

Performance testing with Neon branches provides unique advantages:

- **Isolated Testing**: Each performance test runs in its own database branch
- **Consistent Baselines**: Fresh database state for each test run
- **Parallel Execution**: Run multiple performance tests simultaneously
- **Real Database Performance**: Test against actual PostgreSQL instances
- **Cost Effective**: Pay only for active test duration

## Performance Testing Fundamentals

### Key Metrics to Measure

```typescript
interface PerformanceMetrics {
  // Response Time Metrics
  responseTime: {
    min: number;
    max: number;
    mean: number;
    median: number;
    p95: number;
    p99: number;
  };
  
  // Throughput Metrics
  throughput: {
    requestsPerSecond: number;
    transactionsPerSecond: number;
    bytesPerSecond: number;
  };
  
  // Resource Utilization
  resources: {
    cpuUsage: number;
    memoryUsage: number;
    connectionCount: number;
    activeQueries: number;
  };
  
  // Error Metrics
  errors: {
    totalErrors: number;
    errorRate: number;
    errorTypes: Record<string, number>;
  };
}
```

### Basic Performance Test Setup

```typescript
import { describe, it } from 'vitest';
import { getNeonApiClient } from '@/lib/testing/neon-api-client';
import { PerformanceTimer, MetricsCollector } from '@/utils/performance';

describe('Performance Tests', () => {
  const client = getNeonApiClient();
  const metrics = new MetricsCollector();

  it('should measure basic operation performance', async () => {
    await client.withTestBranch(
      {
        testSuite: 'perf-basic',
        purpose: 'performance-testing',
        tags: ['performance', 'baseline']
      },
      async (branchInfo) => {
        // Setup
        await setupPerformanceSchema(client, branchInfo.branchId);
        
        // Warmup
        await warmupDatabase(client, branchInfo.branchId);
        
        // Test
        const timer = new PerformanceTimer();
        const iterations = 1000;
        
        for (let i = 0; i < iterations; i++) {
          timer.start(`operation_${i}`);
          
          await client.executeSql(
            `INSERT INTO performance_test (data) VALUES ($1)`,
            branchInfo.branchId,
            { values: [{ iteration: i, timestamp: Date.now() }] }
          );
          
          timer.end(`operation_${i}`);
          metrics.record('insert', timer.getElapsed(`operation_${i}`));
        }
        
        // Analyze
        const stats = metrics.getStatistics('insert');
        console.log('Performance Statistics:', stats);
        
        // Assert performance requirements
        expect(stats.mean).toBeLessThan(50); // Average < 50ms
        expect(stats.p95).toBeLessThan(100); // 95th percentile < 100ms
        expect(stats.p99).toBeLessThan(200); // 99th percentile < 200ms
      }
    );
  });
});
```

## Load Testing Patterns

### Gradual Load Testing

```typescript
import { describe, it } from 'vitest';
import { getNeonApiClient } from '@/lib/testing/neon-api-client';
import pLimit from 'p-limit';

describe('Load Testing', () => {
  const client = getNeonApiClient();

  it('should handle gradually increasing load', async () => {
    await client.withTestBranch(
      {
        testSuite: 'gradual-load',
        purpose: 'load-testing',
        tags: ['performance', 'load']
      },
      async (branchInfo) => {
        // Setup schema
        await client.executeTransaction([
          `CREATE TABLE users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) UNIQUE,
            email VARCHAR(255) UNIQUE,
            created_at TIMESTAMP DEFAULT NOW()
          )`,
          `CREATE INDEX idx_users_username ON users(username)`,
          `CREATE INDEX idx_users_email ON users(email)`
        ], branchInfo.branchId);

        // Load test configuration
        const stages = [
          { duration: 10, usersPerSecond: 1 },
          { duration: 30, usersPerSecond: 5 },
          { duration: 60, usersPerSecond: 10 },
          { duration: 60, usersPerSecond: 20 },
          { duration: 30, usersPerSecond: 5 },
          { duration: 10, usersPerSecond: 1 }
        ];

        const results = {
          successful: 0,
          failed: 0,
          responseTimes: [] as number[],
          errors: [] as any[]
        };

        // Execute load test
        for (const stage of stages) {
          console.log(`Stage: ${stage.usersPerSecond} users/second for ${stage.duration}s`);
          
          const stageStart = Date.now();
          const stageEnd = stageStart + (stage.duration * 1000);
          
          while (Date.now() < stageEnd) {
            const batchStart = Date.now();
            const limit = pLimit(stage.usersPerSecond);
            
            // Create concurrent users
            const userPromises = Array.from({ length: stage.usersPerSecond }, (_, i) =>
              limit(async () => {
                const operationStart = Date.now();
                const userId = `${Date.now()}_${i}`;
                
                try {
                  await client.executeSql(
                    `INSERT INTO users (username, email) 
                     VALUES ($1, $2)`,
                    branchInfo.branchId,
                    {
                      values: [
                        `user_${userId}`,
                        `user_${userId}@example.com`
                      ]
                    }
                  );
                  
                  results.successful++;
                  results.responseTimes.push(Date.now() - operationStart);
                } catch (error) {
                  results.failed++;
                  results.errors.push({
                    timestamp: Date.now(),
                    error: error.message,
                    stage: stage.usersPerSecond
                  });
                }
              })
            );

            await Promise.all(userPromises);
            
            // Wait for next second
            const elapsed = Date.now() - batchStart;
            if (elapsed < 1000) {
              await new Promise(resolve => setTimeout(resolve, 1000 - elapsed));
            }
          }
        }

        // Analyze results
        const analysis = analyzeLoadTestResults(results);
        console.log('Load Test Analysis:', analysis);

        // Verify SLAs
        expect(analysis.successRate).toBeGreaterThan(0.99); // 99% success rate
        expect(analysis.avgResponseTime).toBeLessThan(100); // < 100ms average
        expect(analysis.p95ResponseTime).toBeLessThan(200); // < 200ms p95
      }
    );
  });
});

function analyzeLoadTestResults(results: any) {
  const sorted = [...results.responseTimes].sort((a, b) => a - b);
  
  return {
    totalRequests: results.successful + results.failed,
    successful: results.successful,
    failed: results.failed,
    successRate: results.successful / (results.successful + results.failed),
    avgResponseTime: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    minResponseTime: sorted[0],
    maxResponseTime: sorted[sorted.length - 1],
    p50ResponseTime: sorted[Math.floor(sorted.length * 0.5)],
    p95ResponseTime: sorted[Math.floor(sorted.length * 0.95)],
    p99ResponseTime: sorted[Math.floor(sorted.length * 0.99)],
    errors: results.errors
  };
}
```

### Spike Testing

```typescript
describe('Spike Testing', () => {
  it('should handle sudden traffic spikes', async () => {
    const client = getNeonApiClient();
    
    await client.withTestBranch(
      {
        testSuite: 'spike-test',
        purpose: 'spike-testing',
        tags: ['performance', 'spike']
      },
      async (branchInfo) => {
        // Setup
        await setupApiSchema(client, branchInfo.branchId);
        
        // Baseline load
        const baselineLoad = 10; // requests/second
        const spikeLoad = 100; // 10x spike
        const testDuration = 300; // 5 minutes
        
        const timeline = [
          { start: 0, end: 60, load: baselineLoad },
          { start: 60, end: 90, load: spikeLoad }, // 30s spike
          { start: 90, end: 150, load: baselineLoad },
          { start: 150, end: 180, load: spikeLoad }, // Another spike
          { start: 180, end: 300, load: baselineLoad }
        ];
        
        const results = new Map<number, any[]>();
        
        // Execute spike test
        const testStart = Date.now();
        
        for (const phase of timeline) {
          const phaseEnd = testStart + (phase.end * 1000);
          
          while (Date.now() < phaseEnd) {
            const currentSecond = Math.floor((Date.now() - testStart) / 1000);
            
            if (currentSecond >= phase.start && currentSecond < phase.end) {
              const requests = await executeLoadBatch(
                client,
                branchInfo.branchId,
                phase.load
              );
              
              if (!results.has(currentSecond)) {
                results.set(currentSecond, []);
              }
              results.get(currentSecond)!.push(...requests);
              
              await waitForNextSecond();
            }
          }
        }
        
        // Analyze spike behavior
        const spikeAnalysis = analyzeSpikeTest(results, timeline);
        console.log('Spike Test Analysis:', spikeAnalysis);
        
        // Verify system recovered from spikes
        expect(spikeAnalysis.recoveryTime).toBeLessThan(10); // Recovery within 10s
        expect(spikeAnalysis.errorRateDuringSpike).toBeLessThan(0.05); // < 5% errors
      }
    );
  });
});
```

## Stress Testing

### Database Connection Pool Stress Test

```typescript
describe('Stress Testing', () => {
  it('should handle connection pool exhaustion', async () => {
    const client = getNeonApiClient();
    
    await client.withTestBranch(
      {
        testSuite: 'connection-stress',
        purpose: 'stress-testing',
        tags: ['stress', 'connections']
      },
      async (branchInfo) => {
        const maxConnections = 100; // Typical PostgreSQL default
        const testConnections = maxConnections + 50; // Exceed limit
        
        const connections = [];
        const results = {
          successful: 0,
          failed: 0,
          connectionTimes: [] as number[],
          errors: [] as any[]
        };
        
        // Try to create many connections
        const connectionPromises = Array.from({ length: testConnections }, async (_, i) => {
          const start = Date.now();
          
          try {
            const sql = postgres(branchInfo.connectionString, {
              max: 1,
              timeout: 5
            });
            
            connections.push(sql);
            
            // Execute a query to ensure connection is active
            await sql`SELECT current_timestamp`;
            
            results.successful++;
            results.connectionTimes.push(Date.now() - start);
          } catch (error) {
            results.failed++;
            results.errors.push({
              connectionIndex: i,
              error: error.message,
              afterMs: Date.now() - start
            });
          }
        });
        
        await Promise.allSettled(connectionPromises);
        
        // Analyze connection stress
        console.log(`Connection Stress Results:
          Attempted: ${testConnections}
          Successful: ${results.successful}
          Failed: ${results.failed}
          Avg Connection Time: ${average(results.connectionTimes).toFixed(2)}ms
          Connection Success Rate: ${(results.successful / testConnections * 100).toFixed(2)}%
        `);
        
        // Cleanup connections
        await Promise.all(connections.map(sql => sql.end()));
        
        // Verify graceful degradation
        expect(results.successful).toBeGreaterThan(50); // At least some connections succeed
        expect(results.errors.some(e => e.error.includes('connection'))).toBe(true);
      }
    );
  });

  it('should handle memory pressure', async () => {
    const client = getNeonApiClient();
    
    await client.withTestBranch(
      {
        testSuite: 'memory-stress',
        purpose: 'stress-testing',
        tags: ['stress', 'memory']
      },
      async (branchInfo) => {
        // Create table with large data
        await client.executeSql(`
          CREATE TABLE large_data (
            id SERIAL PRIMARY KEY,
            payload TEXT,
            metadata JSONB
          )
        `, branchInfo.branchId);
        
        // Generate large payloads
        const payloadSize = 1024 * 1024; // 1MB per row
        const rowCount = 100;
        
        const memoryBefore = process.memoryUsage();
        
        // Insert large data
        for (let i = 0; i < rowCount; i++) {
          const largePayload = 'x'.repeat(payloadSize);
          const metadata = {
            index: i,
            size: payloadSize,
            timestamp: Date.now()
          };
          
          await client.executeSql(
            `INSERT INTO large_data (payload, metadata) VALUES ($1, $2)`,
            branchInfo.branchId,
            { values: [largePayload, metadata] }
          );
          
          // Monitor memory growth
          if (i % 10 === 0) {
            const currentMemory = process.memoryUsage();
            console.log(`After ${i} inserts:
              Heap Used: ${(currentMemory.heapUsed / 1024 / 1024).toFixed(2)}MB
              External: ${(currentMemory.external / 1024 / 1024).toFixed(2)}MB
            `);
          }
        }
        
        const memoryAfter = process.memoryUsage();
        const memoryGrowth = {
          heapUsed: memoryAfter.heapUsed - memoryBefore.heapUsed,
          external: memoryAfter.external - memoryBefore.external
        };
        
        console.log(`Memory Growth:
          Heap: ${(memoryGrowth.heapUsed / 1024 / 1024).toFixed(2)}MB
          External: ${(memoryGrowth.external / 1024 / 1024).toFixed(2)}MB
        `);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
          
          const memoryAfterGC = process.memoryUsage();
          console.log(`After GC:
            Heap Used: ${(memoryAfterGC.heapUsed / 1024 / 1024).toFixed(2)}MB
          `);
        }
      }
    );
  });
});
```

## Concurrency Testing

### Optimistic Locking Performance

```typescript
describe('Concurrency Performance', () => {
  it('should handle optimistic locking efficiently', async () => {
    const client = getNeonApiClient();
    
    await client.withTestBranch(
      {
        testSuite: 'optimistic-locking',
        purpose: 'concurrency-testing',
        tags: ['concurrency', 'locking']
      },
      async (branchInfo) => {
        // Setup versioned table
        await client.executeSql(`
          CREATE TABLE inventory (
            id SERIAL PRIMARY KEY,
            product_id VARCHAR(50) UNIQUE,
            quantity INTEGER NOT NULL CHECK (quantity >= 0),
            version INTEGER NOT NULL DEFAULT 1,
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `, branchInfo.branchId);
        
        // Insert test products
        const products = Array.from({ length: 10 }, (_, i) => ({
          id: `PROD-${i}`,
          quantity: 1000
        }));
        
        for (const product of products) {
          await client.executeSql(
            `INSERT INTO inventory (product_id, quantity) VALUES ($1, $2)`,
            branchInfo.branchId,
            { values: [product.id, product.quantity] }
          );
        }
        
        // Concurrent updates with optimistic locking
        const concurrentUsers = 50;
        const updatesPerUser = 20;
        
        const results = {
          successful: 0,
          conflicts: 0,
          retries: 0,
          timings: [] as number[]
        };
        
        const updateWithOptimisticLock = async (productId: string, quantity: number) => {
          let retries = 0;
          const maxRetries = 5;
          
          while (retries < maxRetries) {
            const start = Date.now();
            
            try {
              // Read current state
              const readResult = await client.executeSql(
                `SELECT quantity, version FROM inventory WHERE product_id = $1`,
                branchInfo.branchId,
                { values: [productId] }
              );
              
              const current = readResult.data.rows[0];
              const newQuantity = current.quantity - quantity;
              
              if (newQuantity < 0) {
                throw new Error('Insufficient inventory');
              }
              
              // Update with version check
              const updateResult = await client.executeSql(
                `UPDATE inventory 
                 SET quantity = $1, version = version + 1, updated_at = NOW()
                 WHERE product_id = $2 AND version = $3
                 RETURNING *`,
                branchInfo.branchId,
                { values: [newQuantity, productId, current.version] }
              );
              
              if (updateResult.data.rowCount === 0) {
                // Version conflict
                results.conflicts++;
                retries++;
                results.retries++;
                
                // Exponential backoff
                await new Promise(resolve => 
                  setTimeout(resolve, Math.min(100 * Math.pow(2, retries), 1000))
                );
                continue;
              }
              
              results.successful++;
              results.timings.push(Date.now() - start);
              return true;
              
            } catch (error) {
              if (retries === maxRetries - 1) {
                throw error;
              }
              retries++;
            }
          }
          
          return false;
        };
        
        // Execute concurrent updates
        const startTime = Date.now();
        
        const updatePromises = Array.from({ length: concurrentUsers }, async (_, userId) => {
          for (let i = 0; i < updatesPerUser; i++) {
            const productId = products[Math.floor(Math.random() * products.length)].id;
            const quantity = Math.floor(Math.random() * 5) + 1;
            
            await updateWithOptimisticLock(productId, quantity);
          }
        });
        
        await Promise.all(updatePromises);
        
        const totalTime = Date.now() - startTime;
        
        // Analyze concurrency performance
        const analysis = {
          totalOperations: concurrentUsers * updatesPerUser,
          successful: results.successful,
          conflicts: results.conflicts,
          conflictRate: results.conflicts / (results.successful + results.conflicts),
          avgRetries: results.retries / results.conflicts,
          throughput: results.successful / (totalTime / 1000),
          avgLatency: average(results.timings),
          p95Latency: percentile(results.timings, 0.95)
        };
        
        console.log('Optimistic Locking Performance:', analysis);
        
        // Verify performance
        expect(analysis.conflictRate).toBeLessThan(0.2); // < 20% conflicts
        expect(analysis.throughput).toBeGreaterThan(100); // > 100 ops/sec
      }
    );
  });

  it('should test deadlock detection and recovery', async () => {
    const client = getNeonApiClient();
    
    await client.withTestBranch(
      {
        testSuite: 'deadlock-testing',
        purpose: 'concurrency-testing',
        tags: ['concurrency', 'deadlock']
      },
      async (branchInfo) => {
        // Setup tables for deadlock scenario
        await client.executeTransaction([
          `CREATE TABLE accounts (
            id SERIAL PRIMARY KEY,
            balance DECIMAL(10,2) NOT NULL CHECK (balance >= 0)
          )`,
          `INSERT INTO accounts (id, balance) VALUES (1, 1000), (2, 1000)`
        ], branchInfo.branchId);
        
        const deadlockResults = {
          detected: 0,
          successful: 0,
          failed: 0
        };
        
        // Create potential deadlock scenarios
        const transfer1to2 = async () => {
          try {
            await client.executeTransaction([
              'BEGIN',
              'UPDATE accounts SET balance = balance - 100 WHERE id = 1',
              'SELECT pg_sleep(0.1)', // Small delay to increase deadlock chance
              'UPDATE accounts SET balance = balance + 100 WHERE id = 2',
              'COMMIT'
            ], branchInfo.branchId);
            deadlockResults.successful++;
          } catch (error) {
            if (error.message.includes('deadlock')) {
              deadlockResults.detected++;
            } else {
              deadlockResults.failed++;
            }
          }
        };
        
        const transfer2to1 = async () => {
          try {
            await client.executeTransaction([
              'BEGIN',
              'UPDATE accounts SET balance = balance - 100 WHERE id = 2',
              'SELECT pg_sleep(0.1)', // Small delay to increase deadlock chance
              'UPDATE accounts SET balance = balance + 100 WHERE id = 1',
              'COMMIT'
            ], branchInfo.branchId);
            deadlockResults.successful++;
          } catch (error) {
            if (error.message.includes('deadlock')) {
              deadlockResults.detected++;
            } else {
              deadlockResults.failed++;
            }
          }
        };
        
        // Run concurrent transactions that may deadlock
        const iterations = 100;
        const promises = [];
        
        for (let i = 0; i < iterations; i++) {
          promises.push(transfer1to2());
          promises.push(transfer2to1());
        }
        
        await Promise.all(promises);
        
        console.log('Deadlock Testing Results:', deadlockResults);
        
        // Verify final state consistency
        const finalBalances = await client.executeSql(
          'SELECT * FROM accounts ORDER BY id',
          branchInfo.branchId
        );
        
        const totalBalance = finalBalances.data.rows.reduce(
          (sum, row) => sum + parseFloat(row.balance),
          0
        );
        
        expect(totalBalance).toBe(2000); // Money conserved
        expect(deadlockResults.detected).toBeGreaterThan(0); // Some deadlocks detected
      }
    );
  });
});
```

## Database Performance Testing

### Query Performance Analysis

```typescript
describe('Database Performance', () => {
  it('should analyze query performance patterns', async () => {
    const client = getNeonApiClient();
    
    await client.withTestBranch(
      {
        testSuite: 'query-performance',
        purpose: 'db-performance',
        tags: ['performance', 'queries']
      },
      async (branchInfo) => {
        // Create test schema with various patterns
        await createComplexSchema(client, branchInfo.branchId);
        
        // Insert test data
        await insertPerformanceTestData(client, branchInfo.branchId, {
          users: 10000,
          posts: 50000,
          comments: 200000
        });
        
        // Test queries
        const queries = [
          {
            name: 'Simple Index Scan',
            sql: 'SELECT * FROM users WHERE email = $1',
            params: ['user5000@example.com']
          },
          {
            name: 'Join with Index',
            sql: `SELECT u.*, COUNT(p.id) as post_count
                  FROM users u
                  LEFT JOIN posts p ON p.user_id = u.id
                  WHERE u.created_at > NOW() - INTERVAL '30 days'
                  GROUP BY u.id
                  LIMIT 100`
          },
          {
            name: 'Complex Aggregation',
            sql: `SELECT 
                    DATE_TRUNC('day', p.created_at) as day,
                    COUNT(DISTINCT p.user_id) as unique_authors,
                    COUNT(p.id) as total_posts,
                    AVG(LENGTH(p.content)) as avg_post_length,
                    COUNT(c.id) as total_comments
                  FROM posts p
                  LEFT JOIN comments c ON c.post_id = p.id
                  WHERE p.created_at > NOW() - INTERVAL '7 days'
                  GROUP BY DATE_TRUNC('day', p.created_at)
                  ORDER BY day DESC`
          },
          {
            name: 'Full Text Search',
            sql: `SELECT id, title, ts_rank(search_vector, query) as rank
                  FROM posts, plainto_tsquery('english', $1) query
                  WHERE search_vector @@ query
                  ORDER BY rank DESC
                  LIMIT 20`,
            params: ['database performance']
          },
          {
            name: 'Window Function',
            sql: `SELECT 
                    user_id,
                    created_at,
                    content,
                    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn,
                    LAG(created_at) OVER (PARTITION BY user_id ORDER BY created_at) as prev_post_time
                  FROM posts
                  WHERE user_id IN (SELECT id FROM users ORDER BY created_at DESC LIMIT 100)`
          },
          {
            name: 'CTE with Recursion',
            sql: `WITH RECURSIVE comment_tree AS (
                    SELECT id, post_id, parent_id, content, 0 as level
                    FROM comments
                    WHERE parent_id IS NULL AND post_id = $1
                    
                    UNION ALL
                    
                    SELECT c.id, c.post_id, c.parent_id, c.content, ct.level + 1
                    FROM comments c
                    JOIN comment_tree ct ON c.parent_id = ct.id
                  )
                  SELECT * FROM comment_tree ORDER BY level, id`,
            params: [1000]
          }
        ];
        
        // Execute and analyze each query
        const performanceResults = [];
        
        for (const query of queries) {
          console.log(`\nTesting: ${query.name}`);
          
          // Get execution plan
          const explainResult = await client.executeSql(
            `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.sql}`,
            branchInfo.branchId,
            { values: query.params }
          );
          
          const plan = explainResult.data.rows[0]['QUERY PLAN'][0];
          
          // Run query multiple times for timing
          const timings = [];
          const iterations = 10;
          
          for (let i = 0; i < iterations; i++) {
            const start = Date.now();
            
            await client.executeSql(
              query.sql,
              branchInfo.branchId,
              { values: query.params }
            );
            
            timings.push(Date.now() - start);
          }
          
          // Analyze results
          const result = {
            query: query.name,
            planningTime: plan['Planning Time'],
            executionTime: plan['Execution Time'],
            totalTime: plan['Planning Time'] + plan['Execution Time'],
            buffers: plan['Plan']['Shared Hit Blocks'] || 0,
            avgClientTime: average(timings),
            minClientTime: Math.min(...timings),
            maxClientTime: Math.max(...timings),
            stdDev: standardDeviation(timings)
          };
          
          performanceResults.push(result);
          
          // Log detailed plan for slow queries
          if (result.totalTime > 100) {
            console.log('Slow query plan:', JSON.stringify(plan, null, 2));
          }
        }
        
        // Summary report
        console.table(performanceResults);
        
        // Performance assertions
        performanceResults.forEach(result => {
          expect(result.avgClientTime).toBeLessThan(1000); // < 1 second
          expect(result.stdDev).toBeLessThan(result.avgClientTime * 0.5); // Consistent
        });
      }
    );
  });

  it('should test index performance impact', async () => {
    const client = getNeonApiClient();
    
    await client.withTestBranch(
      {
        testSuite: 'index-performance',
        purpose: 'index-testing',
        tags: ['performance', 'indexes']
      },
      async (branchInfo) => {
        // Create table without indexes
        await client.executeSql(`
          CREATE TABLE events (
            id SERIAL PRIMARY KEY,
            user_id INTEGER,
            event_type VARCHAR(50),
            event_data JSONB,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `, branchInfo.branchId);
        
        // Insert test data
        const eventCount = 100000;
        const userCount = 1000;
        const eventTypes = ['login', 'logout', 'purchase', 'view', 'click'];
        
        console.log(`Inserting ${eventCount} events...`);
        
        const batchSize = 1000;
        for (let i = 0; i < eventCount; i += batchSize) {
          const values = Array.from({ length: Math.min(batchSize, eventCount - i) }, (_, j) => {
            const userId = Math.floor(Math.random() * userCount) + 1;
            const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
            const eventData = {
              index: i + j,
              userId,
              sessionId: `session_${userId}_${Math.floor(Math.random() * 100)}`,
              metadata: { timestamp: Date.now() }
            };
            
            return `(${userId}, '${eventType}', '${JSON.stringify(eventData)}'::jsonb)`;
          }).join(',');
          
          await client.executeSql(
            `INSERT INTO events (user_id, event_type, event_data) VALUES ${values}`,
            branchInfo.branchId
          );
        }
        
        // Test queries without indexes
        const testQueries = [
          {
            name: 'Filter by user_id',
            sql: 'SELECT COUNT(*) FROM events WHERE user_id = $1',
            params: [500]
          },
          {
            name: 'Filter by event_type',
            sql: 'SELECT COUNT(*) FROM events WHERE event_type = $1',
            params: ['purchase']
          },
          {
            name: 'Filter by date range',
            sql: `SELECT COUNT(*) FROM events 
                  WHERE created_at > NOW() - INTERVAL '1 hour'`
          },
          {
            name: 'JSONB query',
            sql: `SELECT COUNT(*) FROM events 
                  WHERE event_data->>'userId' = $1`,
            params: ['500']
          }
        ];
        
        // Measure performance without indexes
        console.log('\n=== Performance WITHOUT indexes ===');
        const noIndexResults = await measureQueryPerformance(
          client,
          branchInfo.branchId,
          testQueries
        );
        
        // Add indexes
        console.log('\nAdding indexes...');
        await client.executeTransaction([
          'CREATE INDEX idx_events_user_id ON events(user_id)',
          'CREATE INDEX idx_events_event_type ON events(event_type)',
          'CREATE INDEX idx_events_created_at ON events(created_at)',
          'CREATE INDEX idx_events_user_jsonb ON events((event_data->>\'userId\'))'
        ], branchInfo.branchId);
        
        // Analyze tables to update statistics
        await client.executeSql('ANALYZE events', branchInfo.branchId);
        
        // Measure performance with indexes
        console.log('\n=== Performance WITH indexes ===');
        const withIndexResults = await measureQueryPerformance(
          client,
          branchInfo.branchId,
          testQueries
        );
        
        // Compare results
        console.log('\n=== Performance Improvement ===');
        testQueries.forEach((query, i) => {
          const improvement = (
            (noIndexResults[i].avgTime - withIndexResults[i].avgTime) / 
            noIndexResults[i].avgTime * 100
          ).toFixed(2);
          
          console.log(`${query.name}: ${improvement}% faster`);
          console.log(`  Without index: ${noIndexResults[i].avgTime.toFixed(2)}ms`);
          console.log(`  With index: ${withIndexResults[i].avgTime.toFixed(2)}ms`);
          
          // Verify significant improvement
          expect(withIndexResults[i].avgTime).toBeLessThan(noIndexResults[i].avgTime * 0.5);
        });
      }
    );
  });
});

async function measureQueryPerformance(
  client: EnhancedNeonApiClient,
  branchId: string,
  queries: Array<{ name: string; sql: string; params?: any[] }>
) {
  const results = [];
  
  for (const query of queries) {
    const timings = [];
    
    // Warm up
    await client.executeSql(query.sql, branchId, { values: query.params });
    
    // Measure
    for (let i = 0; i < 10; i++) {
      const start = Date.now();
      await client.executeSql(query.sql, branchId, { values: query.params });
      timings.push(Date.now() - start);
    }
    
    results.push({
      query: query.name,
      avgTime: average(timings),
      minTime: Math.min(...timings),
      maxTime: Math.max(...timings)
    });
  }
  
  return results;
}
```

## API Performance Testing

### REST API Load Testing

```typescript
import { describe, it } from 'vitest';
import { getNeonApiClient } from '@/lib/testing/neon-api-client';
import { createTestServer } from '@/test-utils/server';
import autocannon from 'autocannon';

describe('API Performance Testing', () => {
  it('should handle API load efficiently', async () => {
    const client = getNeonApiClient();
    
    await client.withTestBranch(
      {
        testSuite: 'api-load-test',
        purpose: 'api-performance',
        tags: ['performance', 'api']
      },
      async (branchInfo) => {
        // Start test server with Neon branch
        const server = await createTestServer({
          databaseUrl: branchInfo.connectionString
        });
        
        const serverUrl = `http://localhost:${server.port}`;
        
        // Setup test data
        await setupApiTestData(client, branchInfo.branchId);
        
        // Load test scenarios
        const scenarios = [
          {
            name: 'GET /api/users',
            url: `${serverUrl}/api/users`,
            duration: 30,
            connections: 10,
            pipelining: 1
          },
          {
            name: 'POST /api/users',
            url: `${serverUrl}/api/users`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: 'Test User',
              email: 'test@example.com'
            }),
            duration: 30,
            connections: 5
          },
          {
            name: 'Complex query endpoint',
            url: `${serverUrl}/api/analytics/dashboard`,
            duration: 30,
            connections: 20,
            expectedLatency: { p99: 500 }
          }
        ];
        
        const results = [];
        
        for (const scenario of scenarios) {
          console.log(`\nTesting: ${scenario.name}`);
          
          const result = await runAutocannon({
            ...scenario,
            title: scenario.name
          });
          
          results.push({
            scenario: scenario.name,
            requests: result.requests,
            throughput: result.throughput,
            latency: result.latency,
            errors: result.errors
          });
          
          // Verify SLAs
          if (scenario.expectedLatency?.p99) {
            expect(result.latency.p99).toBeLessThan(scenario.expectedLatency.p99);
          }
        }
        
        // Summary report
        console.table(results.map(r => ({
          Scenario: r.scenario,
          'Req/sec': r.throughput.mean.toFixed(2),
          'Avg Latency': r.latency.mean.toFixed(2) + 'ms',
          'P99 Latency': r.latency.p99.toFixed(2) + 'ms',
          'Total Requests': r.requests.total,
          'Error Rate': ((r.errors / r.requests.total) * 100).toFixed(2) + '%'
        })));
        
        await server.close();
      }
    );
  });
});

function runAutocannon(opts: any): Promise<any> {
  return new Promise((resolve, reject) => {
    autocannon(opts, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}
```

### GraphQL Performance Testing

```typescript
describe('GraphQL Performance', () => {
  it('should handle complex GraphQL queries efficiently', async () => {
    const client = getNeonApiClient();
    
    await client.withTestBranch(
      {
        testSuite: 'graphql-performance',
        purpose: 'graphql-testing',
        tags: ['performance', 'graphql']
      },
      async (branchInfo) => {
        // Setup GraphQL server
        const server = await createGraphQLTestServer({
          databaseUrl: branchInfo.connectionString
        });
        
        // Test queries with different complexity
        const queries = [
          {
            name: 'Simple query',
            query: `
              query GetUser($id: ID!) {
                user(id: $id) {
                  id
                  name
                  email
                }
              }
            `,
            variables: { id: '1' },
            complexity: 3
          },
          {
            name: 'Nested query',
            query: `
              query GetUserWithPosts($id: ID!) {
                user(id: $id) {
                  id
                  name
                  posts(limit: 10) {
                    id
                    title
                    comments(limit: 5) {
                      id
                      content
                      author {
                        name
                      }
                    }
                  }
                }
              }
            `,
            variables: { id: '1' },
            complexity: 70
          },
          {
            name: 'Complex aggregation',
            query: `
              query GetAnalytics {
                analytics {
                  userStats {
                    total
                    active
                    new
                  }
                  postStats {
                    total
                    byCategory {
                      category
                      count
                    }
                  }
                  topAuthors(limit: 10) {
                    user {
                      id
                      name
                    }
                    postCount
                    totalViews
                  }
                }
              }
            `,
            complexity: 100
          }
        ];
        
        // Test N+1 query problem
        const n1TestQuery = `
          query GetAllUsersWithPosts {
            users(limit: 100) {
              id
              name
              posts {
                id
                title
              }
            }
          }
        `;
        
        // Measure without DataLoader
        console.log('\n=== Without DataLoader ===');
        const withoutDataLoader = await measureGraphQLPerformance(
          server.url,
          [{ name: 'N+1 Test', query: n1TestQuery, complexity: 200 }],
          { useDataLoader: false }
        );
        
        // Measure with DataLoader
        console.log('\n=== With DataLoader ===');
        const withDataLoader = await measureGraphQLPerformance(
          server.url,
          [{ name: 'N+1 Test', query: n1TestQuery, complexity: 200 }],
          { useDataLoader: true }
        );
        
        // Compare results
        const improvement = (
          (withoutDataLoader[0].avgTime - withDataLoader[0].avgTime) /
          withoutDataLoader[0].avgTime * 100
        ).toFixed(2);
        
        console.log(`\nDataLoader improvement: ${improvement}%`);
        expect(withDataLoader[0].avgTime).toBeLessThan(withoutDataLoader[0].avgTime * 0.5);
        
        // Test query complexity limits
        const complexityResults = await measureGraphQLPerformance(
          server.url,
          queries
        );
        
        complexityResults.forEach(result => {
          console.log(`${result.name}: ${result.avgTime.toFixed(2)}ms (complexity: ${result.complexity})`);
          
          // Verify performance scales reasonably with complexity
          const expectedMaxTime = 10 + (result.complexity * 2); // 2ms per complexity point
          expect(result.avgTime).toBeLessThan(expectedMaxTime);
        });
        
        await server.close();
      }
    );
  });
});
```

## Memory and Resource Testing

### Memory Leak Detection

```typescript
describe('Memory and Resource Testing', () => {
  it('should detect memory leaks in long-running operations', async () => {
    const client = getNeonApiClient();
    
    await client.withTestBranch(
      {
        testSuite: 'memory-leak-test',
        purpose: 'memory-testing',
        tags: ['performance', 'memory']
      },
      async (branchInfo) => {
        const iterations = 1000;
        const checkpoints = [0, 250, 500, 750, 1000];
        const memorySnapshots = new Map<number, NodeJS.MemoryUsage>();
        
        // Force garbage collection before starting
        if (global.gc) {
          global.gc();
        }
        
        // Take initial snapshot
        memorySnapshots.set(0, process.memoryUsage());
        
        // Simulate long-running operation
        for (let i = 0; i < iterations; i++) {
          // Potential memory leak: keeping references
          const results = [];
          
          // Execute queries
          for (let j = 0; j < 10; j++) {
            const result = await client.executeSql(
              `SELECT * FROM generate_series(1, 1000) as id`,
              branchInfo.branchId
            );
            
            // Intentional leak for testing
            if (i < 100) {
              results.push(result); // This would cause a leak
            }
          }
          
          // Take memory snapshots at checkpoints
          if (checkpoints.includes(i)) {
            if (global.gc) {
              global.gc();
            }
            
            memorySnapshots.set(i, process.memoryUsage());
            
            const current = memorySnapshots.get(i)!;
            const initial = memorySnapshots.get(0)!;
            
            console.log(`Checkpoint ${i}:
              Heap Used: ${(current.heapUsed / 1024 / 1024).toFixed(2)}MB
              Growth: ${((current.heapUsed - initial.heapUsed) / 1024 / 1024).toFixed(2)}MB
            `);
          }
        }
        
        // Analyze memory growth
        const initial = memorySnapshots.get(0)!;
        const final = memorySnapshots.get(1000)!;
        
        const heapGrowth = final.heapUsed - initial.heapUsed;
        const heapGrowthMB = heapGrowth / 1024 / 1024;
        
        console.log(`\nMemory Analysis:
          Initial Heap: ${(initial.heapUsed / 1024 / 1024).toFixed(2)}MB
          Final Heap: ${(final.heapUsed / 1024 / 1024).toFixed(2)}MB
          Growth: ${heapGrowthMB.toFixed(2)}MB
          Growth Rate: ${(heapGrowthMB / iterations * 1000).toFixed(2)}MB per 1000 operations
        `);
        
        // Check for memory leak
        const acceptableGrowthMB = 50; // 50MB growth is acceptable
        
        if (heapGrowthMB > acceptableGrowthMB) {
          console.warn(`Potential memory leak detected! Growth: ${heapGrowthMB.toFixed(2)}MB`);
          
          // Analyze heap
          if (global.v8debug) {
            const heapSnapshot = require('v8').writeHeapSnapshot();
            console.log(`Heap snapshot written to: ${heapSnapshot}`);
          }
        }
        
        expect(heapGrowthMB).toBeLessThan(acceptableGrowthMB);
      }
    );
  });

  it('should monitor connection pool usage', async () => {
    const client = getNeonApiClient();
    
    await client.withTestBranch(
      {
        testSuite: 'connection-pool-monitoring',
        purpose: 'resource-testing',
        tags: ['performance', 'connections']
      },
      async (branchInfo) => {
        const { Pool } = require('pg');
        
        // Create pool with monitoring
        const pool = new Pool({
          connectionString: branchInfo.connectionString,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000
        });
        
        const poolMetrics = {
          totalConnections: 0,
          idleConnections: 0,
          waitingClients: 0,
          samples: [] as any[]
        };
        
        // Monitor pool metrics
        const monitoringInterval = setInterval(() => {
          const metrics = {
            timestamp: Date.now(),
            total: pool.totalCount,
            idle: pool.idleCount,
            waiting: pool.waitingCount
          };
          
          poolMetrics.samples.push(metrics);
          
          poolMetrics.totalConnections = Math.max(poolMetrics.totalConnections, metrics.total);
          poolMetrics.idleConnections = Math.max(poolMetrics.idleConnections, metrics.idle);
          poolMetrics.waitingClients = Math.max(poolMetrics.waitingClients, metrics.waiting);
        }, 100);
        
        // Simulate varying load
        const loadPhases = [
          { duration: 5000, concurrency: 5 },
          { duration: 5000, concurrency: 15 },
          { duration: 5000, concurrency: 25 }, // Exceeds pool size
          { duration: 5000, concurrency: 10 },
          { duration: 5000, concurrency: 1 }
        ];
        
        for (const phase of loadPhases) {
          console.log(`Load phase: ${phase.concurrency} concurrent clients`);
          
          const phaseStart = Date.now();
          const clients = [];
          
          // Create concurrent clients
          for (let i = 0; i < phase.concurrency; i++) {
            clients.push((async () => {
              while (Date.now() - phaseStart < phase.duration) {
                try {
                  const client = await pool.connect();
                  await client.query('SELECT pg_sleep(0.1)');
                  client.release();
                } catch (error) {
                  console.error('Connection error:', error.message);
                }
                
                await new Promise(resolve => setTimeout(resolve, 50));
              }
            })());
          }
          
          await Promise.all(clients);
        }
        
        clearInterval(monitoringInterval);
        
        // Analyze pool behavior
        console.log('\nConnection Pool Analysis:');
        console.log(`Peak Total Connections: ${poolMetrics.totalConnections}`);
        console.log(`Peak Idle Connections: ${poolMetrics.idleConnections}`);
        console.log(`Peak Waiting Clients: ${poolMetrics.waitingClients}`);
        
        // Verify pool didn't exceed limits
        expect(poolMetrics.totalConnections).toBeLessThanOrEqual(20);
        
        // Check for connection starvation
        if (poolMetrics.waitingClients > 0) {
          console.warn(`Connection starvation detected: ${poolMetrics.waitingClients} clients waited`);
        }
        
        await pool.end();
      }
    );
  });
});
```

## Performance Monitoring

### Real-time Performance Dashboard

```typescript
import { describe, it } from 'vitest';
import { getNeonApiClient } from '@/lib/testing/neon-api-client';

describe('Performance Monitoring', () => {
  it('should collect and analyze performance metrics', async () => {
    const client = getNeonApiClient();
    
    await client.withTestBranch(
      {
        testSuite: 'performance-monitoring',
        purpose: 'monitoring',
        tags: ['monitoring', 'metrics']
      },
      async (branchInfo) => {
        // Create metrics collection table
        await client.executeSql(`
          CREATE TABLE performance_metrics (
            id SERIAL PRIMARY KEY,
            metric_name VARCHAR(100),
            metric_value NUMERIC,
            tags JSONB,
            timestamp TIMESTAMP DEFAULT NOW()
          )
        `, branchInfo.branchId);
        
        // Metrics collector
        class MetricsCollector {
          async record(name: string, value: number, tags: Record<string, any> = {}) {
            await client.executeSql(
              `INSERT INTO performance_metrics (metric_name, metric_value, tags)
               VALUES ($1, $2, $3)`,
              branchInfo.branchId,
              { values: [name, value, tags] }
            );
          }
          
          async getMetrics(name: string, since: Date) {
            const result = await client.executeSql(
              `SELECT * FROM performance_metrics
               WHERE metric_name = $1 AND timestamp > $2
               ORDER BY timestamp`,
              branchInfo.branchId,
              { values: [name, since] }
            );
            
            return result.data.rows;
          }
          
          async getAggregates(name: string, interval: string = '1 minute') {
            const result = await client.executeSql(
              `SELECT 
                 DATE_TRUNC('${interval}', timestamp) as time_bucket,
                 COUNT(*) as count,
                 AVG(metric_value) as avg_value,
                 MIN(metric_value) as min_value,
                 MAX(metric_value) as max_value,
                 PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY metric_value) as median,
                 PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY metric_value) as p95,
                 PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY metric_value) as p99
               FROM performance_metrics
               WHERE metric_name = $1
               GROUP BY time_bucket
               ORDER BY time_bucket`,
              branchInfo.branchId,
              { values: [name] }
            );
            
            return result.data.rows;
          }
        }
        
        const collector = new MetricsCollector();
        
        // Simulate application with metrics
        const operations = ['query', 'insert', 'update', 'delete'];
        const duration = 60000; // 1 minute
        const startTime = Date.now();
        
        // Generate metrics
        while (Date.now() - startTime < duration) {
          const operation = operations[Math.floor(Math.random() * operations.length)];
          const latency = Math.random() * 100 + 10; // 10-110ms
          const success = Math.random() > 0.05; // 95% success rate
          
          await collector.record('operation.latency', latency, {
            operation,
            success,
            environment: 'test'
          });
          
          if (!success) {
            await collector.record('operation.error', 1, {
              operation,
              error_type: 'timeout'
            });
          }
          
          await new Promise(resolve => setTimeout(resolve, 100)); // 10 ops/sec
        }
        
        // Analyze collected metrics
        const aggregates = await collector.getAggregates('operation.latency', 'minute');
        
        console.log('\nPerformance Metrics Summary:');
        aggregates.forEach(bucket => {
          console.log(`Time: ${bucket.time_bucket}`);
          console.log(`  Operations: ${bucket.count}`);
          console.log(`  Avg Latency: ${parseFloat(bucket.avg_value).toFixed(2)}ms`);
          console.log(`  P95 Latency: ${parseFloat(bucket.p95).toFixed(2)}ms`);
          console.log(`  P99 Latency: ${parseFloat(bucket.p99).toFixed(2)}ms`);
        });
        
        // Alert on SLA violations
        const slaViolations = aggregates.filter(bucket => 
          parseFloat(bucket.p99) > 200 // P99 > 200ms
        );
        
        if (slaViolations.length > 0) {
          console.warn(`\nSLA Violations detected in ${slaViolations.length} time buckets!`);
        }
        
        // Export metrics for external monitoring
        const metricsExport = {
          summary: aggregates,
          violations: slaViolations,
          clientMetrics: client.getPerformanceMetrics()
        };
        
        console.log('\nExportable metrics:', JSON.stringify(metricsExport, null, 2));
      }
    );
  });
});
```

## Optimization Strategies

### Query Optimization

```typescript
describe('Performance Optimization', () => {
  it('should optimize slow queries automatically', async () => {
    const client = getNeonApiClient();
    
    await client.withTestBranch(
      {
        testSuite: 'query-optimization',
        purpose: 'optimization',
        tags: ['performance', 'optimization']
      },
      async (branchInfo) => {
        // Enable query statistics
        await client.executeSql(
          'CREATE EXTENSION IF NOT EXISTS pg_stat_statements',
          branchInfo.branchId
        );
        
        // Create test schema
        await createTestSchema(client, branchInfo.branchId);
        
        // Insert significant data
        await insertLargeDataset(client, branchInfo.branchId);
        
        // Identify slow queries
        const slowQueries = await client.executeSql(`
          SELECT 
            query,
            calls,
            total_exec_time,
            mean_exec_time,
            stddev_exec_time,
            rows
          FROM pg_stat_statements
          WHERE mean_exec_time > 100 -- Queries averaging > 100ms
          ORDER BY mean_exec_time DESC
          LIMIT 10
        `, branchInfo.branchId);
        
        console.log('Slow queries found:', slowQueries.data.rows.length);
        
        // Analyze and optimize each slow query
        for (const slowQuery of slowQueries.data.rows) {
          console.log(`\nOptimizing query with avg time: ${slowQuery.mean_exec_time}ms`);
          
          // Get execution plan
          const explainResult = await client.executeSql(
            `EXPLAIN (FORMAT JSON) ${slowQuery.query}`,
            branchInfo.branchId
          );
          
          const plan = explainResult.data.rows[0]['QUERY PLAN'][0]['Plan'];
          
          // Identify optimization opportunities
          const optimizations = analyzeExecutionPlan(plan);
          
          // Apply optimizations
          for (const optimization of optimizations) {
            console.log(`Applying optimization: ${optimization.description}`);
            
            try {
              await client.executeSql(
                optimization.sql,
                branchInfo.branchId
              );
            } catch (error) {
              console.error(`Failed to apply optimization: ${error.message}`);
            }
          }
        }
        
        // Re-run queries and measure improvement
        // ... measurement code ...
      }
    );
  });
});

function analyzeExecutionPlan(plan: any): Array<{ description: string; sql: string }> {
  const optimizations = [];
  
  // Check for sequential scans on large tables
  if (plan['Node Type'] === 'Seq Scan' && plan['Rows'] > 10000) {
    const tableName = plan['Relation Name'];
    const filter = plan['Filter'];
    
    if (filter) {
      // Extract column from filter
      const columnMatch = filter.match(/\((\w+)/);
      if (columnMatch) {
        optimizations.push({
          description: `Add index on ${tableName}.${columnMatch[1]}`,
          sql: `CREATE INDEX idx_${tableName}_${columnMatch[1]} ON ${tableName}(${columnMatch[1]})`
        });
      }
    }
  }
  
  // Check for missing join indexes
  if (plan['Node Type'] === 'Hash Join' || plan['Node Type'] === 'Nested Loop') {
    const joinCondition = plan['Join Filter'] || plan['Hash Cond'];
    if (joinCondition) {
      // Extract join columns
      const matches = joinCondition.match(/(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/);
      if (matches) {
        optimizations.push({
          description: `Add index for join on ${matches[1]}.${matches[2]}`,
          sql: `CREATE INDEX idx_${matches[1]}_${matches[2]} ON ${matches[1]}(${matches[2]})`
        });
      }
    }
  }
  
  // Recursively check child nodes
  if (plan['Plans']) {
    for (const childPlan of plan['Plans']) {
      optimizations.push(...analyzeExecutionPlan(childPlan));
    }
  }
  
  return optimizations;
}
```

## CI/CD Integration

### Performance Regression Testing

```yaml
# .github/workflows/performance-tests.yml
name: Performance Regression Tests

on:
  pull_request:
    types: [opened, synchronize]
  schedule:
    - cron: '0 0 * * *' # Daily

jobs:
  performance-test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup
        uses: oven-sh/setup-bun@v1
        
      - name: Install dependencies
        run: bun install
        
      - name: Run performance tests
        env:
          NEON_PROJECT_ID: ${{ secrets.NEON_PROJECT_ID }}
        run: |
          bun test tests/performance \
            --reporter=json \
            --outputFile=performance-results.json
            
      - name: Compare with baseline
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('performance-results.json'));
            
            // Fetch baseline from main branch
            const baseline = await github.rest.actions.downloadArtifact({
              owner: context.repo.owner,
              repo: context.repo.repo,
              artifact_id: 'performance-baseline',
              archive_format: 'zip'
            });
            
            // Compare results
            const regressions = comparePerformance(results, baseline);
            
            if (regressions.length > 0) {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body: formatRegressionReport(regressions)
              });
              
              core.setFailed('Performance regressions detected');
            }
            
      - name: Update baseline (main branch only)
        if: github.ref == 'refs/heads/main'
        uses: actions/upload-artifact@v4
        with:
          name: performance-baseline
          path: performance-results.json
          retention-days: 30
```

### Performance Testing Script

```typescript
// scripts/performance-test.ts
import { getNeonApiClient } from '@/lib/testing/neon-api-client';
import { runPerformanceTests } from '@/tests/performance';

async function main() {
  const client = getNeonApiClient();
  
  console.log('Starting performance test suite...');
  
  const results = await client.withTestBranch(
    {
      testSuite: 'ci-performance',
      purpose: 'regression-testing',
      tags: ['ci', 'performance', 'automated']
    },
    async (branchInfo) => {
      return await runPerformanceTests({
        branchInfo,
        scenarios: [
          'database-operations',
          'api-endpoints',
          'concurrent-users',
          'data-processing'
        ],
        config: {
          duration: 300, // 5 minutes per scenario
          warmupDuration: 30,
          targetRPS: 100
        }
      });
    }
  );
  
  // Generate report
  const report = generatePerformanceReport(results);
  
  // Save results
  fs.writeFileSync('performance-results.json', JSON.stringify(report, null, 2));
  
  // Check against thresholds
  const violations = checkPerformanceThresholds(report);
  
  if (violations.length > 0) {
    console.error('Performance threshold violations:', violations);
    process.exit(1);
  }
  
  console.log('Performance tests passed!');
}

main().catch(console.error);
```

## Best Practices

### 1. Test Isolation

Always use separate branches for performance tests:

```typescript
// ✅ Good: Isolated performance test
await client.withTestBranch(
  { testSuite: 'perf-test', tags: ['performance'] },
  async (branch) => {
    // Performance test code
  }
);

// ❌ Bad: Reusing branches across tests
const branch = await client.createTestBranch({ testSuite: 'shared' });
// Multiple performance tests on same branch
```

### 2. Warmup Period

Always include warmup before measurements:

```typescript
// Warmup
for (let i = 0; i < 10; i++) {
  await executeOperation();
}

// Actual measurement
const measurements = [];
for (let i = 0; i < 100; i++) {
  const start = Date.now();
  await executeOperation();
  measurements.push(Date.now() - start);
}
```

### 3. Statistical Significance

Collect enough samples for reliable results:

```typescript
function isStatisticallySignificant(samples: number[]): boolean {
  const sampleSize = samples.length;
  const stdDev = standardDeviation(samples);
  const mean = average(samples);
  const coefficientOfVariation = stdDev / mean;
  
  return sampleSize >= 30 && coefficientOfVariation < 0.3;
}
```

### 4. Resource Cleanup

Always clean up resources after tests:

```typescript
try {
  // Performance test
} finally {
  await pool.end();
  await connections.forEach(conn => conn.close());
  await client.deleteTestBranch(branchInfo.branchName);
}
```

### 5. Monitoring Integration

Export metrics for external monitoring:

```typescript
const metrics = client.exportMonitoringData();
await sendToPrometheus(metrics);
await sendToDatadog(metrics);
```

## Summary

This comprehensive guide covers:

1. **Load Testing**: Gradual load, spike testing, stress testing
2. **Database Performance**: Query optimization, index testing, execution plan analysis
3. **API Performance**: REST and GraphQL load testing
4. **Resource Monitoring**: Memory leaks, connection pools, resource usage
5. **CI/CD Integration**: Automated performance regression testing
6. **Best Practices**: Isolation, warmup, statistical analysis, cleanup

The Enhanced Neon Testing Infrastructure provides the foundation for comprehensive performance testing with:

- Isolated test environments via database branches
- Built-in performance metrics and monitoring
- Automatic cleanup and resource management
- Integration with popular testing tools
- Production-ready error handling and retry logic

For additional resources:
- [Testing Patterns](./testing-patterns.md)
- [Quick Start Guide](./neon-testing-quickstart.md)
- [API Reference](./neon-testing-guide.md#api-reference)