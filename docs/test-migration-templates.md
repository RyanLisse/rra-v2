# Test Migration Templates for Neon Branching

This document provides comprehensive templates and patterns for migrating existing tests to use Neon branching for better performance and test isolation.

## Quick Reference

### Template Selection Guide
- **High-Priority Integration**: Tests with heavy database operations (API routes, RAG pipeline)
- **Performance Tests**: Tests with large datasets and performance measurements
- **E2E Tests**: Full workflow tests requiring complete application state
- **Simple Optimization**: Light database usage tests requiring minimal changes

## 1. High-Priority Integration Template

### For: `tests/api/`, `tests/integration/`, `tests/routes/`

#### Before (Current Pattern)
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '@/lib/db';

// Mock database operations
vi.mock('@/lib/db', () => ({
  db: {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    // ... extensive mocking
  }
}));

describe('Documents API - Chunking Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should process document chunks', async () => {
    // Test with mocked database
  });
});
```

#### After (Enhanced with Neon Branching)
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupNeonTestBranching, getTestDatabaseUrl } from '@/tests/config/neon-branch-setup';
import { runMigrationsOnTestBranch } from '@/tests/config/neon-branch-setup';
import { db } from '@/lib/db';
import { POST } from '@/app/api/documents/chunk/route';
import { documentChunk } from '@/lib/db/schema';

describe('Documents API - Chunking Endpoint', () => {
  // Setup Neon test branching with enhanced client
  setupNeonTestBranching('documents-api-chunking', {
    useEnhancedClient: true,
    branchOptions: {
      purpose: 'api-testing',
      tags: ['api', 'documents', 'chunking']
    },
    enableMetrics: true
  });

  beforeAll(async () => {
    // Run migrations on the test branch
    await runMigrationsOnTestBranch();
  });

  it('should process document chunks and return success response', async () => {
    // Test with real database on isolated branch
    const mockRequestBody = {
      documentId: 'doc-123',
      chunkSize: 500,
      overlap: 50,
    };

    const req = new NextRequest('http://localhost:3000/api/documents/chunk', {
      method: 'POST',
      body: JSON.stringify(mockRequestBody),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify actual database state
    const chunks = await db.select().from(documentChunk);
    expect(chunks.length).toBeGreaterThan(0);
  });
});
```

#### Migration Checklist
- [ ] Remove database mocks (`vi.mock('@/lib/db')`)
- [ ] Add `setupNeonTestBranching` call
- [ ] Add `runMigrationsOnTestBranch` in `beforeAll`
- [ ] Replace mock assertions with real database queries
- [ ] Add branch-specific configuration options
- [ ] Update imports to include Neon setup functions
- [ ] Test migration by running: `bun test tests/api/your-test.test.ts`

## 2. Performance Test Template

### For: `tests/performance/`

#### Before (Current Pattern)
```typescript
import { describe, it, expect } from 'vitest';
import { setupTestDb } from '../utils/test-db';
import { measurePerformance } from '../utils/test-helpers';

describe('Vector Search Performance Tests', () => {
  const getDb = setupTestDb();

  it('should efficiently store large batches of embeddings', async () => {
    const db = getDb();
    // Performance test with potentially shared database
  });
});
```

#### After (Enhanced with Neon Branching)
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { setupNeonTestBranching, runMigrationsOnTestBranch } from '@/tests/config/neon-branch-setup';
import { measurePerformance } from '../utils/test-helpers';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

describe('Vector Search Performance Tests', () => {
  // Setup with performance-optimized configuration
  setupNeonTestBranching('vector-search-performance', {
    useEnhancedClient: true,
    branchOptions: {
      purpose: 'performance-testing',
      tags: ['performance', 'vector-search', 'large-dataset'],
      waitForReady: true,
      timeoutMs: 180000 // Extended timeout for large dataset setup
    },
    enableMetrics: true
  });

  beforeAll(async () => {
    await runMigrationsOnTestBranch();
    
    // Pre-warm the database with indexes if needed
    await db.execute(sql`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_embedding_vector 
      ON document_embedding USING ivfflat (embedding vector_cosine_ops)
    `);
  });

  it('should efficiently store large batches of embeddings', async () => {
    const chunkCount = 10000; // Increased for isolated branch
    
    const { result, duration, memoryUsage } = await measurePerformance(async () => {
      // Test with real large dataset on isolated branch
      const chunks = Array.from({ length: chunkCount }, (_, i) => 
        createTestDocumentChunk('test-doc', i)
      );
      return db.insert(schema.documentChunk).values(chunks).returning();
    });

    // More aggressive performance assertions
    expect(duration).toBeLessThan(3000); // Tighter timing on dedicated branch
    expect(memoryUsage.heapUsed).toBeLessThan(200 * 1024 * 1024);
    expect(result).toHaveLength(chunkCount);
  });
});
```

#### Migration Checklist
- [ ] Replace `setupTestDb()` with `setupNeonTestBranching`
- [ ] Add performance-specific branch configuration
- [ ] Increase dataset sizes for better performance testing
- [ ] Add database pre-warming in `beforeAll`
- [ ] Tighten performance assertions (dedicated resources)
- [ ] Add comprehensive metrics collection
- [ ] Test with: `bun test tests/performance/your-test.test.ts`

## 3. E2E Test Template

### For: `tests/e2e/`

#### Before (Current Pattern)
```typescript
import { ChatPage } from '../pages/chat';
import { test, expect } from '../fixtures';

test.describe('Chat activity', () => {
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    chatPage = new ChatPage(page);
    await chatPage.createNewChat();
  });

  test('Send a user message and receive response', async () => {
    await chatPage.sendUserMessage('Why is grass green?');
    // Test continues...
  });
});
```

#### After (Enhanced with Neon Branching)
```typescript
import { ChatPage } from '../pages/chat';
import { test, expect } from '../fixtures';
import { setupNeonForPlaywright } from '@/tests/config/neon-branch-setup';

test.describe('Chat activity', () => {
  let chatPage: ChatPage;
  let testDatabase: { databaseUrl: string; cleanup: () => Promise<void> } | null = null;

  test.beforeAll(async () => {
    // Setup dedicated database branch for this test suite
    testDatabase = await setupNeonForPlaywright({
      title: 'chat-activity-suite',
      project: { name: 'e2e-chat' }
    });
  });

  test.afterAll(async () => {
    // Cleanup database branch
    if (testDatabase) {
      await testDatabase.cleanup();
    }
  });

  test.beforeEach(async ({ page }) => {
    // Set database URL in environment for this test
    if (testDatabase) {
      process.env.POSTGRES_URL = testDatabase.databaseUrl;
    }
    
    chatPage = new ChatPage(page);
    await chatPage.createNewChat();
  });

  test('Send a user message and receive response', async () => {
    await chatPage.sendUserMessage('Why is grass green?');
    await chatPage.isGenerationComplete();

    const assistantMessage = await chatPage.getRecentAssistantMessage();
    expect(assistantMessage.content).toContain("It's just green duh!");
    
    // Can now verify database state directly
    // No more mocked responses - real chat data is persisted
  });
});
```

#### Migration Checklist
- [ ] Add `setupNeonForPlaywright` in `test.beforeAll`
- [ ] Add cleanup in `test.afterAll`
- [ ] Set `process.env.POSTGRES_URL` in `test.beforeEach`
- [ ] Remove any database mocking or fixtures
- [ ] Add database state verification where appropriate
- [ ] Test with: `bun run test:e2e -- tests/e2e/your-test.test.ts`

## 4. Simple Optimization Template

### For: Light database usage tests

#### Before (Current Pattern)
```typescript
import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('utils', () => {
  describe('cn', () => {
    it('should merge class names correctly', () => {
      const result = cn('text-red-500', 'bg-blue-500');
      expect(result).toBe('text-red-500 bg-blue-500');
    });
  });
});
```

#### After (Minimal Enhancement)
```typescript
import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

// Simple utility tests - no database, no Neon branching needed
describe('utils', () => {
  describe('cn', () => {
    it('should merge class names correctly', () => {
      const result = cn('text-red-500', 'bg-blue-500');
      expect(result).toBe('text-red-500 bg-blue-500');
    });
  });
});
```

#### Migration Checklist
- [ ] No migration needed - keep as-is
- [ ] Only migrate if test grows to include database operations
- [ ] Focus migration efforts on database-heavy tests first

## 5. Reusable Utility Patterns

### Setup Helpers

```typescript
// tests/utils/neon-test-helpers.ts
import { setupNeonTestBranching, runMigrationsOnTestBranch } from '@/tests/config/neon-branch-setup';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

/**
 * Standard setup for API tests with database operations
 */
export function setupApiTest(suiteName: string) {
  setupNeonTestBranching(`api-${suiteName}`, {
    useEnhancedClient: true,
    branchOptions: {
      purpose: 'api-testing',
      tags: ['api', suiteName]
    }
  });

  return {
    beforeAll: async () => {
      await runMigrationsOnTestBranch();
    }
  };
}

/**
 * Performance test setup with optimizations
 */
export function setupPerformanceTest(suiteName: string, options?: {
  timeoutMs?: number;
  preWarmIndexes?: boolean;
}) {
  const { timeoutMs = 180000, preWarmIndexes = false } = options || {};
  
  setupNeonTestBranching(`perf-${suiteName}`, {
    useEnhancedClient: true,
    branchOptions: {
      purpose: 'performance-testing',
      tags: ['performance', suiteName],
      timeoutMs
    },
    enableMetrics: true
  });

  return {
    beforeAll: async () => {
      await runMigrationsOnTestBranch();
      
      if (preWarmIndexes) {
        // Add common performance indexes
        await db.execute(sql`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_document_chunk_document_id 
          ON document_chunk (document_id)
        `);
      }
    }
  };
}

/**
 * Integration test setup with full schema
 */
export function setupIntegrationTest(suiteName: string) {
  setupNeonTestBranching(`integration-${suiteName}`, {
    useEnhancedClient: true,
    branchOptions: {
      purpose: 'integration-testing',
      tags: ['integration', suiteName],
      waitForReady: true
    }
  });

  return {
    beforeAll: async () => {
      await runMigrationsOnTestBranch();
      
      // Seed basic test data if needed
      const testUser = await db.insert(schema.user).values({
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User'
      }).returning();
      
      return { testUser: testUser[0] };
    }
  };
}
```

### Cleanup Patterns

```typescript
// tests/utils/cleanup-helpers.ts
import { afterAll } from 'vitest';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

/**
 * Clean up test data after each test
 */
export function setupTestCleanup() {
  afterEach(async () => {
    // Clean up in reverse dependency order
    await db.delete(schema.documentEmbedding);
    await db.delete(schema.documentChunk);
    await db.delete(schema.documentContent);
    await db.delete(schema.ragDocument);
    await db.delete(schema.user);
  });
}

/**
 * Parallel cleanup for performance tests
 */
export function setupParallelCleanup() {
  afterAll(async () => {
    // Fast parallel cleanup
    await Promise.all([
      db.delete(schema.documentEmbedding),
      db.delete(schema.documentChunk),
      db.delete(schema.documentContent)
    ]);
    
    // Then dependencies
    await db.delete(schema.ragDocument);
    await db.delete(schema.user);
  });
}
```

### Performance Measurement Helpers

```typescript
// tests/utils/performance-helpers.ts
import { performance } from 'perf_hooks';

export interface PerformanceResult<T> {
  result: T;
  duration: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage?: NodeJS.CpuUsage;
}

export async function measurePerformanceDetailed<T>(
  operation: () => Promise<T>
): Promise<PerformanceResult<T>> {
  const startMemory = process.memoryUsage();
  const startCpu = process.cpuUsage();
  const startTime = performance.now();

  const result = await operation();

  const endTime = performance.now();
  const endMemory = process.memoryUsage();
  const endCpu = process.cpuUsage(startCpu);

  return {
    result,
    duration: endTime - startTime,
    memoryUsage: {
      rss: endMemory.rss - startMemory.rss,
      heapTotal: endMemory.heapTotal - startMemory.heapTotal,
      heapUsed: endMemory.heapUsed - startMemory.heapUsed,
      external: endMemory.external - startMemory.external,
      arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers
    },
    cpuUsage: endCpu
  };
}

export function createPerformanceBenchmark(name: string) {
  const measurements: Array<{ operation: string; duration: number; memory: number }> = [];

  return {
    measure: async <T>(operation: string, fn: () => Promise<T>) => {
      const result = await measurePerformanceDetailed(fn);
      measurements.push({
        operation,
        duration: result.duration,
        memory: result.memoryUsage.heapUsed
      });
      return result;
    },
    
    report: () => {
      console.log(`\n=== Performance Benchmark: ${name} ===`);
      measurements.forEach(m => {
        console.log(`${m.operation}: ${m.duration.toFixed(2)}ms, ${(m.memory / 1024 / 1024).toFixed(2)}MB`);
      });
      console.log('=====================================\n');
    }
  };
}
```

### Error Handling Patterns

```typescript
// tests/utils/error-helpers.ts
import { expect } from 'vitest';

export function expectDatabaseError(error: unknown, expectedType: 'constraint' | 'connection' | 'timeout') {
  expect(error).toBeInstanceOf(Error);
  
  const err = error as Error;
  switch (expectedType) {
    case 'constraint':
      expect(err.message).toMatch(/constraint|duplicate|unique/i);
      break;
    case 'connection':
      expect(err.message).toMatch(/connection|connect|timeout/i);
      break;
    case 'timeout':
      expect(err.message).toMatch(/timeout|deadline/i);
      break;
  }
}

export async function expectAsyncError<T>(
  operation: () => Promise<T>,
  errorMatcher: string | RegExp | ((error: Error) => boolean)
) {
  let error: Error | null = null;
  
  try {
    await operation();
  } catch (e) {
    error = e as Error;
  }
  
  expect(error).not.toBeNull();
  
  if (typeof errorMatcher === 'string') {
    expect(error!.message).toContain(errorMatcher);
  } else if (errorMatcher instanceof RegExp) {
    expect(error!.message).toMatch(errorMatcher);
  } else {
    expect(errorMatcher(error!)).toBe(true);
  }
}
```

## 6. Quick Start Snippets

### API Test Migration
```typescript
// Copy-paste this at the top of your API test file
import { setupNeonTestBranching, runMigrationsOnTestBranch } from '@/tests/config/neon-branch-setup';

describe('Your API Test', () => {
  setupNeonTestBranching('your-api-test');
  
  beforeAll(async () => {
    await runMigrationsOnTestBranch();
  });
  
  // Your tests here...
});
```

### Performance Test Migration
```typescript
// Copy-paste this for performance tests
import { setupNeonTestBranching, runMigrationsOnTestBranch } from '@/tests/config/neon-branch-setup';
import { createPerformanceBenchmark } from '@/tests/utils/performance-helpers';

describe('Your Performance Test', () => {
  setupNeonTestBranching('your-perf-test', {
    enableMetrics: true,
    branchOptions: { purpose: 'performance-testing' }
  });
  
  const benchmark = createPerformanceBenchmark('Your Test Suite');
  
  beforeAll(async () => {
    await runMigrationsOnTestBranch();
  });
  
  afterAll(() => {
    benchmark.report();
  });
  
  // Your tests here...
});
```

### E2E Test Migration
```typescript
// Copy-paste this for E2E tests
import { setupNeonForPlaywright } from '@/tests/config/neon-branch-setup';

test.describe('Your E2E Test', () => {
  let testDatabase: { databaseUrl: string; cleanup: () => Promise<void> } | null = null;

  test.beforeAll(async () => {
    testDatabase = await setupNeonForPlaywright({
      title: 'your-e2e-test',
      project: { name: 'e2e' }
    });
  });

  test.afterAll(async () => {
    if (testDatabase) await testDatabase.cleanup();
  });

  test.beforeEach(async () => {
    if (testDatabase) process.env.POSTGRES_URL = testDatabase.databaseUrl;
  });
  
  // Your tests here...
});
```

## 7. Migration Priority Order

1. **High Priority (Migrate First)**:
   - `tests/api/documents-api.test.ts`
   - `tests/integration/rag-pipeline.test.ts`
   - `tests/performance/vector-search.test.ts`
   - `tests/routes/document.test.ts`

2. **Medium Priority**:
   - `tests/api/chat.test.ts`
   - `tests/server-actions/documents.test.ts`
   - `tests/lib/ade-integration.test.ts`

3. **Low Priority (Migrate Last)**:
   - `tests/lib/utils.test.ts`
   - `tests/components/` (most don't use database)
   - Pure unit tests without database operations

## 8. Validation Steps

After migrating each test file:

1. **Run the specific test**: `bun test path/to/your/test.test.ts`
2. **Check test isolation**: Run test multiple times to ensure no state leakage
3. **Verify performance**: Compare test execution time before/after migration
4. **Test parallel execution**: `bun test --reporter=verbose --threads`
5. **Check branch cleanup**: Verify branches are properly deleted after tests

## 9. Common Issues and Solutions

### Issue: Test timeouts after migration
**Solution**: Increase timeout in test configuration:
```typescript
setupNeonTestBranching('test-name', {
  branchOptions: { timeoutMs: 180000 }
});
```

### Issue: Database migration failures
**Solution**: Ensure migrations run before tests:
```typescript
beforeAll(async () => {
  await runMigrationsOnTestBranch();
}, 120000); // Increase timeout
```

### Issue: Memory leaks in performance tests
**Solution**: Add proper cleanup:
```typescript
afterEach(async () => {
  // Clean up large test data
  await db.delete(schema.largeTable);
});
```

This completes the comprehensive migration templates. Each template provides a clear before/after comparison, step-by-step migration checklists, and reusable patterns that other agents can easily apply to migrate tests efficiently.