# Testing Patterns with Enhanced Neon Infrastructure

This guide provides comprehensive testing patterns and best practices for using the Enhanced Neon Testing Infrastructure across different testing scenarios.

## Table of Contents

1. [Unit Testing Patterns](#unit-testing-patterns)
2. [Integration Testing Patterns](#integration-testing-patterns)
3. [End-to-End Testing Patterns](#end-to-end-testing-patterns)
4. [Performance Testing Patterns](#performance-testing-patterns)
5. [Data Seeding Patterns](#data-seeding-patterns)
6. [Migration Testing Patterns](#migration-testing-patterns)
7. [Parallel Testing Patterns](#parallel-testing-patterns)
8. [Error Handling Patterns](#error-handling-patterns)
9. [CI/CD Patterns](#cicd-patterns)
10. [Advanced Patterns](#advanced-patterns)

## Unit Testing Patterns

### Basic Unit Test with Isolated Database

```typescript
import { describe, it, beforeEach, afterEach } from 'vitest';
import { getNeonApiClient, type TestBranchInfo } from '@/lib/testing/neon-api-client';
import { UserService } from '@/services/user-service';

describe('UserService Unit Tests', () => {
  let client: EnhancedNeonApiClient;
  let branchInfo: TestBranchInfo;
  let userService: UserService;

  beforeEach(async () => {
    client = getNeonApiClient();
    
    // Create isolated branch for each test
    const result = await client.createTestBranch({
      testSuite: 'user-service',
      purpose: 'unit-test',
      tags: ['unit', 'users']
    });
    
    branchInfo = result.data!;
    
    // Initialize service with test database
    userService = new UserService(branchInfo.connectionString);
    
    // Setup schema
    await client.executeSql(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `, branchInfo.branchId);
  });

  afterEach(async () => {
    // Cleanup
    await userService.disconnect();
    await client.deleteTestBranch(branchInfo.branchName);
  });

  it('should create user with valid data', async () => {
    const user = await userService.createUser({
      email: 'test@example.com',
      name: 'Test User'
    });

    expect(user).toBeDefined();
    expect(user.email).toBe('test@example.com');
    expect(user.id).toBeGreaterThan(0);
  });

  it('should prevent duplicate emails', async () => {
    await userService.createUser({
      email: 'duplicate@example.com',
      name: 'First User'
    });

    await expect(
      userService.createUser({
        email: 'duplicate@example.com',
        name: 'Second User'
      })
    ).rejects.toThrow('duplicate key');
  });
});
```

### Repository Pattern Testing

```typescript
import { describe, it, beforeAll, afterAll } from 'vitest';
import { getNeonApiClient } from '@/lib/testing/neon-api-client';
import { UserRepository } from '@/repositories/user-repository';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

describe('UserRepository Tests', () => {
  let client: EnhancedNeonApiClient;
  let sql: postgres.Sql;
  let db: ReturnType<typeof drizzle>;
  let userRepo: UserRepository;
  let branchInfo: TestBranchInfo;

  beforeAll(async () => {
    client = getNeonApiClient();
    
    const result = await client.createTestBranch({
      testSuite: 'user-repository',
      purpose: 'repository-testing',
      tags: ['unit', 'repository']
    });
    
    branchInfo = result.data!;
    
    // Setup database connection
    sql = postgres(branchInfo.connectionString);
    db = drizzle(sql);
    userRepo = new UserRepository(db);
    
    // Run migrations
    await migrate(db);
  });

  afterAll(async () => {
    await sql.end();
    await client.deleteTestBranch(branchInfo.branchName);
  });

  describe('findById', () => {
    it('should return user when exists', async () => {
      // Seed test data
      const [created] = await db.insert(users).values({
        email: 'findbyid@example.com',
        name: 'Find Me'
      }).returning();

      const found = await userRepo.findById(created.id);
      
      expect(found).toBeDefined();
      expect(found?.email).toBe('findbyid@example.com');
    });

    it('should return null when not exists', async () => {
      const found = await userRepo.findById(99999);
      expect(found).toBeNull();
    });
  });

  describe('search', () => {
    it('should find users by partial name', async () => {
      // Seed test data
      await db.insert(users).values([
        { email: 'john@example.com', name: 'John Doe' },
        { email: 'jane@example.com', name: 'Jane Doe' },
        { email: 'bob@example.com', name: 'Bob Smith' }
      ]);

      const results = await userRepo.search('Doe');
      
      expect(results).toHaveLength(2);
      expect(results.map(u => u.name)).toContain('John Doe');
      expect(results.map(u => u.name)).toContain('Jane Doe');
    });
  });
});
```

## Integration Testing Patterns

### API Integration Testing

```typescript
import { describe, it, beforeAll, afterAll } from 'vitest';
import { getNeonApiClient } from '@/lib/testing/neon-api-client';
import { createTestServer } from '@/test-utils/server';
import supertest from 'supertest';

describe('User API Integration Tests', () => {
  let client: EnhancedNeonApiClient;
  let server: any;
  let request: supertest.SuperTest<supertest.Test>;
  let branchInfo: TestBranchInfo;

  beforeAll(async () => {
    client = getNeonApiClient();
    
    // Create test branch
    const result = await client.createTestBranch({
      testSuite: 'user-api',
      purpose: 'integration',
      tags: ['integration', 'api']
    });
    
    branchInfo = result.data!;
    
    // Create test server with test database
    server = await createTestServer({
      databaseUrl: branchInfo.connectionString
    });
    
    request = supertest(server);
    
    // Setup test data
    await client.executeTransaction([
      `CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE,
        name VARCHAR(100),
        password_hash VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE TABLE sessions (
        id VARCHAR(255) PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        expires_at TIMESTAMP
      )`,
      `INSERT INTO users (email, name, password_hash) 
       VALUES ('admin@example.com', 'Admin User', '$2b$10$...')`
    ], branchInfo.branchId);
  });

  afterAll(async () => {
    await server.close();
    await client.deleteTestBranch(branchInfo.branchName);
  });

  describe('POST /api/users', () => {
    it('should create new user', async () => {
      const response = await request
        .post('/api/users')
        .send({
          email: 'newuser@example.com',
          name: 'New User',
          password: 'SecurePass123!'
        })
        .expect(201);

      expect(response.body).toMatchObject({
        id: expect.any(Number),
        email: 'newuser@example.com',
        name: 'New User'
      });

      // Verify in database
      const dbResult = await client.executeSql(
        "SELECT * FROM users WHERE email = 'newuser@example.com'",
        branchInfo.branchId
      );
      
      expect(dbResult.data.rows).toHaveLength(1);
    });

    it('should validate email format', async () => {
      const response = await request
        .post('/api/users')
        .send({
          email: 'invalid-email',
          name: 'Test User',
          password: 'SecurePass123!'
        })
        .expect(400);

      expect(response.body.error).toContain('Invalid email');
    });
  });

  describe('GET /api/users/:id', () => {
    it('should return user details', async () => {
      // Create test user
      const createResult = await client.executeSql(
        `INSERT INTO users (email, name, password_hash) 
         VALUES ('getuser@example.com', 'Get User', '$2b$10$...') 
         RETURNING id`,
        branchInfo.branchId
      );
      
      const userId = createResult.data.rows[0].id;

      const response = await request
        .get(`/api/users/${userId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: userId,
        email: 'getuser@example.com',
        name: 'Get User'
      });
    });

    it('should return 404 for non-existent user', async () => {
      await request
        .get('/api/users/99999')
        .expect(404);
    });
  });
});
```

### Service Integration Testing

```typescript
describe('Order Processing Integration', () => {
  let client: EnhancedNeonApiClient;
  let orderService: OrderService;
  let paymentService: PaymentService;
  let inventoryService: InventoryService;
  let branchInfo: TestBranchInfo;

  beforeAll(async () => {
    client = getNeonApiClient();
    
    const result = await client.createTestBranch({
      testSuite: 'order-processing',
      purpose: 'integration',
      tags: ['integration', 'orders']
    });
    
    branchInfo = result.data!;
    
    // Initialize services
    const dbUrl = branchInfo.connectionString;
    orderService = new OrderService(dbUrl);
    paymentService = new PaymentService(dbUrl);
    inventoryService = new InventoryService(dbUrl);
    
    // Setup schema and test data
    await setupOrderSchema(client, branchInfo.branchId);
  });

  it('should process complete order workflow', async () => {
    // 1. Check inventory
    const product = await inventoryService.getProduct('PROD-001');
    expect(product.stock).toBeGreaterThan(0);

    // 2. Create order
    const order = await orderService.createOrder({
      userId: 1,
      items: [{ productId: 'PROD-001', quantity: 2 }]
    });

    expect(order.status).toBe('pending');

    // 3. Process payment
    const payment = await paymentService.processPayment({
      orderId: order.id,
      amount: order.total,
      method: 'credit_card'
    });

    expect(payment.status).toBe('completed');

    // 4. Update order status
    await orderService.updateOrderStatus(order.id, 'paid');

    // 5. Update inventory
    await inventoryService.decrementStock('PROD-001', 2);

    // 6. Verify final state
    const finalOrder = await orderService.getOrder(order.id);
    const finalProduct = await inventoryService.getProduct('PROD-001');

    expect(finalOrder.status).toBe('paid');
    expect(finalProduct.stock).toBe(product.stock - 2);
  });
});
```

## End-to-End Testing Patterns

### E2E with Playwright

```typescript
import { test, expect } from '@playwright/test';
import { getNeonApiClient } from '@/lib/testing/neon-api-client';
import { setupNeonForPlaywright } from '@/tests/config/neon-branch-setup';

test.describe('User Registration E2E', () => {
  let branchCleanup: () => Promise<void>;
  let databaseUrl: string;

  test.beforeEach(async ({ page }, testInfo) => {
    // Create test branch for E2E test
    const branch = await setupNeonForPlaywright(testInfo);
    databaseUrl = branch.databaseUrl;
    branchCleanup = branch.cleanup;

    // Seed initial data
    const client = getNeonApiClient();
    await client.executeSql(
      `INSERT INTO settings (key, value) 
       VALUES ('registrations_open', 'true')`,
      branch.branchId
    );

    // Set database URL for the application
    await page.addInitScript((dbUrl) => {
      window.__TEST_DATABASE_URL = dbUrl;
    }, databaseUrl);
  });

  test.afterEach(async () => {
    await branchCleanup();
  });

  test('should complete registration flow', async ({ page }) => {
    // Navigate to registration
    await page.goto('/register');

    // Fill registration form
    await page.fill('[name="email"]', 'e2e@example.com');
    await page.fill('[name="password"]', 'SecurePass123!');
    await page.fill('[name="confirmPassword"]', 'SecurePass123!');
    await page.fill('[name="name"]', 'E2E Test User');

    // Submit form
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL('/dashboard');

    // Verify user is logged in
    await expect(page.locator('[data-testid="user-menu"]')).toContainText('E2E Test User');

    // Verify in database
    const client = getNeonApiClient();
    const result = await client.executeSql(
      "SELECT * FROM users WHERE email = 'e2e@example.com'",
      databaseUrl
    );

    expect(result.data.rows).toHaveLength(1);
    expect(result.data.rows[0].name).toBe('E2E Test User');
  });
});
```

### Full Application E2E Testing

```typescript
test.describe('Shopping Cart E2E', () => {
  let client: EnhancedNeonApiClient;
  let testContext: {
    branchInfo: TestBranchInfo;
    baseUrl: string;
    testUser: { email: string; password: string };
  };

  test.beforeAll(async () => {
    client = getNeonApiClient();
    
    // Create test branch with seed data
    const result = await client.createTestBranch({
      testSuite: 'shopping-cart-e2e',
      purpose: 'e2e-testing',
      tags: ['e2e', 'shopping-cart']
    });
    
    const branchInfo = result.data!;
    
    // Seed complete test data
    await seedE2ETestData(client, branchInfo.branchId);
    
    // Start test application with test database
    const baseUrl = await startTestApp(branchInfo.connectionString);
    
    testContext = {
      branchInfo,
      baseUrl,
      testUser: {
        email: 'testuser@example.com',
        password: 'TestPass123!'
      }
    };
  });

  test.afterAll(async () => {
    await stopTestApp();
    await client.deleteTestBranch(testContext.branchInfo.branchName);
  });

  test('complete purchase flow', async ({ page }) => {
    const { baseUrl, testUser } = testContext;

    // 1. Login
    await page.goto(`${baseUrl}/login`);
    await page.fill('[name="email"]', testUser.email);
    await page.fill('[name="password"]', testUser.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${baseUrl}/dashboard`);

    // 2. Browse products
    await page.goto(`${baseUrl}/products`);
    await expect(page.locator('.product-card')).toHaveCount(10);

    // 3. Add to cart
    await page.click('[data-product-id="1"] button:has-text("Add to Cart")');
    await page.click('[data-product-id="3"] button:has-text("Add to Cart")');
    
    // Verify cart badge
    await expect(page.locator('.cart-badge')).toHaveText('2');

    // 4. Checkout
    await page.goto(`${baseUrl}/cart`);
    await expect(page.locator('.cart-item')).toHaveCount(2);
    
    await page.click('button:has-text("Proceed to Checkout")');

    // 5. Complete order
    await page.fill('[name="cardNumber"]', '4242424242424242');
    await page.fill('[name="cardExpiry"]', '12/25');
    await page.fill('[name="cardCvc"]', '123');
    
    await page.click('button:has-text("Place Order")');

    // 6. Verify order confirmation
    await page.waitForURL(/\/orders\/\d+/);
    await expect(page.locator('h1')).toContainText('Order Confirmed');
    
    // Extract order ID
    const orderId = page.url().match(/\/orders\/(\d+)/)?.[1];

    // 7. Verify in database
    const orderResult = await client.executeSql(
      `SELECT * FROM orders WHERE id = ${orderId}`,
      testContext.branchInfo.branchId
    );

    expect(orderResult.data.rows[0].status).toBe('completed');
    expect(orderResult.data.rows[0].user_id).toBe(1);
  });
});
```

## Performance Testing Patterns

### Load Testing Pattern

```typescript
import { describe, it } from 'vitest';
import { getNeonApiClient } from '@/lib/testing/neon-api-client';
import pLimit from 'p-limit';

describe('Performance Testing', () => {
  const client = getNeonApiClient();

  it('should handle concurrent operations', async () => {
    await client.withTestBranch(
      {
        testSuite: 'performance',
        purpose: 'load-testing',
        tags: ['performance', 'load']
      },
      async (branchInfo) => {
        // Setup schema
        await client.executeSql(`
          CREATE TABLE performance_test (
            id SERIAL PRIMARY KEY,
            data JSONB,
            created_at TIMESTAMP DEFAULT NOW()
          );
          CREATE INDEX idx_perf_created ON performance_test(created_at);
        `, branchInfo.branchId);

        // Configure concurrency
        const concurrency = 10;
        const totalOperations = 1000;
        const limit = pLimit(concurrency);

        // Track metrics
        const startTime = Date.now();
        const results = {
          successful: 0,
          failed: 0,
          durations: [] as number[]
        };

        // Execute concurrent operations
        const operations = Array.from({ length: totalOperations }, (_, i) =>
          limit(async () => {
            const opStart = Date.now();
            try {
              await client.executeSql(
                `INSERT INTO performance_test (data) 
                 VALUES ('{"index": ${i}, "timestamp": "${new Date().toISOString()}"}'::jsonb)`,
                branchInfo.branchId
              );
              results.successful++;
              results.durations.push(Date.now() - opStart);
            } catch (error) {
              results.failed++;
              console.error(`Operation ${i} failed:`, error);
            }
          })
        );

        await Promise.all(operations);

        // Calculate metrics
        const totalDuration = Date.now() - startTime;
        const avgDuration = results.durations.reduce((a, b) => a + b, 0) / results.durations.length;
        const throughput = totalOperations / (totalDuration / 1000);

        console.log(`Performance Test Results:
          Total Operations: ${totalOperations}
          Successful: ${results.successful}
          Failed: ${results.failed}
          Total Duration: ${totalDuration}ms
          Average Operation: ${avgDuration.toFixed(2)}ms
          Throughput: ${throughput.toFixed(2)} ops/sec
          Concurrency: ${concurrency}
        `);

        // Verify data integrity
        const countResult = await client.executeSql(
          'SELECT COUNT(*) as count FROM performance_test',
          branchInfo.branchId
        );

        expect(countResult.data.rows[0].count).toBe(String(results.successful));
      }
    );
  });

  it('should measure query performance', async () => {
    await client.withTestBranch(
      {
        testSuite: 'query-performance',
        purpose: 'performance-testing',
        tags: ['performance', 'query']
      },
      async (branchInfo) => {
        // Create test schema with various indexes
        await client.executeTransaction([
          `CREATE TABLE users (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE,
            name VARCHAR(100),
            country VARCHAR(2),
            created_at TIMESTAMP DEFAULT NOW(),
            metadata JSONB
          )`,
          `CREATE INDEX idx_users_country ON users(country)`,
          `CREATE INDEX idx_users_created ON users(created_at)`,
          `CREATE INDEX idx_users_metadata ON users USING GIN (metadata)`
        ], branchInfo.branchId);

        // Insert test data
        const countries = ['US', 'UK', 'DE', 'FR', 'JP'];
        const batchSize = 10000;
        
        console.log(`Inserting ${batchSize} test records...`);
        
        const values = Array.from({ length: batchSize }, (_, i) => {
          const country = countries[Math.floor(Math.random() * countries.length)];
          return `('user${i}@example.com', 'User ${i}', '${country}', 
                   '{"age": ${20 + Math.floor(Math.random() * 50)}, "active": true}'::jsonb)`;
        }).join(',');

        await client.executeSql(
          `INSERT INTO users (email, name, country, metadata) VALUES ${values}`,
          branchInfo.branchId
        );

        // Test various query patterns
        const queries = [
          {
            name: 'Simple lookup by primary key',
            sql: 'SELECT * FROM users WHERE id = 5000'
          },
          {
            name: 'Index scan on country',
            sql: "SELECT COUNT(*) FROM users WHERE country = 'US'"
          },
          {
            name: 'Range scan on timestamp',
            sql: "SELECT * FROM users WHERE created_at > NOW() - INTERVAL '1 hour' LIMIT 100"
          },
          {
            name: 'JSONB query',
            sql: "SELECT * FROM users WHERE metadata->>'age' > '30' LIMIT 100"
          },
          {
            name: 'Complex join simulation',
            sql: `SELECT u1.*, COUNT(u2.id) as same_country_count
                  FROM users u1
                  LEFT JOIN users u2 ON u1.country = u2.country AND u1.id != u2.id
                  WHERE u1.id IN (1, 100, 1000, 5000)
                  GROUP BY u1.id`
          }
        ];

        // Execute and measure each query
        const results = [];
        
        for (const query of queries) {
          const measurements = [];
          
          // Run each query multiple times for accuracy
          for (let i = 0; i < 5; i++) {
            const start = Date.now();
            await client.executeSql(query.sql, branchInfo.branchId);
            measurements.push(Date.now() - start);
          }
          
          const avg = measurements.reduce((a, b) => a + b) / measurements.length;
          results.push({
            query: query.name,
            avgTime: avg.toFixed(2),
            minTime: Math.min(...measurements),
            maxTime: Math.max(...measurements)
          });
        }

        console.table(results);
      }
    );
  });
});
```

### Stress Testing Pattern

```typescript
describe('Stress Testing', () => {
  it('should handle database limits gracefully', async () => {
    const client = getNeonApiClient();
    
    await client.withTestBranch(
      {
        testSuite: 'stress-test',
        purpose: 'stress-testing',
        tags: ['stress', 'limits']
      },
      async (branchInfo) => {
        // Test connection pool limits
        const connectionPromises = Array.from({ length: 50 }, async (_, i) => {
          const sql = postgres(branchInfo.connectionString);
          try {
            await sql`SELECT pg_backend_pid(), pg_sleep(0.1)`;
            return { success: true, connection: i };
          } catch (error) {
            return { success: false, connection: i, error };
          } finally {
            await sql.end();
          }
        });

        const results = await Promise.all(connectionPromises);
        const successful = results.filter(r => r.success).length;
        
        console.log(`Connection stress test: ${successful}/50 successful`);

        // Test transaction size limits
        try {
          const hugeTransaction = Array.from({ length: 10000 }, (_, i) =>
            `INSERT INTO test_table VALUES (${i}, 'data ${i}');`
          );

          await client.executeTransaction(hugeTransaction, branchInfo.branchId);
          console.log('Large transaction succeeded');
        } catch (error) {
          console.log('Large transaction failed (expected):', error.message);
        }

        // Test query timeout
        try {
          await client.executeSql(
            'SELECT pg_sleep(65)', // 65 second sleep
            branchInfo.branchId
          );
        } catch (error) {
          console.log('Long query timed out (expected):', error.message);
        }
      }
    );
  });
});
```

## Data Seeding Patterns

### Factory Pattern for Test Data

```typescript
// factories/user-factory.ts
export class UserFactory {
  private counter = 0;

  create(overrides: Partial<User> = {}): User {
    this.counter++;
    return {
      id: this.counter,
      email: `user${this.counter}@example.com`,
      name: `Test User ${this.counter}`,
      createdAt: new Date(),
      ...overrides
    };
  }

  createMany(count: number, overrides: Partial<User> = {}): User[] {
    return Array.from({ length: count }, () => this.create(overrides));
  }

  async seed(client: EnhancedNeonApiClient, branchId: string, count: number) {
    const users = this.createMany(count);
    const values = users.map(u => 
      `('${u.email}', '${u.name}', NOW())`
    ).join(',');

    await client.executeSql(
      `INSERT INTO users (email, name, created_at) VALUES ${values}`,
      branchId
    );

    return users;
  }
}

// Usage in tests
describe('User Tests with Factory', () => {
  let client: EnhancedNeonApiClient;
  let userFactory: UserFactory;

  beforeEach(() => {
    client = getNeonApiClient();
    userFactory = new UserFactory();
  });

  it('should test with seeded users', async () => {
    await client.withTestBranch(
      { testSuite: 'user-factory-test' },
      async (branchInfo) => {
        // Seed 50 users
        const users = await userFactory.seed(client, branchInfo.branchId, 50);
        
        // Test with seeded data
        const result = await client.executeSql(
          'SELECT COUNT(*) as count FROM users',
          branchInfo.branchId
        );
        
        expect(result.data.rows[0].count).toBe('50');
      }
    );
  });
});
```

### Scenario-Based Seeding

```typescript
// seed/scenarios.ts
export class TestScenarios {
  constructor(private client: EnhancedNeonApiClient) {}

  async seedEcommerceScenario(branchId: string) {
    await this.client.executeTransaction([
      // Users
      `INSERT INTO users (email, name, role) VALUES
        ('admin@store.com', 'Admin User', 'admin'),
        ('customer1@example.com', 'John Customer', 'customer'),
        ('customer2@example.com', 'Jane Buyer', 'customer')`,
      
      // Categories
      `INSERT INTO categories (name, slug) VALUES
        ('Electronics', 'electronics'),
        ('Clothing', 'clothing'),
        ('Books', 'books')`,
      
      // Products
      `INSERT INTO products (name, category_id, price, stock) VALUES
        ('Laptop Pro', 1, 1299.99, 10),
        ('Smartphone X', 1, 899.99, 25),
        ('Winter Jacket', 2, 149.99, 50),
        ('Programming Book', 3, 49.99, 100)`,
      
      // Orders with different statuses
      `INSERT INTO orders (user_id, status, total) VALUES
        (2, 'completed', 1299.99),
        (2, 'processing', 899.99),
        (3, 'cancelled', 149.99)`,
      
      // Reviews
      `INSERT INTO reviews (product_id, user_id, rating, comment) VALUES
        (1, 2, 5, 'Excellent laptop!'),
        (2, 3, 4, 'Good phone, battery could be better')`
    ], branchId);
  }

  async seedBlogScenario(branchId: string) {
    await this.client.executeTransaction([
      // Authors
      `INSERT INTO authors (name, email, bio) VALUES
        ('Tech Writer', 'tech@blog.com', 'Writing about technology'),
        ('Travel Blogger', 'travel@blog.com', 'Exploring the world')`,
      
      // Posts with different states
      `INSERT INTO posts (author_id, title, content, status, published_at) VALUES
        (1, 'Getting Started with AI', 'Content...', 'published', NOW() - INTERVAL '2 days'),
        (1, 'Draft Post', 'Work in progress...', 'draft', NULL),
        (2, 'Best Places in Europe', 'Content...', 'published', NOW() - INTERVAL '1 week')`,
      
      // Comments
      `INSERT INTO comments (post_id, author_name, content, approved) VALUES
        (1, 'Reader One', 'Great article!', true),
        (1, 'Reader Two', 'Thanks for sharing', true),
        (1, 'Spammer', 'Buy cheap stuff...', false)`
    ], branchId);
  }
}

// Usage
it('should test blog features', async () => {
  const scenarios = new TestScenarios(client);
  
  await client.withTestBranch(
    { testSuite: 'blog-scenario' },
    async (branchInfo) => {
      await scenarios.seedBlogScenario(branchInfo.branchId);
      
      // Test with realistic data
      const posts = await client.executeSql(
        "SELECT * FROM posts WHERE status = 'published' ORDER BY published_at DESC",
        branchInfo.branchId
      );
      
      expect(posts.data.rows).toHaveLength(2);
    }
  );
});
```

## Migration Testing Patterns

### Schema Migration Testing

```typescript
describe('Database Migrations', () => {
  const client = getNeonApiClient();

  it('should apply migrations successfully', async () => {
    await client.withTestBranch(
      {
        testSuite: 'migrations',
        purpose: 'migration-testing',
        tags: ['migrations', 'schema']
      },
      async (branchInfo) => {
        // Test migration sequence
        const migrations = [
          {
            version: '001',
            name: 'create_users_table',
            up: `CREATE TABLE users (
              id SERIAL PRIMARY KEY,
              email VARCHAR(255) UNIQUE NOT NULL,
              created_at TIMESTAMP DEFAULT NOW()
            )`,
            down: 'DROP TABLE users'
          },
          {
            version: '002',
            name: 'add_user_profile',
            up: `ALTER TABLE users 
                 ADD COLUMN name VARCHAR(100),
                 ADD COLUMN avatar_url VARCHAR(500)`,
            down: `ALTER TABLE users 
                   DROP COLUMN name,
                   DROP COLUMN avatar_url`
          },
          {
            version: '003',
            name: 'add_user_indexes',
            up: `CREATE INDEX idx_users_email ON users(email);
                 CREATE INDEX idx_users_created ON users(created_at DESC)`,
            down: `DROP INDEX idx_users_email;
                   DROP INDEX idx_users_created`
          }
        ];

        // Apply migrations
        for (const migration of migrations) {
          console.log(`Applying migration ${migration.version}: ${migration.name}`);
          await client.executeSql(migration.up, branchInfo.branchId);
        }

        // Verify schema
        const schemaResult = await client.executeSql(`
          SELECT 
            column_name,
            data_type,
            is_nullable
          FROM information_schema.columns
          WHERE table_name = 'users'
          ORDER BY ordinal_position
        `, branchInfo.branchId);

        const columns = schemaResult.data.rows;
        expect(columns).toHaveLength(5); // id, email, created_at, name, avatar_url
        expect(columns.find(c => c.column_name === 'name')).toBeDefined();

        // Test rollback
        for (const migration of migrations.reverse()) {
          console.log(`Rolling back migration ${migration.version}: ${migration.name}`);
          await client.executeSql(migration.down, branchInfo.branchId);
        }

        // Verify clean state
        const tablesResult = await client.executeSql(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public'
        `, branchInfo.branchId);

        expect(tablesResult.data.rows).toHaveLength(0);
      }
    );
  });

  it('should handle migration conflicts', async () => {
    await client.withTestBranch(
      {
        testSuite: 'migration-conflicts',
        purpose: 'conflict-testing',
        tags: ['migrations', 'conflicts']
      },
      async (branchInfo) => {
        // Create initial schema
        await client.executeSql(`
          CREATE TABLE products (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100),
            price DECIMAL(10,2)
          )
        `, branchInfo.branchId);

        // Insert data that might conflict
        await client.executeSql(`
          INSERT INTO products (name, price) VALUES
            ('Product A', 10.00),
            ('Product B', 20.00),
            ('Product B', 15.00)  -- Duplicate name
        `, branchInfo.branchId);

        // Try to add unique constraint (should fail)
        try {
          await client.executeSql(
            'ALTER TABLE products ADD CONSTRAINT uk_product_name UNIQUE (name)',
            branchInfo.branchId
          );
          fail('Should have thrown an error');
        } catch (error) {
          expect(error.message).toContain('duplicate');
        }

        // Fix data and retry
        await client.executeSql(
          "UPDATE products SET name = name || ' - ' || id WHERE name IN (SELECT name FROM products GROUP BY name HAVING COUNT(*) > 1)",
          branchInfo.branchId
        );

        // Now constraint should succeed
        await client.executeSql(
          'ALTER TABLE products ADD CONSTRAINT uk_product_name UNIQUE (name)',
          branchInfo.branchId
        );

        // Verify
        const result = await client.executeSql(
          'SELECT * FROM products ORDER BY id',
          branchInfo.branchId
        );

        expect(result.data.rows).toHaveLength(3);
        expect(new Set(result.data.rows.map(r => r.name)).size).toBe(3); // All unique
      }
    );
  });
});
```

## Parallel Testing Patterns

### Test Suite Parallelization

```typescript
import { describe, it } from 'vitest';
import { getNeonApiClient } from '@/lib/testing/neon-api-client';
import pLimit from 'p-limit';

describe('Parallel Test Suites', () => {
  const client = getNeonApiClient();

  it('should run independent test suites in parallel', async () => {
    const testSuites = [
      { name: 'auth', runner: runAuthTests },
      { name: 'users', runner: runUserTests },
      { name: 'products', runner: runProductTests },
      { name: 'orders', runner: runOrderTests },
      { name: 'reports', runner: runReportTests }
    ];

    // Limit concurrency to avoid overwhelming the system
    const limit = pLimit(3);

    const startTime = Date.now();

    const results = await Promise.all(
      testSuites.map(suite =>
        limit(async () => {
          const suiteStart = Date.now();
          
          const result = await client.withTestBranch(
            {
              testSuite: suite.name,
              purpose: 'parallel-suite',
              tags: ['parallel', suite.name]
            },
            async (branchInfo) => {
              console.log(`Starting ${suite.name} on branch ${branchInfo.branchName}`);
              
              // Run suite-specific tests
              const testResults = await suite.runner(branchInfo);
              
              return {
                suite: suite.name,
                branch: branchInfo.branchName,
                duration: Date.now() - suiteStart,
                ...testResults
              };
            }
          );

          return result;
        })
      )
    );

    const totalDuration = Date.now() - startTime;

    // Analyze results
    const summary = {
      totalDuration,
      suites: results.map(r => ({
        name: r.suite,
        duration: r.duration,
        tests: r.totalTests,
        passed: r.passedTests,
        failed: r.failedTests
      })),
      totalTests: results.reduce((sum, r) => sum + r.totalTests, 0),
      totalPassed: results.reduce((sum, r) => sum + r.passedTests, 0),
      totalFailed: results.reduce((sum, r) => sum + r.failedTests, 0)
    };

    console.log('Parallel execution summary:', JSON.stringify(summary, null, 2));

    // All tests should pass
    expect(summary.totalFailed).toBe(0);
    
    // Parallel execution should be faster than sequential
    const sequentialEstimate = results.reduce((sum, r) => sum + r.duration, 0);
    expect(totalDuration).toBeLessThan(sequentialEstimate * 0.7); // At least 30% faster
  });
});

// Example test runner
async function runAuthTests(branchInfo: TestBranchInfo) {
  const results = { totalTests: 0, passedTests: 0, failedTests: 0 };

  // Setup schema
  await client.executeSql(`
    CREATE TABLE auth_users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE,
      password_hash VARCHAR(255)
    );
    CREATE TABLE auth_sessions (
      token VARCHAR(255) PRIMARY KEY,
      user_id INTEGER REFERENCES auth_users(id),
      expires_at TIMESTAMP
    );
  `, branchInfo.branchId);

  // Test user registration
  try {
    await client.executeSql(
      `INSERT INTO auth_users (email, password_hash) 
       VALUES ('test@example.com', '$2b$10$...')`,
      branchInfo.branchId
    );
    results.passedTests++;
  } catch (error) {
    results.failedTests++;
  }
  results.totalTests++;

  // Test session creation
  try {
    await client.executeSql(
      `INSERT INTO auth_sessions (token, user_id, expires_at) 
       VALUES ('test-token', 1, NOW() + INTERVAL '1 day')`,
      branchInfo.branchId
    );
    results.passedTests++;
  } catch (error) {
    results.failedTests++;
  }
  results.totalTests++;

  return results;
}
```

### Sharded Test Execution

```typescript
describe('Sharded Test Execution', () => {
  it('should distribute tests across shards', async () => {
    const client = getNeonApiClient();
    const totalTests = 100;
    const shardCount = 4;

    // Divide tests into shards
    const shards = Array.from({ length: shardCount }, (_, shardIndex) => {
      const testsPerShard = Math.ceil(totalTests / shardCount);
      const start = shardIndex * testsPerShard;
      const end = Math.min(start + testsPerShard, totalTests);
      
      return {
        shardIndex,
        tests: Array.from({ length: end - start }, (_, i) => ({
          id: start + i,
          name: `test_${start + i}`
        }))
      };
    });

    // Run shards in parallel
    const shardResults = await Promise.all(
      shards.map(shard =>
        client.withTestBranch(
          {
            testSuite: `shard-${shard.shardIndex}`,
            purpose: 'sharded-testing',
            tags: ['sharded', `shard-${shard.shardIndex}`]
          },
          async (branchInfo) => {
            console.log(`Shard ${shard.shardIndex} running ${shard.tests.length} tests`);

            // Setup test table
            await client.executeSql(`
              CREATE TABLE test_results (
                test_id INTEGER PRIMARY KEY,
                test_name VARCHAR(100),
                status VARCHAR(20),
                duration_ms INTEGER,
                executed_at TIMESTAMP DEFAULT NOW()
              )
            `, branchInfo.branchId);

            // Execute tests in shard
            const results = await Promise.all(
              shard.tests.map(async test => {
                const start = Date.now();
                
                // Simulate test execution
                await new Promise(resolve => 
                  setTimeout(resolve, Math.random() * 100)
                );
                
                const duration = Date.now() - start;
                const status = Math.random() > 0.05 ? 'passed' : 'failed';

                await client.executeSql(
                  `INSERT INTO test_results (test_id, test_name, status, duration_ms)
                   VALUES (${test.id}, '${test.name}', '${status}', ${duration})`,
                  branchInfo.branchId
                );

                return { testId: test.id, status, duration };
              })
            );

            return {
              shard: shard.shardIndex,
              branch: branchInfo.branchName,
              testCount: shard.tests.length,
              results
            };
          }
        )
      )
    );

    // Aggregate results
    const allResults = shardResults.flatMap(s => s.results);
    const summary = {
      totalTests: allResults.length,
      passed: allResults.filter(r => r.status === 'passed').length,
      failed: allResults.filter(r => r.status === 'failed').length,
      avgDuration: allResults.reduce((sum, r) => sum + r.duration, 0) / allResults.length,
      shards: shardResults.map(s => ({
        shard: s.shard,
        tests: s.testCount,
        branch: s.branch
      }))
    };

    console.log('Sharded execution summary:', summary);
    expect(summary.totalTests).toBe(totalTests);
  });
});
```

## Error Handling Patterns

### Graceful Error Recovery

```typescript
describe('Error Handling', () => {
  const client = getNeonApiClient();

  it('should handle and recover from errors gracefully', async () => {
    await client.withTestBranch(
      {
        testSuite: 'error-handling',
        purpose: 'error-recovery',
        tags: ['error-handling']
      },
      async (branchInfo) => {
        const errors = [];

        // Test 1: Handle constraint violations
        try {
          await client.executeSql(`
            CREATE TABLE test_unique (
              id SERIAL PRIMARY KEY,
              email VARCHAR(255) UNIQUE
            )
          `, branchInfo.branchId);

          await client.executeSql(
            "INSERT INTO test_unique (email) VALUES ('duplicate@example.com')",
            branchInfo.branchId
          );

          // This should fail
          await client.executeSql(
            "INSERT INTO test_unique (email) VALUES ('duplicate@example.com')",
            branchInfo.branchId
          );
        } catch (error) {
          errors.push({
            type: 'constraint_violation',
            handled: true,
            message: error.message
          });

          // Recover by updating instead
          await client.executeSql(
            "UPDATE test_unique SET email = 'updated@example.com' WHERE email = 'duplicate@example.com'",
            branchInfo.branchId
          );
        }

        // Test 2: Handle missing tables
        try {
          await client.executeSql(
            'SELECT * FROM non_existent_table',
            branchInfo.branchId
          );
        } catch (error) {
          errors.push({
            type: 'table_not_found',
            handled: true,
            message: error.message
          });

          // Recover by creating the table
          await client.executeSql(
            'CREATE TABLE non_existent_table (id SERIAL PRIMARY KEY)',
            branchInfo.branchId
          );
        }

        // Test 3: Handle transaction rollback
        try {
          await client.executeTransaction([
            'BEGIN',
            'INSERT INTO test_unique (email) VALUES (\'transaction@example.com\')',
            'INSERT INTO test_unique (email) VALUES (\'transaction@example.com\')', // Duplicate
            'COMMIT'
          ], branchInfo.branchId);
        } catch (error) {
          errors.push({
            type: 'transaction_rollback',
            handled: true,
            message: error.message
          });

          // Verify rollback worked
          const result = await client.executeSql(
            "SELECT COUNT(*) as count FROM test_unique WHERE email = 'transaction@example.com'",
            branchInfo.branchId
          );
          
          expect(result.data.rows[0].count).toBe('0');
        }

        expect(errors).toHaveLength(3);
        errors.forEach(error => {
          expect(error.handled).toBe(true);
        });
      }
    );
  });

  it('should implement retry logic for transient failures', async () => {
    await client.withTestBranch(
      {
        testSuite: 'retry-logic',
        purpose: 'transient-failures',
        tags: ['retry', 'resilience']
      },
      async (branchInfo) => {
        let attempts = 0;
        const maxRetries = 3;

        async function retryableOperation() {
          attempts++;
          
          if (attempts < 3) {
            // Simulate transient failure
            throw new Error('Temporary connection error');
          }
          
          // Success on third attempt
          return await client.executeSql(
            'SELECT NOW() as current_time',
            branchInfo.branchId
          );
        }

        async function withRetry(operation: () => Promise<any>, retries = maxRetries) {
          for (let i = 0; i < retries; i++) {
            try {
              return await operation();
            } catch (error) {
              if (i === retries - 1) throw error;
              
              // Exponential backoff
              const delay = Math.min(1000 * Math.pow(2, i), 10000);
              console.log(`Attempt ${i + 1} failed, retrying in ${delay}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        }

        const result = await withRetry(retryableOperation);
        
        expect(result.success).toBe(true);
        expect(attempts).toBe(3);
      }
    );
  });
});
```

## CI/CD Patterns

### GitHub Actions Integration

```yaml
# .github/workflows/test-with-neon.yml
name: Test with Neon Branches

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    env:
      NEON_PROJECT_ID: ${{ secrets.NEON_PROJECT_ID }}
      
    strategy:
      matrix:
        test-suite: [unit, integration, e2e]
        shard: [1, 2, 3, 4]
        
    steps:
      - uses: actions/checkout@v4
      
      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest
          
      - name: Install dependencies
        run: bun install
        
      - name: Run tests with Neon branch
        run: |
          bun test \
            --shard=${{ matrix.shard }}/4 \
            --suite=${{ matrix.test-suite }} \
            --reporter=json \
            --outputFile=results-${{ matrix.test-suite }}-${{ matrix.shard }}.json
            
      - name: Upload test results
        uses: actions/upload-artifact@v4
        with:
          name: test-results-${{ matrix.test-suite }}-${{ matrix.shard }}
          path: results-${{ matrix.test-suite }}-${{ matrix.shard }}.json
          
  cleanup:
    runs-on: ubuntu-latest
    needs: test
    if: always()
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Cleanup test branches
        run: |
          bun run test:branches:cleanup \
            --max-age=1 \
            --prefix=test-ci \
            --force
```

### Pre-commit Testing

```typescript
// scripts/pre-commit-test.ts
import { getNeonApiClient } from '@/lib/testing/neon-api-client';
import { execSync } from 'child_process';

async function runPreCommitTests() {
  const client = getNeonApiClient();
  
  console.log('Running pre-commit tests...');
  
  try {
    // Get changed files
    const changedFiles = execSync('git diff --cached --name-only', { encoding: 'utf-8' })
      .split('\n')
      .filter(Boolean);
    
    // Determine affected test suites
    const testSuites = new Set<string>();
    
    changedFiles.forEach(file => {
      if (file.includes('auth')) testSuites.add('auth');
      if (file.includes('user')) testSuites.add('users');
      if (file.includes('product')) testSuites.add('products');
    });
    
    if (testSuites.size === 0) {
      console.log('No relevant tests to run');
      return;
    }
    
    // Run tests in parallel with isolated branches
    const results = await Promise.all(
      Array.from(testSuites).map(suite =>
        client.withTestBranch(
          {
            testSuite: `pre-commit-${suite}`,
            purpose: 'pre-commit',
            tags: ['pre-commit', suite]
          },
          async (branchInfo) => {
            console.log(`Running ${suite} tests on ${branchInfo.branchName}`);
            
            const testCommand = `bun test tests/${suite} --run`;
            try {
              execSync(testCommand, {
                env: {
                  ...process.env,
                  DATABASE_URL: branchInfo.connectionString
                }
              });
              return { suite, success: true };
            } catch (error) {
              return { suite, success: false, error };
            }
          }
        )
      )
    );
    
    // Check results
    const failed = results.filter(r => !r.success);
    
    if (failed.length > 0) {
      console.error('Pre-commit tests failed:', failed);
      process.exit(1);
    }
    
    console.log('✅ All pre-commit tests passed!');
    
  } catch (error) {
    console.error('Pre-commit test error:', error);
    process.exit(1);
  }
}

runPreCommitTests();
```

## Advanced Patterns

### Multi-Tenant Testing

```typescript
describe('Multi-Tenant System', () => {
  it('should isolate tenant data properly', async () => {
    const client = getNeonApiClient();
    
    await client.withTestBranch(
      {
        testSuite: 'multi-tenant',
        purpose: 'tenant-isolation',
        tags: ['multi-tenant', 'security']
      },
      async (branchInfo) => {
        // Setup multi-tenant schema
        await client.executeTransaction([
          `CREATE TABLE tenants (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100),
            subdomain VARCHAR(50) UNIQUE
          )`,
          `CREATE TABLE tenant_data (
            id SERIAL PRIMARY KEY,
            tenant_id INTEGER REFERENCES tenants(id),
            data JSONB,
            created_at TIMESTAMP DEFAULT NOW()
          )`,
          `CREATE INDEX idx_tenant_data ON tenant_data(tenant_id)`,
          
          // Row-level security
          `ALTER TABLE tenant_data ENABLE ROW LEVEL SECURITY`,
          `CREATE POLICY tenant_isolation ON tenant_data
           FOR ALL USING (tenant_id = current_setting('app.tenant_id')::INTEGER)`
        ], branchInfo.branchId);

        // Create test tenants
        await client.executeSql(`
          INSERT INTO tenants (name, subdomain) VALUES
            ('Tenant A', 'tenant-a'),
            ('Tenant B', 'tenant-b'),
            ('Tenant C', 'tenant-c')
        `, branchInfo.branchId);

        // Test tenant isolation
        async function insertTenantData(tenantId: number, data: any) {
          await client.executeTransaction([
            `SET LOCAL app.tenant_id = '${tenantId}'`,
            `INSERT INTO tenant_data (tenant_id, data) VALUES (${tenantId}, '${JSON.stringify(data)}'::jsonb)`
          ], branchInfo.branchId);
        }

        // Insert data for each tenant
        await insertTenantData(1, { type: 'secret', value: 'tenant-a-secret' });
        await insertTenantData(2, { type: 'secret', value: 'tenant-b-secret' });
        await insertTenantData(3, { type: 'secret', value: 'tenant-c-secret' });

        // Verify isolation
        async function getTenantData(tenantId: number) {
          const result = await client.executeTransaction([
            `SET LOCAL app.tenant_id = '${tenantId}'`,
            `SELECT * FROM tenant_data`
          ], branchInfo.branchId);
          
          return result.data;
        }

        const tenantAData = await getTenantData(1);
        const tenantBData = await getTenantData(2);

        // Each tenant should only see their own data
        expect(tenantAData.length).toBe(1);
        expect(tenantAData[0].data.value).toBe('tenant-a-secret');
        
        expect(tenantBData.length).toBe(1);
        expect(tenantBData[0].data.value).toBe('tenant-b-secret');
      }
    );
  });
});
```

### Event Sourcing Testing

```typescript
describe('Event Sourcing', () => {
  it('should handle event streams correctly', async () => {
    const client = getNeonApiClient();
    
    await client.withTestBranch(
      {
        testSuite: 'event-sourcing',
        purpose: 'event-stream-testing',
        tags: ['event-sourcing', 'cqrs']
      },
      async (branchInfo) => {
        // Setup event store
        await client.executeTransaction([
          `CREATE TABLE events (
            id SERIAL PRIMARY KEY,
            aggregate_id UUID NOT NULL,
            aggregate_type VARCHAR(100) NOT NULL,
            event_type VARCHAR(100) NOT NULL,
            event_data JSONB NOT NULL,
            metadata JSONB,
            version INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
          )`,
          `CREATE INDEX idx_events_aggregate ON events(aggregate_id, version)`,
          `CREATE INDEX idx_events_type ON events(event_type)`,
          
          // Ensure version ordering
          `CREATE UNIQUE INDEX idx_events_version ON events(aggregate_id, version)`
        ], branchInfo.branchId);

        // Event sourcing functions
        async function appendEvent(event: {
          aggregateId: string;
          aggregateType: string;
          eventType: string;
          data: any;
          metadata?: any;
        }) {
          const result = await client.executeSql(`
            INSERT INTO events (
              aggregate_id, 
              aggregate_type, 
              event_type, 
              event_data, 
              metadata,
              version
            ) 
            SELECT 
              '${event.aggregateId}'::uuid,
              '${event.aggregateType}',
              '${event.eventType}',
              '${JSON.stringify(event.data)}'::jsonb,
              '${JSON.stringify(event.metadata || {})}'::jsonb,
              COALESCE(MAX(version), 0) + 1
            FROM events 
            WHERE aggregate_id = '${event.aggregateId}'::uuid
            RETURNING *
          `, branchInfo.branchId);
          
          return result.data.rows[0];
        }

        async function getEvents(aggregateId: string) {
          const result = await client.executeSql(
            `SELECT * FROM events 
             WHERE aggregate_id = '${aggregateId}'::uuid 
             ORDER BY version`,
            branchInfo.branchId
          );
          
          return result.data.rows;
        }

        // Test event stream
        const orderId = '123e4567-e89b-12d3-a456-426614174000';
        
        // Append events
        await appendEvent({
          aggregateId: orderId,
          aggregateType: 'Order',
          eventType: 'OrderCreated',
          data: { 
            customerId: 'cust-123',
            items: [{ productId: 'prod-1', quantity: 2 }]
          }
        });

        await appendEvent({
          aggregateId: orderId,
          aggregateType: 'Order',
          eventType: 'PaymentReceived',
          data: { amount: 99.99, method: 'credit_card' }
        });

        await appendEvent({
          aggregateId: orderId,
          aggregateType: 'Order',
          eventType: 'OrderShipped',
          data: { carrier: 'UPS', trackingNumber: '1Z999AA1' }
        });

        // Get and verify event stream
        const events = await getEvents(orderId);
        
        expect(events).toHaveLength(3);
        expect(events[0].event_type).toBe('OrderCreated');
        expect(events[1].version).toBe(2);
        expect(events[2].version).toBe(3);

        // Test event replay to build current state
        const currentState = events.reduce((state, event) => {
          switch (event.event_type) {
            case 'OrderCreated':
              return { ...state, ...event.event_data, status: 'created' };
            case 'PaymentReceived':
              return { ...state, paid: true, status: 'paid' };
            case 'OrderShipped':
              return { ...state, shipped: true, status: 'shipped', ...event.event_data };
            default:
              return state;
          }
        }, {});

        expect(currentState).toMatchObject({
          status: 'shipped',
          paid: true,
          shipped: true,
          trackingNumber: '1Z999AA1'
        });
      }
    );
  });
});
```

## Summary

These patterns demonstrate the flexibility and power of the Enhanced Neon Testing Infrastructure:

1. **Unit Testing**: Isolated, fast tests with minimal setup
2. **Integration Testing**: Complex multi-service testing scenarios
3. **E2E Testing**: Full application testing with real browsers
4. **Performance Testing**: Load testing and benchmarking
5. **Data Seeding**: Factories and scenario-based test data
6. **Migration Testing**: Schema evolution and conflict handling
7. **Parallel Testing**: Concurrent execution for speed
8. **Error Handling**: Resilient tests with retry logic
9. **CI/CD Integration**: Automated testing in pipelines
10. **Advanced Patterns**: Multi-tenancy, event sourcing, and more

Each pattern leverages the core benefits of Neon's branching:
- **Isolation**: Each test gets its own database
- **Speed**: Branches are created in seconds
- **Cleanup**: Automatic branch deletion
- **Reliability**: Built-in retry and error handling
- **Observability**: Comprehensive logging and metrics

For more examples and detailed API documentation, see:
- [API Reference](./neon-testing-guide.md#api-reference)
- [Quick Start Guide](./neon-testing-quickstart.md)
- [Performance Guide](./performance-testing-guide.md)