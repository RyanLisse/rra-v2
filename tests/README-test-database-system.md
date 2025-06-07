# Test Database System

This document provides a comprehensive guide to the test database initialization and seeding system for the RRA_V2 project.

## Overview

The test database system provides:

- **Factory System**: Type-safe factories for creating test data
- **Seeding System**: Environment-specific seeders for different testing needs
- **Neon Branching**: Integration with Neon database branching for isolated testing
- **Performance Monitoring**: Built-in metrics and performance tracking
- **State Management**: Database snapshots and rollback capabilities

## Architecture

```
tests/
├── factories/              # Test data factories
│   ├── base-factory.ts     # Base factory with common functionality
│   ├── user-factory.ts     # User and authentication data
│   ├── chat-factory.ts     # Chat conversations and messages
│   ├── document-factory.ts # Artifact documents
│   ├── rag-factory.ts      # RAG documents, chunks, embeddings
│   ├── relationship-factory.ts  # Complex relationships
│   └── performance-factory.ts   # Large-scale performance data
├── seeds/                  # Database seeders
│   ├── base-seeder.ts      # Base seeder functionality
│   ├── unit-seeder.ts      # Unit test seeding
│   ├── integration-seeder.ts    # Integration test seeding
│   ├── e2e-seeder.ts       # E2E test seeding
│   ├── performance-seeder.ts    # Performance test seeding
│   └── scenario-seeder.ts  # Scenario-based seeding
└── utils/
    └── enhanced-test-db.ts # Enhanced database utilities
```

## Quick Start

### 1. Environment Setup

Set up your environment variables:

```bash
# Basic database
DATABASE_URL="postgresql://user:pass@localhost:5432/mydb"
TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/test_db"

# For Neon branching (optional)
NEON_API_KEY="your-neon-api-key"
NEON_PROJECT_ID="your-project-id"
```

### 2. Initialize Test Data

```bash
# Initialize unit test data
bun run scripts/test-data/init-test-data.ts --env=unit

# Initialize E2E test data
bun run scripts/test-data/init-test-data.ts --env=e2e --size=standard

# Initialize with Neon branching
bun run scripts/test-data/init-test-data.ts --env=unit --neon-branching
```

### 3. Use in Tests

```typescript
import { setupTestDatabase, EnhancedTestDatabase } from '@/tests/utils/enhanced-test-db';

describe('My Feature', () => {
  const getDb = setupTestDatabase({ 
    environment: 'unit',
    autoSeed: true 
  });

  it('should work with test data', async () => {
    const db = getDb().db;
    const users = await db.select().from(schema.user);
    expect(users.length).toBeGreaterThan(0);
  });
});
```

## Factory System

### Basic Usage

```typescript
import { userFactory, chatFactory, ragDocumentFactory } from '@/tests/factories';

// Create single items
const user = userFactory.create();
const chat = chatFactory.create({ overrides: { userId: user.id } });
const document = ragDocumentFactory.create({ realistic: true });

// Create batches
const users = userFactory.createBatch({ count: 10 });
const chats = chatFactory.createBatch({ 
  count: 5, 
  customizer: (index) => ({ title: `Chat ${index + 1}` })
});
```

### Advanced Usage

```typescript
import { completeUserFactory, relationshipFactory } from '@/tests/factories';

// Create user with all relationships
const completeUser = completeUserFactory.createActiveUser({
  overrides: {
    user: { type: 'premium' },
  },
});

// Create complex scenarios
const workspace = relationshipFactory.createCollaborativeWorkspace();
const workspaceData = await workspace.setup();
```

### Performance Data

```typescript
import { performanceFactory } from '@/tests/factories';

// Create large datasets
const dataset = await performanceFactory.createPerformanceDataset('large', {
  scenarios: ['users', 'documents', 'chats'],
  patterns: 'mixed',
});

// Create load testing scenarios
const scenarios = performanceFactory.createLoadTestingScenarios();
```

## Seeding System

### Environment-Specific Seeding

```typescript
import { UnitSeeder, E2ESeeder, PerformanceSeeder } from '@/tests/seeds';

// Unit test seeding (minimal data)
const unitSeeder = new UnitSeeder({
  environment: 'unit',
  clean: true,
  size: 'minimal',
});
await unitSeeder.seed();

// E2E seeding (realistic scenarios)
const e2eSeeder = new E2ESeeder({
  environment: 'e2e',
  size: 'standard',
  scenarios: ['collaboration', 'customer-support'],
});
await e2eSeeder.seed();

// Performance seeding (large scale)
const perfSeeder = new PerformanceSeeder({
  environment: 'performance',
  size: 'large',
  scenarios: ['baseline-load'],
});
await perfSeeder.seed();
```

### Scenario-Based Seeding

```typescript
import { ScenarioSeeder } from '@/tests/seeds';

const scenarioSeeder = new ScenarioSeeder({
  environment: 'e2e',
  scenarios: [
    'collaborative-workspace',
    'customer-support',
    'research',
    'e-learning',
  ],
});
await scenarioSeeder.seed();
```

## Neon Branching Integration

### Basic Branch Usage

```typescript
import { withTestBranch, getTestBranchManager } from '@/lib/testing/neon-test-branches';

// Use isolated branch for test
await withTestBranch('my-test', async (connectionString) => {
  const db = drizzle(postgres(connectionString));
  // Your test code here
});

// Manual branch management
const branchManager = getTestBranchManager();
const branch = await branchManager.createTestBranch('test-suite');
// ... use branch
await branchManager.deleteTestBranch(branch.branchName);
```

### Enhanced Database with Branching

```typescript
import { EnhancedTestDatabase } from '@/tests/utils/enhanced-test-db';

// Setup with automatic branching
const instance = await EnhancedTestDatabase.setup('my-test', {
  environment: 'unit',
  useNeonBranching: true,
  autoSeed: true,
});

// Use isolated branch
await EnhancedTestDatabase.withIsolatedBranch('test', async (instance) => {
  // Test code with completely isolated database
});
```

## State Management

### Database Snapshots

```typescript
import { TestDatabaseState } from '@/tests/utils/enhanced-test-db';

const state = new TestDatabaseState('my-test');

// Create snapshot
const snapshot = await state.snapshot('before-changes');

// Make changes to database
// ...

// Restore to snapshot
await state.restore('before-changes');
```

### Transaction Rollbacks

```typescript
import { withTestTransaction } from '@/tests/utils/enhanced-test-db';

await withTestTransaction('my-test', async (db) => {
  // All changes in this transaction will be rolled back
  await db.insert(schema.user).values({ /* ... */ });
  // Test your code
});
// Database is automatically restored
```

## Performance Monitoring

### Built-in Metrics

```typescript
import { EnhancedTestDatabase } from '@/tests/utils/enhanced-test-db';

// Get performance metrics
const metrics = EnhancedTestDatabase.getMetrics('my-test');

// Generate performance report
const report = EnhancedTestDatabase.generatePerformanceReport('my-test');
console.log(`Average operation time: ${report.summary.averageTime}ms`);
```

### Performance Decorators

```typescript
import { withPerformanceMonitoring } from '@/tests/utils/enhanced-test-db';

const monitoredFunction = withPerformanceMonitoring(
  async (data) => {
    // Your function
    return processData(data);
  },
  'my-test'
);
```

## Command Line Tools

### Initialize Test Data

```bash
# Basic usage
bun run scripts/test-data/init-test-data.ts --env=unit --size=minimal

# E2E with specific scenarios
bun run scripts/test-data/init-test-data.ts --env=e2e --scenarios=collaboration,research

# Performance testing
bun run scripts/test-data/init-test-data.ts --env=performance --size=large --seed-type=load

# With Neon branching
bun run scripts/test-data/init-test-data.ts --env=unit --neon-branching
```

### Reset Test Data

```bash
# Reset unit database
bun run scripts/test-data/reset-test-data.ts --env=unit

# Reset and reinitialize
bun run scripts/test-data/reset-test-data.ts --env=e2e --reinitialize --size=standard

# Reset specific branch
bun run scripts/test-data/reset-test-data.ts --branch=br-test-123

# Reset all test branches (dangerous!)
bun run scripts/test-data/reset-test-data.ts --all-branches --force
```

### Export Test Data

```bash
# Export as JSON
bun run scripts/test-data/export-test-data.ts --env=unit --format=json

# Export specific tables
bun run scripts/test-data/export-test-data.ts --tables=users,chats --format=sql

# Export with anonymization
bun run scripts/test-data/export-test-data.ts --anonymize --format=csv

# Export from specific branch
bun run scripts/test-data/export-test-data.ts --branch=br-test-123 --format=json
```

## Testing Patterns

### Unit Tests

```typescript
import { setupTestDatabase } from '@/tests/utils/enhanced-test-db';
import { userFactory } from '@/tests/factories';

describe('User Service', () => {
  const getDb = setupTestDatabase({ 
    environment: 'unit',
    autoSeed: false // Manual data creation for unit tests
  });

  it('should create user', async () => {
    const db = getDb().db;
    
    // Create test data
    const userData = userFactory.create();
    await db.insert(schema.user).values(userData);
    
    // Test your service
    const result = await userService.createUser(userData);
    expect(result).toBeDefined();
  });
});
```

### Integration Tests

```typescript
import { setupTestDatabase } from '@/tests/utils/enhanced-test-db';

describe('RAG Pipeline', () => {
  const getDb = setupTestDatabase({ 
    environment: 'integration',
    autoSeed: true,
    seederConfig: {
      scenarios: ['document-processing'],
    },
  });

  it('should process documents', async () => {
    const db = getDb().db;
    
    // Test with pre-seeded data
    const documents = await db.select().from(schema.ragDocument);
    expect(documents.length).toBeGreaterThan(0);
    
    // Test your pipeline
    const result = await documentProcessor.processAll();
    expect(result.success).toBe(true);
  });
});
```

### E2E Tests

```typescript
import { EnhancedTestDatabase } from '@/tests/utils/enhanced-test-db';

describe('Chat Interface E2E', () => {
  beforeEach(async () => {
    await EnhancedTestDatabase.setup('e2e-chat', {
      environment: 'e2e',
      useNeonBranching: true,
      autoSeed: true,
      seederConfig: {
        size: 'standard',
        scenarios: ['collaborative-workspace'],
      },
    });
  });

  afterEach(async () => {
    await EnhancedTestDatabase.cleanup('e2e-chat');
  });

  it('should handle chat interactions', async () => {
    // Your E2E test code
    // Database is automatically seeded with realistic data
  });
});
```

### Performance Tests

```typescript
import { PerformanceSeeder } from '@/tests/seeds';

describe('Database Performance', () => {
  it('should handle large datasets', async () => {
    const seeder = new PerformanceSeeder({
      environment: 'performance',
      size: 'large',
      scenarios: ['vector-search'],
    });
    
    const result = await seeder.seed();
    expect(result.success).toBe(true);
    
    const metrics = seeder.getMetrics();
    const avgTime = metrics.reduce((sum, m) => sum + m.executionTime, 0) / metrics.length;
    expect(avgTime).toBeLessThan(5000); // 5 second average
  });
});
```

## Best Practices

### 1. Use Appropriate Environment

- **Unit**: Minimal, predictable data
- **Integration**: Realistic scenarios with relationships
- **E2E**: Full user workflows and scenarios
- **Performance**: Large-scale data for load testing

### 2. Leverage Factories

```typescript
// Good: Use factories for consistent data
const user = userFactory.createAdmin({ realistic: true });

// Avoid: Manual object creation
const user = { id: '123', email: 'test@example.com', /* ... */ };
```

### 3. Use Scenarios for Complex Tests

```typescript
// Good: Use predefined scenarios
const workspace = relationshipFactory.createCollaborativeWorkspace();

// Avoid: Manual relationship setup
const users = [/* ... */];
const documents = [/* ... */];
// Complex manual linking...
```

### 4. Clean Up Resources

```typescript
// Good: Use test lifecycle hooks
afterEach(async () => {
  await EnhancedTestDatabase.cleanup('my-test');
});

// Good: Use withTestBranch for automatic cleanup
await withTestBranch('test', async (connectionString) => {
  // Test code
}); // Automatically cleaned up
```

### 5. Monitor Performance

```typescript
// Good: Track metrics for performance-sensitive tests
const report = EnhancedTestDatabase.generatePerformanceReport('perf-test');
if (report.summary.averageTime > threshold) {
  console.warn('Performance degradation detected');
}
```

## Troubleshooting

### Common Issues

1. **Connection Errors**
   - Ensure DATABASE_URL is set correctly
   - Check database is running and accessible
   - Verify credentials and permissions

2. **Migration Errors**
   - Ensure migrations are up to date
   - Check for schema conflicts
   - Verify database user has DDL permissions

3. **Neon Branching Issues**
   - Verify NEON_API_KEY and NEON_PROJECT_ID are set
   - Check API key permissions
   - Ensure project exists and is accessible

4. **Memory Issues with Large Datasets**
   - Use smaller batch sizes
   - Enable garbage collection with --expose-gc
   - Monitor memory usage in performance tests

### Debug Mode

Enable verbose logging:

```bash
# Command line tools
bun run scripts/test-data/init-test-data.ts --env=unit --verbose

# In tests
DEBUG=test-db bun test
```

### Performance Optimization

```typescript
// Use batch operations
await seeder.batchInsert(schema.user, users, 1000);

// Monitor memory usage
const memBefore = process.memoryUsage().heapUsed;
// ... operations
const memAfter = process.memoryUsage().heapUsed;
console.log(`Memory used: ${(memAfter - memBefore) / 1024 / 1024}MB`);
```

## Contributing

When adding new factories or seeders:

1. Extend the appropriate base class
2. Follow naming conventions
3. Add comprehensive JSDoc comments
4. Include usage examples
5. Add tests for the factory/seeder itself
6. Update this documentation

### Adding New Factories

```typescript
export class MyEntityFactory extends BaseFactory<MyEntityInsert> {
  create(options?: FactoryOptions): MyEntityInsert {
    // Implementation
  }
}
```

### Adding New Scenarios

```typescript
// In scenario-seeder.ts
private async createMyScenario(): Promise<TestScenario> {
  return {
    name: 'my-scenario',
    description: 'Description of what this scenario tests',
    setup: async () => {
      // Setup logic
      return { data };
    },
    data: { scenario: 'my-scenario' },
  };
}
```

## Resources

- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Neon Branching API](https://neon.tech/docs/reference/api-reference)
- [Vitest Testing Framework](https://vitest.dev/)
- [Faker.js for Test Data](https://fakerjs.dev/)