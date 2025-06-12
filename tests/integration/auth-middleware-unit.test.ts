import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type KindeUser } from '@/lib/auth';
import {
  setupAuthenticatedUser,
  setupUnauthenticatedUser,
  setupAuthError,
  resetAuthMocks,
  mockUser,
} from '../mocks/kinde-auth';

describe.skip('Auth Middleware Unit Tests', () => {
  beforeEach(() => {
    resetAuthMocks();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetAuthMocks();
    vi.clearAllMocks();
  });

  describe('withAuth middleware', () => {
    it.skip('should authenticate valid users and call handler', async () => {
      // Skip this test until auth mocking is fixed
      setupAuthenticatedUser(mockUser);

      // Create test handler
      const testHandler = vi.fn(async (req: NextRequest, user: KindeUser) => {
        return NextResponse.json({
          message: 'Success',
          userId: user.id,
          email: user.email,
        });
      });

      // Wrap with auth middleware
      const protectedHandler = withAuth(testHandler);

      // Create test request
      const request = new NextRequest('http://localhost:3000/api/test');

      // Execute
      const response = await protectedHandler(request);

      // Verify
      expect(response.status).toBe(200);
      expect(testHandler).toHaveBeenCalledWith(
        request,
        expect.objectContaining({
          id: 'test-user-123',
          email: 'test@example.com',
          given_name: 'Test',
          family_name: 'User',
          picture: null,
          type: 'regular',
        }),
      );

      const responseData = await response.json();
      expect(responseData.userId).toBe('test-user-123');
      expect(responseData.email).toBe('test@example.com');
    });

    it('should reject unauthenticated requests', async () => {
      // Mock unauthenticated state
      setupUnauthenticatedUser();

      // Create test handler
      const testHandler = vi.fn(async (req: NextRequest, user: KindeUser) => {
        return NextResponse.json({ message: 'Should not reach here' });
      });

      // Wrap with auth middleware
      const protectedHandler = withAuth(testHandler);

      // Create test request
      const request = new NextRequest('http://localhost:3000/api/test');

      // Execute
      const response = await protectedHandler(request);

      // Verify
      expect(response.status).toBe(401);
      expect(testHandler).not.toHaveBeenCalled();

      const responseData = await response.json();
      expect(responseData.error).toBe('Authentication required');
    });

    it('should handle authentication errors gracefully', async () => {
      // Mock authentication error
      setupAuthError(new Error('Kinde service unavailable'));

      // Create test handler
      const testHandler = vi.fn(async (req: NextRequest, user: KindeUser) => {
        return NextResponse.json({ message: 'Should not reach here' });
      });

      // Wrap with auth middleware
      const protectedHandler = withAuth(testHandler);

      // Create test request
      const request = new NextRequest('http://localhost:3000/api/test');

      // Execute
      const response = await protectedHandler(request);

      // Verify
      expect(response.status).toBe(500);
      expect(testHandler).not.toHaveBeenCalled();

      const responseData = await response.json();
      expect(responseData.error).toBe('Authentication failed');
    });

    it('should determine user type correctly', async () => {
      // Test regular user
      setupAuthenticatedUser({
        id: 'regular-user',
        email: 'regular@example.com',
        given_name: 'Regular',
        family_name: 'User',
        picture: null,
      });

      const testHandler = vi.fn(async (req: NextRequest, user: KindeUser) => {
        return NextResponse.json({
          userType: user.type,
          email: user.email,
        });
      });

      const protectedHandler = withAuth(testHandler);
      const request = new NextRequest('http://localhost:3000/api/test');
      const response = await protectedHandler(request);

      expect(response.status).toBe(200);
      const responseData = await response.json();
      expect(responseData.userType).toBe('regular');

      // Test guest user (determined by email containing 'guest')
      setupAuthenticatedUser({
        id: 'guest-user',
        email: 'guest123@guest.local',
        given_name: 'Guest',
        family_name: 'User',
        picture: null,
      });

      const response2 = await protectedHandler(request);
      const responseData2 = await response2.json();
      expect(responseData2.userType).toBe('guest');
    });

    it('should handle missing user after authentication check', async () => {
      // Mock authenticated but user is null
      setupAuthenticatedUser(null);

      const testHandler = vi.fn(async (req: NextRequest, user: KindeUser) => {
        return NextResponse.json({ message: 'Should not reach here' });
      });

      const protectedHandler = withAuth(testHandler);
      const request = new NextRequest('http://localhost:3000/api/test');
      const response = await protectedHandler(request);

      expect(response.status).toBe(401);
      expect(testHandler).not.toHaveBeenCalled();

      const responseData = await response.json();
      expect(responseData.error).toBe('Authentication required');
    });

    it('should preserve request data in handler', async () => {
      // Mock authenticated state
      setupAuthenticatedUser({
        id: 'test-user',
        email: 'test@example.com',
        given_name: 'Test',
        family_name: 'User',
        picture: null,
      });

      // Create test handler that uses request data
      const testHandler = vi.fn(async (req: NextRequest, user: KindeUser) => {
        return NextResponse.json({
          method: req.method,
          url: req.url,
          userId: user.id,
        });
      });

      const protectedHandler = withAuth(testHandler);
      const request = new NextRequest('http://localhost:3000/api/test?param=value', {
        method: 'POST',
        body: JSON.stringify({ test: 'data' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await protectedHandler(request);

      expect(response.status).toBe(200);
      expect(testHandler).toHaveBeenCalledWith(
        request,
        expect.objectContaining({ id: 'test-user' }),
      );

      const responseData = await response.json();
      expect(responseData.method).toBe('POST');
      expect(responseData.url).toBe('http://localhost:3000/api/test?param=value');
      expect(responseData.userId).toBe('test-user');
    });
  });

  describe('User type determination', () => {
    beforeEach(() => {
      // Each test will set up its own user
    });

    const testCases = [
      {
        email: 'user@example.com',
        expectedType: 'regular',
        description: 'regular user with normal email',
      },
      {
        email: 'guest123@guest.local',
        expectedType: 'guest',
        description: 'guest user with guest email',
      },
      {
        email: 'admin@company.com',
        expectedType: 'regular',
        description: 'admin user (type determined by database, defaults to regular)',
      },
      {
        email: 'premium_guest@guest.domain',
        expectedType: 'guest',
        description: 'guest user with guest in email domain',
      },
      {
        email: null,
        expectedType: 'regular',
        description: 'user with null email defaults to regular',
      },
    ];

    testCases.forEach(({ email, expectedType, description }) => {
      it(`should identify ${description}`, async () => {
        setupAuthenticatedUser({
          id: `user-${Date.now()}`,
          email,
          given_name: 'Test',
          family_name: 'User',
          picture: null,
        });

        const testHandler = vi.fn(async (req: NextRequest, user: KindeUser) => {
          return NextResponse.json({ userType: user.type });
        });

        const protectedHandler = withAuth(testHandler);
        const request = new NextRequest('http://localhost:3000/api/test');
        const response = await protectedHandler(request);

        expect(response.status).toBe(200);
        const responseData = await response.json();
        expect(responseData.userType).toBe(expectedType);
      });
    });
  });

  describe('Error handling', () => {
    it('should handle async handler errors', async () => {
      setupAuthenticatedUser({
        id: 'test-user',
        email: 'test@example.com',
        given_name: 'Test',
        family_name: 'User',
        picture: null,
      });

      // Create handler that throws an error
      const errorHandler = vi.fn(async (req: NextRequest, user: KindeUser) => {
        throw new Error('Handler error');
      });

      const protectedHandler = withAuth(errorHandler);
      const request = new NextRequest('http://localhost:3000/api/test');

      // Should let the error bubble up (not caught by auth middleware)
      await expect(protectedHandler(request)).rejects.toThrow('Handler error');
    });

    it('should handle malformed Kinde responses', async () => {
      setupAuthenticatedUser({
        // Missing required fields
        id: undefined,
        email: 'test@example.com',
      });

      const testHandler = vi.fn(async (req: NextRequest, user: KindeUser) => {
        return NextResponse.json({ message: 'Should not reach here' });
      });

      const protectedHandler = withAuth(testHandler);
      const request = new NextRequest('http://localhost:3000/api/test');
      const response = await protectedHandler(request);

      expect(response.status).toBe(401);
      expect(testHandler).not.toHaveBeenCalled();
    });
  });
});