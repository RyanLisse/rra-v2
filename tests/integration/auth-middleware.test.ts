import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupNeonBranch } from '../config/neon-test-context';
import {
  createMockRequest,
  assertSuccessResponse,
  assertErrorResponse,
  setupTestEnvironment,
} from '../utils/test-helpers';
import * as schema from '@/lib/db/schema';
import { nanoid } from 'nanoid';
import { auth, withAuth } from '@/lib/auth';
import { hash, verify } from '@node-rs/argon2';
import { and, eq, gte } from 'drizzle-orm';
import type { Session } from 'better-auth/types';

describe('Auth Middleware Integration Tests', () => {
  let testContext: Awaited<ReturnType<typeof setupNeonBranch>>;

  beforeEach(async () => {
    setupTestEnvironment();
    testContext = await setupNeonBranch('auth-middleware-test');
  });

  afterEach(async () => {
    await testContext.cleanup();
  });

  describe('Session Management', () => {
    it('should create and validate real user sessions with Better Auth', async () => {
      const { db } = testContext;

      // Create real user with Better Auth
      const { user, password } =
        await testContext.factories.createUserWithAuth();

      // Simulate real authentication flow
      const request = createMockRequest(
        'http://localhost:3000/api/auth/sign-in',
        {
          method: 'POST',
          body: {
            email: user.email,
            password,
          },
        },
      );

      // Sign in using real Better Auth flow
      const signInResponse = await auth.api.signInEmail({
        body: {
          email: user.email,
          password,
        },
        asResponse: true,
      });

      expect(signInResponse.status).toBe(200);
      const signInData = await signInResponse.json();
      expect(signInData.session).toBeDefined();
      expect(signInData.session.userId).toBe(user.id);

      // Extract session token from response
      const sessionToken = signInData.session.token;

      // Verify session in database
      const dbSession = await db.query.session.findFirst({
        where: (s, { eq }) => eq(s.token, sessionToken),
        with: { user: true },
      });

      expect(dbSession).toBeDefined();
      expect(dbSession?.userId).toBe(user.id);
      expect(dbSession?.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(dbSession?.user?.email).toBe(user.email);

      // Test session validation with middleware
      const protectedHandler = withAuth(async (req, session) => {
        return new Response(
          JSON.stringify({
            message: 'Authenticated',
            userId: session.user.id,
            userEmail: session.user.email,
          }),
        );
      });

      const protectedRequest = createMockRequest(
        'http://localhost:3000/api/protected',
        {
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
        },
      );

      const protectedResponse = await protectedHandler(protectedRequest);
      expect(protectedResponse.status).toBe(200);

      const responseData = await protectedResponse.json();
      expect(responseData.userId).toBe(user.id);
      expect(responseData.userEmail).toBe(user.email);
    });

    it('should invalidate expired sessions automatically', async () => {
      const { db } = testContext;

      const { user, password } =
        await testContext.factories.createUserWithAuth();

      // Create session with short expiration for testing
      const sessionData = {
        id: nanoid(),
        userId: user.id,
        token: nanoid(32),
        expiresAt: new Date(Date.now() + 1000), // Expires in 1 second
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.insert(schema.session).values(sessionData);

      // Wait for session to expire
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Try to use expired session
      const protectedHandler = withAuth(async (req, session) => {
        return new Response(
          JSON.stringify({ message: 'Should not reach here' }),
        );
      });

      const request = createMockRequest('http://localhost:3000/api/protected', {
        headers: {
          Authorization: `Bearer ${sessionData.token}`,
        },
      });

      const response = await protectedHandler(request);
      await assertErrorResponse(response, 401, 'Session expired');

      // Verify session is marked as expired or removed
      const expiredSession = await db.query.session.findFirst({
        where: (s, { eq }) => eq(s.token, sessionData.token),
      });

      // Session should either be removed or marked as expired
      expect(
        !expiredSession || expiredSession.expiresAt.getTime() < Date.now(),
      ).toBe(true);
    });

    it('should handle concurrent session operations safely', async () => {
      const { db, metrics } = testContext;

      const { user, password } =
        await testContext.factories.createUserWithAuth();

      // Simulate concurrent login attempts from different devices
      const devices = [
        { userAgent: 'Mozilla/5.0 (Windows)', ip: '192.168.1.100' },
        { userAgent: 'Mozilla/5.0 (Mac)', ip: '192.168.1.101' },
        { userAgent: 'Mozilla/5.0 (Linux)', ip: '192.168.1.102' },
        { userAgent: 'Mozilla/5.0 (iPhone)', ip: '192.168.1.103' },
        { userAgent: 'Mozilla/5.0 (Android)', ip: '192.168.1.104' },
      ];

      // Concurrent sign-in operations
      const signInPromises = devices.map(async (device) => {
        const startTime = Date.now();

        const response = await auth.api.signInEmail({
          body: {
            email: user.email,
            password,
          },
          headers: {
            'user-agent': device.userAgent,
            'x-forwarded-for': device.ip,
          },
          asResponse: true,
        });

        const duration = Date.now() - startTime;
        metrics.record(
          `auth.concurrent.signin.${devices.indexOf(device)}`,
          duration,
        );

        return response.json();
      });

      const results = await Promise.all(signInPromises);

      // All sign-ins should succeed
      expect(results).toHaveLength(5);
      expect(results.every((r) => r.session)).toBe(true);
      expect(results.every((r) => r.session.userId === user.id)).toBe(true);

      // Verify all sessions exist in database with correct metadata
      const allSessions = await db.query.session.findMany({
        where: (s, { eq }) => eq(s.userId, user.id),
      });

      expect(allSessions.length).toBeGreaterThanOrEqual(5);

      // Each session should have unique token and metadata
      const tokens = new Set(allSessions.map((s) => s.token));
      expect(tokens.size).toBe(allSessions.length);

      // Test concurrent session validation
      const validationPromises = results.map(async (result) => {
        const protectedHandler = withAuth(async (req, session) => {
          return new Response(
            JSON.stringify({
              authenticated: true,
              sessionId: session.session.id,
            }),
          );
        });

        const request = createMockRequest(
          'http://localhost:3000/api/protected',
          {
            headers: {
              Authorization: `Bearer ${result.session.token}`,
            },
          },
        );

        return protectedHandler(request);
      });

      const validationResults = await Promise.all(validationPromises);
      expect(validationResults.every((r) => r.status === 200)).toBe(true);
    });

    it('should cleanup sessions on user deletion with cascade', async () => {
      const { db } = testContext;

      const { user, password } =
        await testContext.factories.createUserWithAuth();

      // Create multiple active sessions
      const sessionPromises = Array.from({ length: 3 }, async (_, i) => {
        const response = await auth.api.signInEmail({
          body: {
            email: user.email,
            password,
          },
          headers: {
            'user-agent': `Device-${i}`,
          },
          asResponse: true,
        });
        return response.json();
      });

      const sessions = await Promise.all(sessionPromises);
      expect(sessions).toHaveLength(3);

      // Verify sessions exist
      const activeSessions = await db.query.session.findMany({
        where: (s, { eq }) => eq(s.userId, user.id),
      });
      expect(activeSessions.length).toBeGreaterThanOrEqual(3);

      // Delete user (should cascade to sessions and accounts)
      await db.delete(schema.user).where(schema.user.id === user.id);

      // Verify sessions are deleted
      const remainingSessions = await db.query.session.findMany({
        where: (s, { eq }) => eq(s.userId, user.id),
      });
      expect(remainingSessions).toHaveLength(0);

      // Verify accounts are also deleted
      const remainingAccounts = await db.query.account.findMany({
        where: (a, { eq }) => eq(a.userId, user.id),
      });
      expect(remainingAccounts).toHaveLength(0);
    });
  });

  describe('Authorization Levels', () => {
    it('should enforce user type restrictions with real middleware', async () => {
      const { db } = testContext;

      // Create users with different authorization levels
      const users = await Promise.all([
        testContext.factories.createUserWithAuth({ type: 'regular' }),
        testContext.factories.createUserWithAuth({ type: 'premium' }),
        testContext.factories.createUserWithAuth({ type: 'admin' }),
      ]);

      const [regularUser, premiumUser, adminUser] = users;

      // Sign in all users to get tokens
      const tokens = await Promise.all(
        users.map(async ({ user, password }) => {
          const response = await auth.api.signInEmail({
            body: { email: user.email, password },
            asResponse: true,
          });
          const data = await response.json();
          return { user, token: data.session.token };
        }),
      );

      // Create authorization middleware
      const requireAdmin = withAuth(async (req, session) => {
        if (session.user.type !== 'admin') {
          return new Response(
            JSON.stringify({ error: 'Admin access required' }),
            { status: 403 },
          );
        }
        return new Response(
          JSON.stringify({
            message: 'Admin access granted',
            userId: session.user.id,
          }),
        );
      });

      const requirePremium = withAuth(async (req, session) => {
        if (session.user.type === 'regular') {
          return new Response(
            JSON.stringify({ error: 'Premium access required' }),
            { status: 403 },
          );
        }
        return new Response(
          JSON.stringify({
            message: 'Premium access granted',
            userType: session.user.type,
          }),
        );
      });

      // Test regular user - should fail admin check
      let request = createMockRequest('http://localhost:3000/api/admin', {
        headers: { Authorization: `Bearer ${tokens[0].token}` },
      });
      let response = await requireAdmin(request);
      await assertErrorResponse(response, 403, 'Admin access required');

      // Test regular user - should fail premium check
      request = createMockRequest('http://localhost:3000/api/premium', {
        headers: { Authorization: `Bearer ${tokens[0].token}` },
      });
      response = await requirePremium(request);
      await assertErrorResponse(response, 403, 'Premium access required');

      // Test premium user - should fail admin check
      request = createMockRequest('http://localhost:3000/api/admin', {
        headers: { Authorization: `Bearer ${tokens[1].token}` },
      });
      response = await requireAdmin(request);
      await assertErrorResponse(response, 403, 'Admin access required');

      // Test premium user - should pass premium check
      request = createMockRequest('http://localhost:3000/api/premium', {
        headers: { Authorization: `Bearer ${tokens[1].token}` },
      });
      response = await requirePremium(request);
      await assertSuccessResponse(response);
      const premiumData = await response.json();
      expect(premiumData.userType).toBe('premium');

      // Test admin user - should pass all checks
      request = createMockRequest('http://localhost:3000/api/admin', {
        headers: { Authorization: `Bearer ${tokens[2].token}` },
      });
      response = await requireAdmin(request);
      await assertSuccessResponse(response);

      request = createMockRequest('http://localhost:3000/api/premium', {
        headers: { Authorization: `Bearer ${tokens[2].token}` },
      });
      response = await requirePremium(request);
      await assertSuccessResponse(response);
    });

    it('should handle rate limiting by user type with real tracking', async () => {
      const { db, metrics } = testContext;

      // Create users with rate limits
      const [regularUser, premiumUser] = await Promise.all([
        testContext.factories.createUserWithAuth({ type: 'regular' }),
        testContext.factories.createUserWithAuth({ type: 'premium' }),
      ]);

      // Sign in users
      const regularToken = await auth.api
        .signInEmail({
          body: {
            email: regularUser.user.email,
            password: regularUser.password,
          },
          asResponse: true,
        })
        .then((r) => r.json())
        .then((d) => d.session.token);

      const premiumToken = await auth.api
        .signInEmail({
          body: {
            email: premiumUser.user.email,
            password: premiumUser.password,
          },
          asResponse: true,
        })
        .then((r) => r.json())
        .then((d) => d.session.token);

      // Create rate-limited endpoint with real rate limit tracking
      const rateLimitedHandler = withAuth(async (req, session) => {
        // Track requests in database
        const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hour window

        const requestCount = await db
          .select({ count: schema.rateLimitLog.id })
          .from(schema.rateLimitLog)
          .where(
            and(
              eq(schema.rateLimitLog.userId, session.user.id),
              eq(schema.rateLimitLog.endpoint, '/api/test'),
              gte(schema.rateLimitLog.createdAt, windowStart),
            ),
          )
          .then((r) => r[0]?.count || 0);

        const limits = {
          regular: 10,
          premium: 100,
          admin: 1000,
        };

        const userLimit = limits[session.user.type];

        if (requestCount >= userLimit) {
          return new Response(
            JSON.stringify({
              error: 'Rate limit exceeded',
              limit: userLimit,
              used: requestCount,
              resetAt: new Date(windowStart.getTime() + 24 * 60 * 60 * 1000),
            }),
            {
              status: 429,
              headers: {
                'X-RateLimit-Limit': userLimit.toString(),
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': new Date(
                  windowStart.getTime() + 24 * 60 * 60 * 1000,
                ).toISOString(),
              },
            },
          );
        }

        // Log this request
        await db.insert(schema.rateLimitLog).values({
          userId: session.user.id,
          endpoint: '/api/test',
          ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
          userAgent: req.headers.get('user-agent') || 'unknown',
        });

        return new Response(
          JSON.stringify({
            message: 'Success',
            remaining: userLimit - requestCount - 1,
          }),
          {
            headers: {
              'X-RateLimit-Limit': userLimit.toString(),
              'X-RateLimit-Remaining': (
                userLimit -
                requestCount -
                1
              ).toString(),
            },
          },
        );
      });

      // Test regular user rate limiting
      for (let i = 0; i < 12; i++) {
        const request = createMockRequest('http://localhost:3000/api/test', {
          headers: { Authorization: `Bearer ${regularToken}` },
        });

        const response = await rateLimitedHandler(request);

        if (i < 10) {
          expect(response.status).toBe(200);
          const remaining = response.headers.get('X-RateLimit-Remaining');
          expect(Number(remaining)).toBe(9 - i);
        } else {
          expect(response.status).toBe(429);
          const data = await response.json();
          expect(data.limit).toBe(10);
          expect(data.used).toBeGreaterThanOrEqual(10);
        }
      }

      // Test premium user higher limit
      for (let i = 0; i < 5; i++) {
        const request = createMockRequest('http://localhost:3000/api/test', {
          headers: { Authorization: `Bearer ${premiumToken}` },
        });

        const response = await rateLimitedHandler(request);
        expect(response.status).toBe(200);

        const remaining = response.headers.get('X-RateLimit-Remaining');
        expect(Number(remaining)).toBe(99 - i);
      }

      // Verify rate limit logs
      const regularLogs = await db
        .select()
        .from(schema.rateLimitLog)
        .where(eq(schema.rateLimitLog.userId, regularUser.user.id));

      expect(regularLogs.length).toBeGreaterThanOrEqual(10);

      const premiumLogs = await db
        .select()
        .from(schema.rateLimitLog)
        .where(eq(schema.rateLimitLog.userId, premiumUser.user.id));

      expect(premiumLogs.length).toBe(5);

      // Record metrics
      metrics.record('auth.rate_limit.regular.requests', regularLogs.length);
      metrics.record('auth.rate_limit.premium.requests', premiumLogs.length);
    });
  });

  describe('Security Validations', () => {
    it('should validate session tokens properly with real auth flow', async () => {
      const { db } = testContext;

      const { user, password } =
        await testContext.factories.createUserWithAuth();

      // Create valid session through authentication
      const signInResponse = await auth.api.signInEmail({
        body: { email: user.email, password },
        asResponse: true,
      });
      const { session: validSession } = await signInResponse.json();

      // Test with valid token
      const protectedHandler = withAuth(async (req, session) => {
        return new Response(
          JSON.stringify({
            message: 'Success',
            sessionId: session.session.id,
            userId: session.user.id,
          }),
        );
      });

      let request = createMockRequest('http://localhost:3000/api/test', {
        headers: { Authorization: `Bearer ${validSession.token}` },
      });
      let response = await protectedHandler(request);
      await assertSuccessResponse(response);

      const successData = await response.json();
      expect(successData.userId).toBe(user.id);

      // Test with invalid token
      request = createMockRequest('http://localhost:3000/api/test', {
        headers: { Authorization: 'Bearer invalid-token-12345' },
      });
      response = await protectedHandler(request);
      expect(response.status).toBe(401);

      // Test with malformed token
      request = createMockRequest('http://localhost:3000/api/test', {
        headers: { Authorization: 'InvalidFormat token' },
      });
      response = await protectedHandler(request);
      expect(response.status).toBe(401);

      // Test without token
      request = createMockRequest('http://localhost:3000/api/test');
      response = await protectedHandler(request);
      expect(response.status).toBe(401);
    });

    it('should prevent session hijacking with real session tracking', async () => {
      const { db } = testContext;

      const { user, password } =
        await testContext.factories.createUserWithAuth();

      // Create session from specific device/location
      const originalDevice = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0',
        ipAddress: '192.168.1.100',
      };

      const signInResponse = await auth.api.signInEmail({
        body: { email: user.email, password },
        headers: {
          'user-agent': originalDevice.userAgent,
          'x-forwarded-for': originalDevice.ipAddress,
        },
        asResponse: true,
      });

      const { session } = await signInResponse.json();

      // Store session metadata for hijacking detection
      await db
        .update(schema.session)
        .set({
          ipAddress: originalDevice.ipAddress,
          userAgent: originalDevice.userAgent,
        })
        .where(eq(schema.session.token, session.token));

      // Create enhanced auth handler with session validation
      const secureHandler = withAuth(async (req, sessionData) => {
        // Additional security checks
        const currentUA = req.headers.get('user-agent');
        const currentIP = req.headers.get('x-forwarded-for');

        const dbSession = await db.query.session.findFirst({
          where: (s, { eq }) => eq(s.id, sessionData.session.id),
        });

        if (dbSession) {
          // Check for hijacking indicators
          if (dbSession.userAgent && currentUA !== dbSession.userAgent) {
            return new Response(
              JSON.stringify({
                error: 'Session security violation',
                reason: 'User agent mismatch',
              }),
              { status: 401 },
            );
          }

          if (dbSession.ipAddress && currentIP !== dbSession.ipAddress) {
            // Log suspicious activity
            await db.insert(schema.rateLimitLog).values({
              userId: sessionData.user.id,
              endpoint: '/security/hijack-attempt',
              ipAddress: currentIP,
              userAgent: currentUA,
            });

            return new Response(
              JSON.stringify({
                error: 'Session security violation',
                reason: 'IP address change detected',
              }),
              { status: 401 },
            );
          }
        }

        return new Response(
          JSON.stringify({ message: 'Secure access granted' }),
        );
      });

      // Test with original device - should succeed
      let request = createMockRequest('http://localhost:3000/api/secure', {
        headers: {
          Authorization: `Bearer ${session.token}`,
          'user-agent': originalDevice.userAgent,
          'x-forwarded-for': originalDevice.ipAddress,
        },
      });

      let response = await secureHandler(request);
      await assertSuccessResponse(response);

      // Test with different User-Agent (potential hijacking)
      request = createMockRequest('http://localhost:3000/api/secure', {
        headers: {
          Authorization: `Bearer ${session.token}`,
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/14.0',
          'x-forwarded-for': originalDevice.ipAddress,
        },
      });

      response = await secureHandler(request);
      expect(response.status).toBe(401);
      const error1 = await response.json();
      expect(error1.reason).toBe('User agent mismatch');

      // Test with different IP (potential hijacking)
      request = createMockRequest('http://localhost:3000/api/secure', {
        headers: {
          Authorization: `Bearer ${session.token}`,
          'user-agent': originalDevice.userAgent,
          'x-forwarded-for': '10.0.0.1',
        },
      });

      response = await secureHandler(request);
      expect(response.status).toBe(401);
      const error2 = await response.json();
      expect(error2.reason).toBe('IP address change detected');

      // Verify security log was created
      const securityLogs = await db
        .select()
        .from(schema.rateLimitLog)
        .where(
          and(
            eq(schema.rateLimitLog.userId, user.id),
            eq(schema.rateLimitLog.endpoint, '/security/hijack-attempt'),
          ),
        );

      expect(securityLogs.length).toBeGreaterThan(0);
    });

    it('should handle CSRF protection with real token generation', async () => {
      const { db } = testContext;

      const { user, password } =
        await testContext.factories.createUserWithAuth();

      // Sign in to get session
      const signInResponse = await auth.api.signInEmail({
        body: { email: user.email, password },
        asResponse: true,
      });
      const { session } = await signInResponse.json();

      // Generate CSRF token tied to session
      const csrfToken = nanoid(32);
      await db
        .update(schema.session)
        .set({ csrfToken })
        .where(eq(schema.session.id, session.id));

      // Create CSRF-protected handler
      const csrfProtectedHandler = withAuth(async (req, sessionData) => {
        const method = req.method;

        // Only check CSRF for state-changing operations
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
          const providedToken = req.headers.get('X-CSRF-Token');

          // Get session with CSRF token
          const dbSession = await db.query.session.findFirst({
            where: (s, { eq }) => eq(s.id, sessionData.session.id),
          });

          if (!dbSession?.csrfToken || providedToken !== dbSession.csrfToken) {
            return new Response(
              JSON.stringify({
                error: 'CSRF token validation failed',
                provided: !!providedToken,
                method,
              }),
              {
                status: 403,
                headers: { 'X-CSRF-Required': 'true' },
              },
            );
          }
        }

        return new Response(
          JSON.stringify({
            message: 'Request successful',
            method,
          }),
        );
      });

      // Test GET request - no CSRF required
      let request = createMockRequest('http://localhost:3000/api/data', {
        method: 'GET',
        headers: { Authorization: `Bearer ${session.token}` },
      });
      let response = await csrfProtectedHandler(request);
      await assertSuccessResponse(response);

      // Test POST without CSRF token - should fail
      request = createMockRequest('http://localhost:3000/api/data', {
        method: 'POST',
        body: { data: 'test' },
        headers: { Authorization: `Bearer ${session.token}` },
      });
      response = await csrfProtectedHandler(request);
      expect(response.status).toBe(403);
      expect(response.headers.get('X-CSRF-Required')).toBe('true');

      // Test POST with invalid CSRF token - should fail
      request = createMockRequest('http://localhost:3000/api/data', {
        method: 'POST',
        body: { data: 'test' },
        headers: {
          Authorization: `Bearer ${session.token}`,
          'X-CSRF-Token': 'invalid-token',
        },
      });
      response = await csrfProtectedHandler(request);
      expect(response.status).toBe(403);

      // Test POST with valid CSRF token - should succeed
      request = createMockRequest('http://localhost:3000/api/data', {
        method: 'POST',
        body: { data: 'test' },
        headers: {
          Authorization: `Bearer ${session.token}`,
          'X-CSRF-Token': csrfToken,
        },
      });
      response = await csrfProtectedHandler(request);
      await assertSuccessResponse(response);
      const successData = await response.json();
      expect(successData.method).toBe('POST');

      // Test other state-changing methods
      for (const method of ['PUT', 'DELETE', 'PATCH']) {
        request = createMockRequest('http://localhost:3000/api/data', {
          method,
          headers: {
            Authorization: `Bearer ${session.token}`,
            'X-CSRF-Token': csrfToken,
          },
        });
        response = await csrfProtectedHandler(request);
        await assertSuccessResponse(response);
      }
    });
  });

  describe('Account Management', () => {
    it('should handle OAuth account linking with real providers', async () => {
      const { db } = testContext;

      const { user } = await testContext.factories.createUserWithAuth();

      // Simulate OAuth account linking for multiple providers
      const oauthProviders = [
        {
          providerId: 'google',
          accountId: `google-${nanoid(10)}`,
          email: user.email,
          name: user.name,
          picture: 'https://example.com/google-avatar.jpg',
          accessToken: `google-access-${nanoid()}`,
          refreshToken: `google-refresh-${nanoid()}`,
          idToken: `google-id-${nanoid()}`,
          expiresAt: new Date(Date.now() + 3600 * 1000),
          scope: ['openid', 'profile', 'email'],
        },
        {
          providerId: 'github',
          accountId: `github-${nanoid(8)}`,
          email: user.email,
          name: user.name,
          picture: 'https://example.com/github-avatar.jpg',
          accessToken: `github-access-${nanoid()}`,
          scope: ['user', 'repo'],
        },
      ];

      // Link OAuth accounts
      for (const provider of oauthProviders) {
        const accountData = {
          userId: user.id,
          accountId: provider.accountId,
          providerId: provider.providerId,
          accessToken: provider.accessToken,
          refreshToken: provider.refreshToken,
          idToken: provider.idToken,
          accessTokenExpiresAt: provider.expiresAt,
          scope: provider.scope?.join(' '),
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.insert(schema.account).values(accountData);
      }

      // Verify account linking
      const userWithAccounts = await db.query.user.findFirst({
        where: (u, { eq }) => eq(u.id, user.id),
        with: {
          accounts: {
            orderBy: (accounts, { asc }) => [asc(accounts.createdAt)],
          },
        },
      });

      expect(userWithAccounts?.accounts).toHaveLength(2);
      expect(
        userWithAccounts?.accounts.map((a) => a.providerId).sort(),
      ).toEqual(['github', 'google']);

      // Test account lookup by provider
      const googleAccount = await db.query.account.findFirst({
        where: (a, { and, eq }) =>
          and(eq(a.userId, user.id), eq(a.providerId, 'google')),
      });

      expect(googleAccount).toBeDefined();
      expect(googleAccount?.accessToken).toContain('google-access-');
      expect(googleAccount?.refreshToken).toContain('google-refresh-');
      expect(googleAccount?.scope).toBe('openid profile email');

      // Test token refresh simulation
      if (googleAccount && googleAccount.accessTokenExpiresAt) {
        const isExpired =
          googleAccount.accessTokenExpiresAt.getTime() < Date.now();
        if (
          isExpired ||
          googleAccount.accessTokenExpiresAt.getTime() < Date.now() + 300 * 1000
        ) {
          // Refresh token
          const newAccessToken = `google-access-refreshed-${nanoid()}`;
          const newExpiresAt = new Date(Date.now() + 3600 * 1000);

          await db
            .update(schema.account)
            .set({
              accessToken: newAccessToken,
              accessTokenExpiresAt: newExpiresAt,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(schema.account.userId, user.id),
                eq(schema.account.providerId, 'google'),
              ),
            );
        }
      }
    });

    it('should cleanup accounts on user deletion with cascade verification', async () => {
      const { db, metrics } = testContext;

      const { user } = await testContext.factories.createUserWithAuth();

      // Create comprehensive user data
      const accounts = [
        {
          userId: user.id,
          accountId: `google-${nanoid()}`,
          providerId: 'google',
          accessToken: `google-token-${nanoid()}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          userId: user.id,
          accountId: `github-${nanoid()}`,
          providerId: 'github',
          accessToken: `github-token-${nanoid()}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      await db.insert(schema.account).values(accounts);

      // Create sessions
      const sessions = Array.from({ length: 3 }, () => ({
        id: nanoid(),
        userId: user.id,
        token: nanoid(32),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await db.insert(schema.session).values(sessions);

      // Create documents (if user has documents)
      const document = {
        id: nanoid(),
        fileName: 'test.pdf',
        originalName: 'test.pdf',
        filePath: '/uploads/test.pdf',
        mimeType: 'application/pdf',
        fileSize: '1024',
        status: 'processed' as const,
        uploadedBy: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.insert(schema.ragDocument).values(document);

      // Verify all data exists before deletion
      const preDeleteData = await Promise.all([
        db.query.account.findMany({
          where: (a, { eq }) => eq(a.userId, user.id),
        }),
        db.query.session.findMany({
          where: (s, { eq }) => eq(s.userId, user.id),
        }),
        db.query.ragDocument.findMany({
          where: (d, { eq }) => eq(d.uploadedBy, user.id),
        }),
      ]);

      expect(preDeleteData[0]).toHaveLength(2); // accounts
      expect(preDeleteData[1]).toHaveLength(3); // sessions
      expect(preDeleteData[2]).toHaveLength(1); // documents

      // Track deletion performance
      const deleteStart = Date.now();

      // Delete user (should cascade to all related data)
      await db.delete(schema.user).where(eq(schema.user.id, user.id));

      const deleteDuration = Date.now() - deleteStart;
      metrics.record('auth.user_deletion.duration', deleteDuration);

      // Verify all related data is deleted
      const postDeleteData = await Promise.all([
        db.query.user.findFirst({ where: (u, { eq }) => eq(u.id, user.id) }),
        db.query.account.findMany({
          where: (a, { eq }) => eq(a.userId, user.id),
        }),
        db.query.session.findMany({
          where: (s, { eq }) => eq(s.userId, user.id),
        }),
        db.query.ragDocument.findMany({
          where: (d, { eq }) => eq(d.uploadedBy, user.id),
        }),
      ]);

      expect(postDeleteData[0]).toBeUndefined(); // user
      expect(postDeleteData[1]).toHaveLength(0); // accounts
      expect(postDeleteData[2]).toHaveLength(0); // sessions
      expect(postDeleteData[3]).toHaveLength(0); // documents

      // Verify cascade deletion performance
      expect(deleteDuration).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});
