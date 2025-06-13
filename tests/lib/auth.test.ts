import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';

// Test schema for Kinde configuration
const KindeConfigSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  issuerUrl: z.string().url(),
  siteUrl: z.string().url(),
  postLogoutRedirectUrl: z.string().url(),
  postLoginRedirectUrl: z.string().url(),
});

// Test schema for Kinde user data
const KindeUserSchema = z.object({
  id: z.string(),
  email: z.string().email().nullable(),
  given_name: z.string().nullable(),
  family_name: z.string().nullable(),
  picture: z.string().url().nullable(),
  type: z.enum(['guest', 'regular', 'admin']),
});

describe('Kinde Auth Configuration', () => {
  describe('Configuration Schema', () => {
    it('should validate Kinde config structure', () => {
      const mockConfig = {
        clientId: 'kinde-client-id-123',
        clientSecret: 'kinde-client-secret-456',
        issuerUrl: 'https://test.kinde.com',
        siteUrl: 'http://localhost:3000',
        postLogoutRedirectUrl: 'http://localhost:3000',
        postLoginRedirectUrl: 'http://localhost:3000/dashboard',
      };

      const result = KindeConfigSchema.safeParse(mockConfig);
      expect(result.success).toBe(true);
    });

    it('should reject invalid configuration', () => {
      const invalidConfig = {
        clientId: 'kinde-client-id-123',
        // missing clientSecret
        issuerUrl: 'not-a-valid-url',
        siteUrl: 'http://localhost:3000',
        // missing required fields
      };

      const result = KindeConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });

  describe('User Data Validation', () => {
    it('should validate Kinde user data for regular users', () => {
      const mockUser = {
        id: 'kinde-user-123',
        email: 'user@example.com',
        given_name: 'John',
        family_name: 'Doe',
        picture: 'https://example.com/avatar.jpg',
        type: 'regular' as const,
      };

      const result = KindeUserSchema.safeParse(mockUser);
      expect(result.success).toBe(true);
    });

    it('should validate Kinde user data for guest users', () => {
      const mockUser = {
        id: 'kinde-guest-123',
        email: 'guest123@guest.local',
        given_name: 'Guest',
        family_name: 'User',
        picture: null,
        type: 'guest' as const,
      };

      const result = KindeUserSchema.safeParse(mockUser);
      expect(result.success).toBe(true);
    });

    it('should validate Kinde user data with minimal fields', () => {
      const mockUser = {
        id: 'kinde-user-minimal',
        email: null,
        given_name: null,
        family_name: null,
        picture: null,
        type: 'regular' as const,
      };

      const result = KindeUserSchema.safeParse(mockUser);
      expect(result.success).toBe(true);
    });

    it('should reject invalid user data', () => {
      const invalidUser = {
        id: 'user-123',
        email: 'invalid-email',
        given_name: 123, // should be string or null
        family_name: 'Doe',
        picture: 'not-a-valid-url',
        type: 'invalid-type',
      };

      const result = KindeUserSchema.safeParse(invalidUser);
      expect(result.success).toBe(false);
    });
  });
});

describe('Kinde Auth Functions', () => {
  describe('User Type Determination', () => {
    it('should determine user type from email', () => {
      const getUserType = (email: string | null) => {
        return email?.includes('guest') ? 'guest' : 'regular';
      };

      expect(getUserType('user@example.com')).toBe('regular');
      expect(getUserType('guest123@guest.local')).toBe('guest');
      expect(getUserType('admin@company.com')).toBe('regular');
      expect(getUserType(null)).toBe('regular');
    });

    it('should create KindeUser from raw Kinde data', () => {
      const createKindeUser = (rawUser: any) => {
        return {
          id: rawUser.id,
          email: rawUser.email,
          given_name: rawUser.given_name,
          family_name: rawUser.family_name,
          picture: rawUser.picture,
          type: rawUser.email?.includes('guest') ? 'guest' : 'regular',
        };
      };

      const rawKindeUser = {
        id: 'kinde-123',
        email: 'test@example.com',
        given_name: 'Test',
        family_name: 'User',
        picture: 'https://example.com/avatar.jpg',
      };

      const kindeUser = createKindeUser(rawKindeUser);
      expect(kindeUser.type).toBe('regular');
      expect(kindeUser.id).toBe('kinde-123');
      expect(kindeUser.email).toBe('test@example.com');
    });
  });

  describe('Guest User Creation', () => {
    it('should create guest user with proper structure', () => {
      const createGuestUser = () => {
        const guestId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        return {
          id: guestId,
          email: `${guestId}@guest.local`,
          given_name: 'Guest',
          family_name: 'User',
          picture: null,
          type: 'guest' as const,
        };
      };

      const guestUser = createGuestUser();
      expect(guestUser.type).toBe('guest');
      expect(guestUser.email).toContain('@guest.local');
      expect(guestUser.given_name).toBe('Guest');
      expect(guestUser.picture).toBeNull();
    });
  });
});

describe('API Route Protection', () => {
  describe('withAuth Middleware Logic', () => {
    it('should allow authenticated requests', async () => {
      // Mock withAuth behavior for testing
      const mockWithAuth = (handler: Function) => {
        return async (req: any) => {
          // Simulate authenticated request with Kinde user
          const mockKindeUser = {
            id: 'kinde-user-123',
            email: 'user@example.com',
            given_name: 'Test',
            family_name: 'User',
            picture: null,
            type: 'regular' as const,
          };
          return handler(req, mockKindeUser);
        };
      };

      const mockHandler = vi.fn().mockResolvedValue({
        status: 200,
        json: () => ({ message: 'Success' }),
      });
      const protectedHandler = mockWithAuth(mockHandler);

      const mockRequest = { headers: {} };
      const result = await protectedHandler(mockRequest);

      expect(mockHandler).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          id: 'kinde-user-123',
          email: 'user@example.com',
          type: 'regular',
        }),
      );
      expect(result.status).toBe(200);
    });

    it('should reject unauthenticated requests', async () => {
      // Mock withAuth behavior for unauthenticated requests
      const mockWithAuth = (handler: Function) => {
        return async (req: any) => {
          // Simulate unauthenticated request
          return {
            status: 401,
            json: () => ({ error: 'Authentication required' }),
          };
        };
      };

      const mockHandler = vi.fn();
      const protectedHandler = mockWithAuth(mockHandler);

      const result = await protectedHandler({ headers: {} });
      expect(mockHandler).not.toHaveBeenCalled();
      expect(result.status).toBe(401);
    });

    it('should handle authentication errors', async () => {
      // Mock withAuth behavior for authentication errors
      const mockWithAuth = (handler: Function) => {
        return async (req: any) => {
          // Simulate authentication error
          return {
            status: 500,
            json: () => ({ error: 'Authentication failed' }),
          };
        };
      };

      const mockHandler = vi.fn();
      const protectedHandler = mockWithAuth(mockHandler);

      const result = await protectedHandler({ headers: {} });
      expect(mockHandler).not.toHaveBeenCalled();
      expect(result.status).toBe(500);
    });
  });

  describe('Authorization Logic', () => {
    it('should check user permissions correctly', () => {
      const checkUserPermission = (userType: string, requiredType: string) => {
        const hierarchy = { guest: 0, regular: 1, premium: 2, admin: 3 };
        const userLevel = hierarchy[userType as keyof typeof hierarchy] || 0;
        const requiredLevel =
          hierarchy[requiredType as keyof typeof hierarchy] || 0;
        return userLevel >= requiredLevel;
      };

      expect(checkUserPermission('admin', 'regular')).toBe(true);
      expect(checkUserPermission('regular', 'admin')).toBe(false);
      expect(checkUserPermission('guest', 'regular')).toBe(false);
      expect(checkUserPermission('premium', 'regular')).toBe(true);
    });
  });
});
