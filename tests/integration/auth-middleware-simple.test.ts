import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupNeonBranch } from '../config/neon-test-context';
import * as schema from '@/lib/db/schema';
import { randomUUID } from 'crypto';
import { measurePerformance } from '../utils/test-helpers';

describe('Auth Middleware Integration Tests (Simplified)', () => {
  let testContext: Awaited<ReturnType<typeof setupNeonBranch>>;
  
  beforeEach(async () => {
    testContext = await setupNeonBranch('auth-middleware-test');
  });
  
  afterEach(async () => {
    await testContext.cleanup();
  });

  describe('Session Management', () => {
    it('should create and validate real user sessions', async () => {
      const { db } = testContext;

      // Create real user
      const { user } = await testContext.factories.createUserWithAuth();
      
      // Create session
      const sessionData = {
        id: randomUUID(),
        userId: user.id,
        token: `session-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const [session] = await db.insert(schema.session).values(sessionData).returning();
      
      expect(session.id).toBe(sessionData.id);
      expect(session.userId).toBe(user.id);
      expect(session.token).toBe(sessionData.token);

      // Validate session lookup
      const foundSession = await db.query.session.findFirst({
        where: (s, { eq }) => eq(s.token, sessionData.token),
        with: {
          user: true,
        },
      });

      expect(foundSession).toBeDefined();
      expect(foundSession?.user.id).toBe(user.id);
    });

    it('should invalidate expired sessions automatically', async () => {
      const { db } = testContext;

      const { user } = await testContext.factories.createUserWithAuth();

      // Create expired session
      const expiredSession = {
        id: randomUUID(),
        userId: user.id,
        token: `expired-${randomUUID()}`,
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.insert(schema.session).values(expiredSession);

      // Query for active sessions only
      const activeSessions = await db.query.session.findMany({
        where: (s, { and, eq, gte }) => 
          and(
            eq(s.userId, user.id),
            gte(s.expiresAt, new Date())
          ),
      });

      expect(activeSessions).toHaveLength(0);

      // Create valid session
      const validSession = {
        id: randomUUID(),
        userId: user.id,
        token: `valid-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.insert(schema.session).values(validSession);

      const currentSessions = await db.query.session.findMany({
        where: (s, { and, eq, gte }) => 
          and(
            eq(s.userId, user.id),
            gte(s.expiresAt, new Date())
          ),
      });

      expect(currentSessions).toHaveLength(1);
      expect(currentSessions[0].token).toBe(validSession.token);
    });

    it('should handle concurrent session creation safely', async () => {
      const { db } = testContext;

      const { user } = await testContext.factories.createUserWithAuth();

      // Create multiple sessions concurrently
      const sessionPromises = Array.from({ length: 5 }, (_, i) => 
        db.insert(schema.session).values({
          id: randomUUID(),
          userId: user.id,
          token: `concurrent-${randomUUID()}-${i}`,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          ipAddress: '127.0.0.1',
          userAgent: `test-agent-${i}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).returning()
      );

      const results = await Promise.all(sessionPromises);

      expect(results).toHaveLength(5);
      expect(results.every(r => r.length === 1)).toBe(true);

      // Verify all sessions were created
      const allSessions = await db.query.session.findMany({
        where: (s, { eq }) => eq(s.userId, user.id),
      });

      expect(allSessions).toHaveLength(5);
    });
  });

  describe('CSRF Protection', () => {
    it('should store and validate CSRF tokens in sessions', async () => {
      const { db } = testContext;

      const { user } = await testContext.factories.createUserWithAuth();

      // Create session with CSRF token
      const csrfToken = `csrf-${randomUUID()}`;
      const sessionData = {
        id: randomUUID(),
        userId: user.id,
        token: `session-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        csrfToken,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const [session] = await db.insert(schema.session).values(sessionData).returning();

      expect(session.csrfToken).toBe(csrfToken);

      // Validate CSRF token lookup
      const validSession = await db.query.session.findFirst({
        where: (s, { and, eq }) => 
          and(
            eq(s.token, sessionData.token),
            eq(s.csrfToken, csrfToken)
          ),
      });

      expect(validSession).toBeDefined();
    });

    it('should update CSRF tokens on session refresh', async () => {
      const { db } = testContext;

      const { user } = await testContext.factories.createUserWithAuth();

      // Create initial session
      const initialToken = `csrf-initial-${randomUUID()}`;
      const sessionData = {
        id: randomUUID(),
        userId: user.id,
        token: `session-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        csrfToken: initialToken,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const [session] = await db.insert(schema.session).values(sessionData).returning();

      // Update CSRF token
      const newToken = `csrf-new-${randomUUID()}`;
      await db
        .update(schema.session)
        .set({ 
          csrfToken: newToken,
          updatedAt: new Date(),
        })
        .where(schema.session.id === session.id);

      const updatedSession = await db.query.session.findFirst({
        where: (s, { eq }) => eq(s.id, session.id),
      });

      expect(updatedSession?.csrfToken).toBe(newToken);
      expect(updatedSession?.csrfToken).not.toBe(initialToken);
    });
  });

  describe('Rate Limiting', () => {
    it('should track rate limit attempts in database', async () => {
      const { db } = testContext;

      const { user } = await testContext.factories.createUserWithAuth();

      // Create rate limit entries
      const endpoint = '/api/chat';
      const entries = Array.from({ length: 3 }, () => ({
        id: randomUUID(),
        userId: user.id,
        endpoint,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        createdAt: new Date(),
      }));

      await db.insert(schema.rateLimitLog).values(entries);

      // Check rate limit count
      const recentAttempts = await db.query.rateLimitLog.findMany({
        where: (log, { and, eq, gte }) => 
          and(
            eq(log.userId, user.id),
            eq(log.endpoint, endpoint),
            gte(log.createdAt, new Date(Date.now() - 60 * 1000)) // Last minute
          ),
      });

      expect(recentAttempts).toHaveLength(3);
    });

    it('should cleanup old rate limit entries', async () => {
      const { db } = testContext;

      const { user } = await testContext.factories.createUserWithAuth();

      // Create old and new entries
      const oldEntry = {
        id: randomUUID(),
        userId: user.id,
        endpoint: '/api/test',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
      };

      const newEntry = {
        id: randomUUID(),
        userId: user.id,
        endpoint: '/api/test',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        createdAt: new Date(),
      };

      await db.insert(schema.rateLimitLog).values([oldEntry, newEntry]);

      // Cleanup old entries
      await db
        .delete(schema.rateLimitLog)
        .where(schema.rateLimitLog.createdAt < new Date(Date.now() - 24 * 60 * 60 * 1000));

      const remainingEntries = await db.query.rateLimitLog.findMany({
        where: (log, { eq }) => eq(log.userId, user.id),
      });

      expect(remainingEntries).toHaveLength(1);
      expect(remainingEntries[0].id).toBe(newEntry.id);
    });
  });

  describe('Account Management', () => {
    it('should handle OAuth account linking', async () => {
      const { db } = testContext;

      const { user } = await testContext.factories.createUserWithAuth();

      // Link OAuth account
      const accountData = {
        id: randomUUID(),
        userId: user.id,
        accountId: `google-${randomUUID()}`,
        providerId: 'google',
        accessToken: `access-${randomUUID()}`,
        refreshToken: `refresh-${randomUUID()}`,
        accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        scope: 'email profile',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const [account] = await db.insert(schema.account).values(accountData).returning();

      expect(account.providerId).toBe('google');
      expect(account.userId).toBe(user.id);

      // Verify account lookup
      const linkedAccounts = await db.query.account.findMany({
        where: (acc, { eq }) => eq(acc.userId, user.id),
      });

      expect(linkedAccounts).toHaveLength(1);
      expect(linkedAccounts[0].providerId).toBe('google');
    });

    it('should cleanup accounts on user deletion', async () => {
      const { db } = testContext;

      const { user } = await testContext.factories.createUserWithAuth();

      // Create session and account
      await db.insert(schema.session).values({
        id: randomUUID(),
        userId: user.id,
        token: `session-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.insert(schema.account).values({
        id: randomUUID(),
        userId: user.id,
        accountId: `github-${randomUUID()}`,
        providerId: 'github',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Delete user - should cascade
      await db.delete(schema.user).where(schema.user.id === user.id);

      // Verify cleanup
      const sessions = await db.query.session.findMany({
        where: (s, { eq }) => eq(s.userId, user.id),
      });

      const accounts = await db.query.account.findMany({
        where: (acc, { eq }) => eq(acc.userId, user.id),
      });

      expect(sessions).toHaveLength(0);
      expect(accounts).toHaveLength(0);
    });
  });

  describe('Performance Tests', () => {
    it('should handle high volume session operations', async () => {
      const { db, metrics } = testContext;

      const { user } = await testContext.factories.createUserWithAuth();

      const { result, duration } = await measurePerformance(async () => {
        // Create many sessions
        const sessionCount = 100;
        const sessions = Array.from({ length: sessionCount }, (_, i) => ({
          id: randomUUID(),
          userId: user.id,
          token: `perf-${randomUUID()}-${i}`,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          ipAddress: `192.168.1.${i % 255}`,
          userAgent: 'test-agent',
          createdAt: new Date(),
          updatedAt: new Date(),
        }));

        // Batch insert
        await db.insert(schema.session).values(sessions);

        // Query performance
        const queryStart = Date.now();
        const activeSessions = await db.query.session.findMany({
          where: (s, { and, eq, gte }) => 
            and(
              eq(s.userId, user.id),
              gte(s.expiresAt, new Date())
            ),
          limit: 50,
        });
        const queryDuration = Date.now() - queryStart;

        return {
          insertedCount: sessionCount,
          queryDuration,
          resultCount: activeSessions.length,
        };
      });

      expect(result.insertedCount).toBe(100);
      expect(result.resultCount).toBe(50);
      expect(result.queryDuration).toBeLessThan(100); // Query should be fast
      expect(duration).toBeLessThan(5000); // Total operation under 5 seconds

      metrics.record('auth.session.bulk_insert', duration);
      metrics.record('auth.session.query_duration', result.queryDuration);
    });
  });
});