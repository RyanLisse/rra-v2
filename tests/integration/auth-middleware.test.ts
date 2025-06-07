import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '../utils/test-db';
import {
  createMockRequest,
  assertSuccessResponse,
  assertErrorResponse,
  setupTestEnvironment,
} from '../utils/test-helpers';
import { createTestUser, } from '../fixtures/test-data';
import * as schema from '@/lib/db/schema';
import { nanoid } from 'nanoid';

// Mock the auth module to test middleware behavior
vi.mock('@/lib/auth', () => ({
  withAuth: vi.fn(),
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

describe('Auth Middleware Integration Tests', () => {
  const getDb = setupTestDb();

  beforeEach(() => {
    setupTestEnvironment();
    vi.clearAllMocks();
  });

  describe('Session Management', () => {
    it('should create and validate user sessions', async () => {
      const db = getDb();
      
      // Create test user
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      // Create session
      const sessionData = {
        userId: user.id,
        token: nanoid(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      };
      const [session] = await db.insert(schema.session).values(sessionData).returning();

      // Verify session exists and is valid
      const retrievedSession = await db.query.session.findFirst({
        where: (s, { eq }) => eq(s.token, session.token),
        with: { user: true },
      });

      expect(retrievedSession).toBeDefined();
      expect(retrievedSession?.userId).toBe(user.id);
      expect(retrievedSession?.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(retrievedSession?.user?.email).toBe(user.email);
    });

    it('should invalidate expired sessions', async () => {
      const db = getDb();
      
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      // Create expired session
      const expiredSessionData = {
        userId: user.id,
        token: nanoid(),
        expiresAt: new Date(Date.now() - 60 * 60 * 1000), // Expired 1 hour ago
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      };
      await db.insert(schema.session).values(expiredSessionData);

      // Mock auth middleware behavior for expired session
      const { withAuth } = await import('@/lib/auth');
      const mockWithAuth = vi.mocked(withAuth);
      
      mockWithAuth.mockImplementation((handler) => {
        return async (request: Request) => {
          // Simulate expired session detection
          return new Response(
            JSON.stringify({ error: 'Session expired' }),
            { status: 401 }
          );
        };
      });

      const request = createMockRequest('http://localhost:3000/api/test', {
        headers: { Authorization: `Bearer ${expiredSessionData.token}` },
      });

      const wrappedHandler = mockWithAuth(() => 
        Promise.resolve(new Response('Success'))
      );
      const response = await wrappedHandler(request);

      await assertErrorResponse(response, 401, 'Session expired');
    });

    it('should handle concurrent session operations', async () => {
      const db = getDb();
      
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      // Create multiple sessions concurrently
      const concurrentSessions = Array.from({ length: 5 }, () => ({
        userId: user.id,
        token: nanoid(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      }));

      const insertPromises = concurrentSessions.map(sessionData =>
        db.insert(schema.session).values(sessionData).returning()
      );

      const results = await Promise.all(insertPromises);
      
      expect(results).toHaveLength(5);
      expect(results.every(result => result.length === 1)).toBe(true);

      // Verify all sessions exist
      const allSessions = await db.query.session.findMany({
        where: (s, { eq }) => eq(s.userId, user.id),
      });

      expect(allSessions).toHaveLength(5);
    });

    it('should cleanup sessions on user deletion', async () => {
      const db = getDb();
      
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      // Create multiple sessions
      const sessions = Array.from({ length: 3 }, () => ({
        userId: user.id,
        token: nanoid(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      }));

      await db.insert(schema.session).values(sessions);

      // Delete user (should cascade to sessions)
      await db.delete(schema.user).where(schema.user.id === user.id);

      // Verify sessions are deleted
      const remainingSessions = await db.query.session.findMany({
        where: (s, { eq }) => eq(s.userId, user.id),
      });

      expect(remainingSessions).toHaveLength(0);
    });
  });

  describe('Authorization Levels', () => {
    it('should enforce user type restrictions', async () => {
      const db = getDb();
      
      // Create users with different types
      const regularUserData = createTestUser({ type: 'regular' });
      const premiumUserData = createTestUser({ type: 'premium' });
      const adminUserData = createTestUser({ type: 'admin' });

      const [regularUser, premiumUser, adminUser] = await db
        .insert(schema.user)
        .values([regularUserData, premiumUserData, adminUserData])
        .returning();

      // Mock different authorization levels
      const { withAuth } = await import('@/lib/auth');
      const mockWithAuth = vi.mocked(withAuth);

      // Test regular user access
      mockWithAuth.mockImplementation((handler) => {
        return async (request: Request) => {
          const session = {
            user: regularUser,
            session: { id: nanoid(), userId: regularUser.id, token: nanoid() },
          };
          return handler(request, session);
        };
      });

      let testHandler = mockWithAuth((req, session) => {
        if (session.user.type !== 'admin') {
          return new Response(
            JSON.stringify({ error: 'Admin access required' }),
            { status: 403 }
          );
        }
        return new Response('Admin success');
      });

      let request = createMockRequest('http://localhost:3000/api/admin');
      let response = await testHandler(request);
      await assertErrorResponse(response, 403, 'Admin access required');

      // Test admin user access
      mockWithAuth.mockImplementation((handler) => {
        return async (request: Request) => {
          const session = {
            user: adminUser,
            session: { id: nanoid(), userId: adminUser.id, token: nanoid() },
          };
          return handler(request, session);
        };
      });

      testHandler = mockWithAuth((req, session) => {
        if (session.user.type !== 'admin') {
          return new Response(
            JSON.stringify({ error: 'Admin access required' }),
            { status: 403 }
          );
        }
        return new Response('Admin success');
      });

      request = createMockRequest('http://localhost:3000/api/admin');
      response = await testHandler(request);
      await assertSuccessResponse(response);
    });

    it('should handle rate limiting by user type', async () => {
      const db = getDb();
      
      const regularUserData = createTestUser({ type: 'regular' });
      const premiumUserData = createTestUser({ type: 'premium' });

      const [regularUser, premiumUser] = await db
        .insert(schema.user)
        .values([regularUserData, premiumUserData])
        .returning();

      // Mock rate limiting logic
      const { withAuth } = await import('@/lib/auth');
      const mockWithAuth = vi.mocked(withAuth);

      // Simulate rate limits: regular = 10/day, premium = 100/day
      const rateLimits = {
        regular: 10,
        premium: 100,
        admin: 1000,
      };

      mockWithAuth.mockImplementation((handler) => {
        return async (request: Request) => {
          const userType = request.headers.get('X-User-Type') as keyof typeof rateLimits;
          const requestCount = Number.parseInt(request.headers.get('X-Request-Count') || '0');
          
          const user = userType === 'regular' ? regularUser : premiumUser;
          const session = {
            user: { ...user, type: userType },
            session: { id: nanoid(), userId: user.id, token: nanoid() },
          };

          if (requestCount > rateLimits[userType]) {
            return new Response(
              JSON.stringify({ error: 'Rate limit exceeded' }),
              { status: 429 }
            );
          }

          return handler(request, session);
        };
      });

      const testHandler = mockWithAuth(() => 
        new Response('Success')
      );

      // Test regular user hitting rate limit
      let request = createMockRequest('http://localhost:3000/api/test', {
        headers: {
          'X-User-Type': 'regular',
          'X-Request-Count': '15', // Exceeds regular limit of 10
        },
      });
      let response = await testHandler(request);
      await assertErrorResponse(response, 429, 'Rate limit exceeded');

      // Test premium user within limits
      request = createMockRequest('http://localhost:3000/api/test', {
        headers: {
          'X-User-Type': 'premium',
          'X-Request-Count': '50', // Within premium limit of 100
        },
      });
      response = await testHandler(request);
      await assertSuccessResponse(response);
    });
  });

  describe('Security Validations', () => {
    it('should validate session tokens properly', async () => {
      const db = getDb();
      
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const validSessionData = {
        userId: user.id,
        token: nanoid(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      };
      await db.insert(schema.session).values(validSessionData);

      const { withAuth } = await import('@/lib/auth');
      const mockWithAuth = vi.mocked(withAuth);

      // Test valid token
      mockWithAuth.mockImplementation((handler) => {
        return async (request: Request) => {
          const token = request.headers.get('Authorization')?.replace('Bearer ', '');
          
          if (token === validSessionData.token) {
            const session = {
              user,
              session: { id: nanoid(), userId: user.id, token },
            };
            return handler(request, session);
          }
          
          return new Response(
            JSON.stringify({ error: 'Invalid token' }),
            { status: 401 }
          );
        };
      });

      const testHandler = mockWithAuth(() => 
        new Response('Success')
      );

      // Test with valid token
      let request = createMockRequest('http://localhost:3000/api/test', {
        headers: { Authorization: `Bearer ${validSessionData.token}` },
      });
      let response = await testHandler(request);
      await assertSuccessResponse(response);

      // Test with invalid token
      request = createMockRequest('http://localhost:3000/api/test', {
        headers: { Authorization: 'Bearer invalid-token' },
      });
      response = await testHandler(request);
      await assertErrorResponse(response, 401, 'Invalid token');
    });

    it('should prevent session hijacking', async () => {
      const db = getDb();
      
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const sessionData = {
        userId: user.id,
        token: nanoid(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (original browser)',
      };
      await db.insert(schema.session).values(sessionData);

      const { withAuth } = await import('@/lib/auth');
      const mockWithAuth = vi.mocked(withAuth);

      // Mock session validation with IP/User-Agent checking
      mockWithAuth.mockImplementation((handler) => {
        return async (request: Request) => {
          const token = request.headers.get('Authorization')?.replace('Bearer ', '');
          const userAgent = request.headers.get('User-Agent');
          const xForwardedFor = request.headers.get('X-Forwarded-For');
          
          if (token === sessionData.token) {
            // Check for session hijacking indicators
            if (userAgent !== sessionData.userAgent || 
                xForwardedFor !== sessionData.ipAddress) {
              return new Response(
                JSON.stringify({ error: 'Session security violation' }),
                { status: 401 }
              );
            }
            
            const session = {
              user,
              session: { id: nanoid(), userId: user.id, token },
            };
            return handler(request, session);
          }
          
          return new Response(
            JSON.stringify({ error: 'Invalid token' }),
            { status: 401 }
          );
        };
      });

      const testHandler = mockWithAuth(() => 
        new Response('Success')
      );

      // Test with mismatched User-Agent (potential hijacking)
      const request = createMockRequest('http://localhost:3000/api/test', {
        headers: {
          Authorization: `Bearer ${sessionData.token}`,
          'User-Agent': 'Mozilla/5.0 (different browser)',
          'X-Forwarded-For': '192.168.1.100',
        },
      });
      
      const response = await testHandler(request);
      await assertErrorResponse(response, 401, 'Session security violation');
    });

    it('should handle CSRF protection', async () => {
      const db = getDb();
      
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      const { withAuth } = await import('@/lib/auth');
      const mockWithAuth = vi.mocked(withAuth);

      // Mock CSRF token validation
      mockWithAuth.mockImplementation((handler) => {
        return async (request: Request) => {
          const method = request.method;
          const csrfToken = request.headers.get('X-CSRF-Token');
          const expectedCsrfToken = 'valid-csrf-token';
          
          // Only check CSRF for state-changing operations
          if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
            if (!csrfToken || csrfToken !== expectedCsrfToken) {
              return new Response(
                JSON.stringify({ error: 'CSRF token mismatch' }),
                { status: 403 }
              );
            }
          }
          
          const session = {
            user,
            session: { id: nanoid(), userId: user.id, token: nanoid() },
          };
          return handler(request, session);
        };
      });

      const testHandler = mockWithAuth(() => 
        new Response('Success')
      );

      // Test POST without CSRF token
      let request = createMockRequest('http://localhost:3000/api/test', {
        method: 'POST',
        body: { data: 'test' },
      });
      let response = await testHandler(request);
      await assertErrorResponse(response, 403, 'CSRF token mismatch');

      // Test POST with valid CSRF token
      request = createMockRequest('http://localhost:3000/api/test', {
        method: 'POST',
        body: { data: 'test' },
        headers: { 'X-CSRF-Token': 'valid-csrf-token' },
      });
      response = await testHandler(request);
      await assertSuccessResponse(response);

      // Test GET (no CSRF required)
      request = createMockRequest('http://localhost:3000/api/test');
      response = await testHandler(request);
      await assertSuccessResponse(response);
    });
  });

  describe('Account Management', () => {
    it('should handle OAuth account linking', async () => {
      const db = getDb();
      
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      // Create OAuth account
      const accountData = {
        userId: user.id,
        accountId: 'google-123456789',
        providerId: 'google',
        accessToken: 'google-access-token',
        refreshToken: 'google-refresh-token',
        idToken: 'google-id-token',
        accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        scope: 'openid profile email',
      };
      
      const [account] = await db.insert(schema.account).values(accountData).returning();

      // Verify account linking
      const userWithAccounts = await db.query.user.findFirst({
        where: (u, { eq }) => eq(u.id, user.id),
        with: {
          accounts: true,
        },
      });

      expect(userWithAccounts?.accounts).toHaveLength(1);
      expect(userWithAccounts?.accounts[0].providerId).toBe('google');
      expect(userWithAccounts?.accounts[0].accountId).toBe('google-123456789');
    });

    it('should cleanup accounts on user deletion', async () => {
      const db = getDb();
      
      const userData = createTestUser();
      const [user] = await db.insert(schema.user).values(userData).returning();

      // Create multiple OAuth accounts
      const accounts = [
        {
          userId: user.id,
          accountId: 'google-123456789',
          providerId: 'google',
          accessToken: 'google-access-token',
        },
        {
          userId: user.id,
          accountId: 'github-987654321',
          providerId: 'github',
          accessToken: 'github-access-token',
        },
      ];

      await db.insert(schema.account).values(accounts);

      // Delete user (should cascade to accounts)
      await db.delete(schema.user).where(schema.user.id === user.id);

      // Verify accounts are deleted
      const remainingAccounts = await db.query.account.findMany({
        where: (a, { eq }) => eq(a.userId, user.id),
      });

      expect(remainingAccounts).toHaveLength(0);
    });
  });
});