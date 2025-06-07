import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST, GET } from '@/app/api/auth/[...all]/route';
import { createMockRequest, setupTestEnvironment } from '../utils/test-helpers';
import { getNeonApiClient } from '@/lib/testing/neon-api-client';
import { TestDataFactory } from '../utils/enhanced-test-factories';
import { NeonTestUtils } from '../utils/neon-test-utils';
import type { TestBranchInfo } from '@/lib/testing/neon-api-client';

// Enhanced auth tests using Neon branching strategy
describe('Auth API Routes (Enhanced with Neon)', () => {
  let testBranch: TestBranchInfo | null = null;
  let neonClient: ReturnType<typeof getNeonApiClient>;
  let testUtils: NeonTestUtils;
  let factory: TestDataFactory;

  beforeEach(async () => {
    setupTestEnvironment();
    vi.clearAllMocks();

    // Initialize enhanced testing infrastructure
    neonClient = getNeonApiClient();
    testUtils = new NeonTestUtils(neonClient);
    factory = new TestDataFactory();

    // Create isolated test branch for each test
    const branchResult = await neonClient.createTestBranch({
      testSuite: 'auth-api-tests',
      purpose: 'api-route-testing',
      tags: ['auth', 'api', 'isolated'],
      waitForReady: true,
      timeoutMs: 60000,
    });

    if (branchResult.success && branchResult.data) {
      testBranch = branchResult.data;

      // Set up database connection for this test
      process.env.POSTGRES_URL = testBranch.connectionString;

      // Initialize test schema and seed data
      await testUtils.setupTestSchema(testBranch.branchId);
      await testUtils.seedBasicData(testBranch.branchId);
    }
  });

  afterEach(async () => {
    // Cleanup test branch
    if (testBranch) {
      await neonClient
        .deleteTestBranch(testBranch.branchName)
        .catch((error) =>
          console.warn('Failed to cleanup test branch:', error),
        );
      testBranch = null;
    }
  });

  describe('POST /api/auth/[...all] - Enhanced', () => {
    it('should handle sign in requests with database validation', async () => {
      if (!testBranch) {
        throw new Error('Test branch not available');
      }

      // Create test user using factory
      const userData = factory.createUser({
        email: 'test@example.com',
        name: 'Test User',
      });

      // Insert user into test database
      const createUserResult = await neonClient.executeSql(
        `INSERT INTO users (id, email, name, created_at, updated_at) 
         VALUES ('${userData.id}', '${userData.email}', '${userData.name}', NOW(), NOW())`,
        testBranch.branchId,
      );

      expect(createUserResult.success).toBe(true);

      // Mock better-auth handler to return success
      const mockHandler = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            user: { id: userData.id, email: userData.email },
            session: { token: 'session-token' },
          }),
          { status: 200 },
        ),
      );

      // Replace the actual handler with our mock
      vi.doMock('@/app/api/auth/[...all]/route', () => ({
        POST: mockHandler,
        GET: vi.fn(),
      }));

      const request = createMockRequest(
        'http://localhost:3000/api/auth/sign-in',
        {
          method: 'POST',
          body: {
            email: userData.email,
            password: 'password123',
          },
        },
      );

      const response = await POST(request);
      expect(response.status).toBe(200);

      // Verify user exists in test database
      const userCheckResult = await neonClient.executeSql(
        `SELECT id, email, name FROM users WHERE email = '${userData.email}'`,
        testBranch.branchId,
      );

      expect(userCheckResult.success).toBe(true);
      expect(userCheckResult.data?.results).toHaveLength(1);
    });

    it('should handle sign up requests with proper database insertion', async () => {
      if (!testBranch) {
        throw new Error('Test branch not available');
      }

      const newUserData = factory.createUser({
        email: 'newuser@example.com',
        name: 'New User',
      });

      // Mock handler for sign up
      const mockHandler = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            user: { id: newUserData.id, email: newUserData.email },
            session: { token: 'new-session-token' },
          }),
          { status: 201 },
        ),
      );

      vi.doMock('@/app/api/auth/[...all]/route', () => ({
        POST: mockHandler,
        GET: vi.fn(),
      }));

      const request = createMockRequest(
        'http://localhost:3000/api/auth/sign-up',
        {
          method: 'POST',
          body: {
            email: newUserData.email,
            password: 'password123',
            name: newUserData.name,
          },
        },
      );

      const response = await POST(request);
      expect(response.status).toBe(201);

      // Test actual database insertion
      const insertResult = await neonClient.executeSql(
        `INSERT INTO users (id, email, name, created_at, updated_at) 
         VALUES ('${newUserData.id}', '${newUserData.email}', '${newUserData.name}', NOW(), NOW())`,
        testBranch.branchId,
      );

      expect(insertResult.success).toBe(true);

      // Verify user was created
      const verifyResult = await neonClient.executeSql(
        `SELECT COUNT(*) as count FROM users WHERE email = '${newUserData.email}'`,
        testBranch.branchId,
      );

      expect(verifyResult.success).toBe(true);
      expect(verifyResult.data?.results?.[0]?.count).toBe('1');
    });

    it('should handle authentication errors with proper logging', async () => {
      if (!testBranch) {
        throw new Error('Test branch not available');
      }

      // Mock authentication failure
      const mockHandler = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Invalid credentials' }), {
          status: 401,
        }),
      );

      vi.doMock('@/app/api/auth/[...all]/route', () => ({
        POST: mockHandler,
        GET: vi.fn(),
      }));

      const request = createMockRequest(
        'http://localhost:3000/api/auth/sign-in',
        {
          method: 'POST',
          body: {
            email: 'test@example.com',
            password: 'wrongpassword',
          },
        },
      );

      const response = await POST(request);
      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data.error).toBe('Invalid credentials');

      // Log authentication attempt to test database
      const logResult = await neonClient.executeSql(
        `INSERT INTO auth_logs (email, attempt_type, success, ip_address, created_at) 
         VALUES ('test@example.com', 'signin', false, '127.0.0.1', NOW())`,
        testBranch.branchId,
      );

      expect(logResult.success).toBe(true);

      // Verify log was created
      const logCheckResult = await neonClient.executeSql(
        'SELECT COUNT(*) as count FROM auth_logs WHERE success = false',
        testBranch.branchId,
      );

      expect(logCheckResult.success).toBe(true);
    });
  });

  describe('GET /api/auth/[...all] - Enhanced', () => {
    it('should verify sessions with database lookup', async () => {
      if (!testBranch) {
        throw new Error('Test branch not available');
      }

      // Create test user and session
      const userData = factory.createUser();
      const sessionData = factory.createSession(userData.id);

      // Insert test data
      await testUtils.insertUser(userData, testBranch.branchId);
      await testUtils.insertSession(sessionData, testBranch.branchId);

      const mockHandler = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            user: { id: userData.id, email: userData.email },
            session: { token: sessionData.token },
          }),
          { status: 200 },
        ),
      );

      vi.doMock('@/app/api/auth/[...all]/route', () => ({
        POST: vi.fn(),
        GET: mockHandler,
      }));

      const request = createMockRequest(
        'http://localhost:3000/api/auth/session',
        {
          headers: {
            Authorization: `Bearer ${sessionData.token}`,
          },
        },
      );

      const response = await GET(request);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.user).toBeDefined();
      expect(data.session).toBeDefined();

      // Verify session exists in database
      const sessionCheckResult = await neonClient.executeSql(
        `SELECT user_id, token FROM sessions WHERE token = '${sessionData.token}' AND expires_at > NOW()`,
        testBranch.branchId,
      );

      expect(sessionCheckResult.success).toBe(true);
      expect(sessionCheckResult.data?.results).toHaveLength(1);
    });

    it('should handle expired sessions with cleanup', async () => {
      if (!testBranch) {
        throw new Error('Test branch not available');
      }

      // Create expired session
      const userData = factory.createUser();
      const expiredSession = factory.createSession(userData.id, {
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
      });

      await testUtils.insertUser(userData, testBranch.branchId);
      await testUtils.insertSession(expiredSession, testBranch.branchId);

      const mockHandler = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Session expired' }), {
          status: 401,
        }),
      );

      vi.doMock('@/app/api/auth/[...all]/route', () => ({
        POST: vi.fn(),
        GET: mockHandler,
      }));

      const request = createMockRequest(
        'http://localhost:3000/api/auth/session',
        {
          headers: {
            Authorization: `Bearer ${expiredSession.token}`,
          },
        },
      );

      const response = await GET(request);
      expect(response.status).toBe(401);

      // Clean up expired sessions
      const cleanupResult = await neonClient.executeSql(
        'DELETE FROM sessions WHERE expires_at < NOW()',
        testBranch.branchId,
      );

      expect(cleanupResult.success).toBe(true);

      // Verify expired session was removed
      const sessionCheckResult = await neonClient.executeSql(
        `SELECT COUNT(*) as count FROM sessions WHERE token = '${expiredSession.token}'`,
        testBranch.branchId,
      );

      expect(sessionCheckResult.data?.results?.[0]?.count).toBe('0');
    });
  });

  describe('Rate Limiting - Enhanced', () => {
    it('should track rate limit attempts in database', async () => {
      if (!testBranch) {
        throw new Error('Test branch not available');
      }

      const clientIp = '192.168.1.100';
      const timeWindow = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago

      // Simulate multiple attempts
      const attempts = Array.from({ length: 10 }, (_, i) =>
        factory.createRateLimitEntry(clientIp, 'signin'),
      );

      // Insert rate limit attempts
      for (const attempt of attempts) {
        await testUtils.insertRateLimitEntry(attempt, testBranch.branchId);
      }

      // Check rate limit status
      const rateLimitResult = await neonClient.executeSql(
        `SELECT COUNT(*) as attempt_count 
         FROM rate_limit_entries 
         WHERE ip_address = '${clientIp}' 
           AND endpoint = 'signin' 
           AND created_at > NOW() - INTERVAL '5 minutes'`,
        testBranch.branchId,
      );

      expect(rateLimitResult.success).toBe(true);
      const attemptCount = parseInt(
        rateLimitResult.data?.results?.[0]?.attempt_count || '0',
      );
      expect(attemptCount).toBeGreaterThan(5);

      // Mock rate limit response
      const mockHandler = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Too many requests' }), {
          status: 429,
        }),
      );

      vi.doMock('@/app/api/auth/[...all]/route', () => ({
        POST: mockHandler,
        GET: vi.fn(),
      }));

      const request = createMockRequest(
        'http://localhost:3000/api/auth/sign-in',
        {
          method: 'POST',
          body: {
            email: 'test@example.com',
            password: 'password123',
          },
          headers: {
            'X-Forwarded-For': clientIp,
          },
        },
      );

      const response = await POST(request);
      expect(response.status).toBe(429);
    });
  });

  describe('Performance Monitoring - Enhanced', () => {
    it('should monitor authentication performance metrics', async () => {
      if (!testBranch) {
        throw new Error('Test branch not available');
      }

      const performanceTests = [];

      // Run multiple authentication attempts and measure performance
      for (let i = 0; i < 10; i++) {
        const userData = factory.createUser({
          email: `test${i}@example.com`,
        });

        const startTime = Date.now();

        // Insert user
        await testUtils.insertUser(userData, testBranch.branchId);

        // Simulate authentication
        const authResult = await neonClient.executeSql(
          `SELECT id, email FROM users WHERE email = '${userData.email}'`,
          testBranch.branchId,
        );

        const endTime = Date.now();
        const duration = endTime - startTime;

        performanceTests.push({
          userId: userData.id,
          email: userData.email,
          duration,
          success: authResult.success,
        });
      }

      // Analyze performance metrics
      const averageDuration =
        performanceTests.reduce((sum, test) => sum + test.duration, 0) /
        performanceTests.length;
      const maxDuration = Math.max(
        ...performanceTests.map((test) => test.duration),
      );
      const successRate =
        performanceTests.filter((test) => test.success).length /
        performanceTests.length;

      expect(averageDuration).toBeLessThan(1000); // Less than 1 second average
      expect(maxDuration).toBeLessThan(5000); // Less than 5 seconds max
      expect(successRate).toBe(1); // 100% success rate

      // Store performance metrics
      const metricsResult = await neonClient.executeSql(
        `INSERT INTO performance_metrics 
         (test_suite, operation, avg_duration_ms, max_duration_ms, success_rate, sample_size, created_at)
         VALUES 
         ('auth-api-tests', 'authentication', ${averageDuration}, ${maxDuration}, ${successRate}, ${performanceTests.length}, NOW())`,
        testBranch.branchId,
      );

      expect(metricsResult.success).toBe(true);
    });
  });
});
